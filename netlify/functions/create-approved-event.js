const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');
const fetch = require('node-fetch');
const cloudinary = require('cloudinary').v2;
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
        });
    }
} catch (error) {
    console.error("Firebase Admin Initialization Error:", error);
}
const db = admin.firestore();

// Helper to get Gemini model name from Firestore
async function getGeminiModelName() {
    try {
        const doc = await db.collection('settings').doc('gemini').get();
        if (doc.exists && doc.data().modelName) {
            return doc.data().modelName;
        }
    } catch (error) {
        console.error("Error fetching Gemini model from Firestore:", error);
    }
    return 'gemini-2.5-flash';
}


const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');
const venuesTable = base('Venues');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function findVenueRecordId(venueName) {
    if (!venueName) return null;
    try {
        const records = await venuesTable.select({
            filterByFormula: `LOWER({Name}) = LOWER("${venueName.replace(/"/g, '\\"')}")`,
            maxRecords: 1
        }).firstPage();
        return records.length > 0 ? records[0].id : null;
    } catch (error) {
        console.error(`Error finding venue "${venueName}":`, error);
        return null;
    }
}

async function uploadImage(file) {
    if (!file || !file.content) return null;
    try {
        const base64String = file.content.toString('base64');
        const dataUri = `data:${file.contentType};base64,${base64String}`;
        const result = await cloudinary.uploader.upload(dataUri, { folder: 'brumoutloud_events' });
        return { url: result.secure_url };
    } catch (error) {
        console.error("Error uploading to Cloudinary:", error);
        return null;
    }
}

async function getDatesFromAI(startDate, recurringInfo, modelName) {
    console.log(`[getDatesFromAI] INPUT - startDate: "${startDate}", recurringInfo: "${recurringInfo}"`);
    
    if (!GEMINI_API_KEY) return [startDate];
    const prompt = `Based on a start date of ${startDate} and the recurrence rule "${recurringInfo}", provide a comma-separated list of all dates for the next 3 months in format<y_bin_413>-MM-DD. IMPORTANT: Only return the comma-separated list of dates and nothing else.`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
    
    try {
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) {
            console.error(`[getDatesFromAI] AI request failed with status: ${response.status}`);
            return [startDate];
        }
        const result = await response.json();
        const textResponse = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        console.log(`[getDatesFromAI] RAW AI RESPONSE: "${textResponse}"`);
        
        if (!textResponse) {
            console.log("[getDatesFromAI] AI returned no text response. Falling back to start date.");
            return [startDate];
        }

        const dateRegex = /\d{4}-\d{2}-\d{2}/g;
        const dates = textResponse.match(dateRegex);

        const finalDates = dates && dates.length > 0 ? dates : [startDate];
        console.log(`[getDatesFromAI] PARSED DATES:`, finalDates);

        return finalDates;
    } catch (error) {
        console.error("[getDatesFromAI] Error calling AI for dates:", error);
        return [startDate];
    }
}


exports.handler = async function (event, context) {
    const geminiModel = await getGeminiModelName();
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const eventData = await parser.parse(event);
        
        const venueRecordId = await findVenueRecordId(eventData.VenueText || eventData.venue);
        const promoImageFile = eventData.files.find(f => f.fieldname === 'promoImage');
        const uploadedImage = await uploadImage(promoImageFile);
        
        let datesToCreate = [];
        const recurringInfoText = eventData['Recurring Info'] || eventData.recurringInfo || null;
        const startDate = eventData.date;
        const eventName = eventData['Event Name'] || eventData.name;

        if (recurringInfoText && recurringInfoText.trim() !== '' && startDate) {
            datesToCreate = await getDatesFromAI(startDate, recurringInfoText, geminiModel);
        } else if (startDate) {
            datesToCreate.push(startDate);
        } else {
             throw new Error("Date is a required field for event creation.");
        }

        const recordsToCreate = datesToCreate.map((date, index) => {
            const fields = {
                'Event Name': eventName,
                'Description': eventData.Description || eventData.description || '',
                'VenueText': eventData.VenueText || eventData.venue || '',
                'Date': `${date}T${eventData.time || '00:00'}:00.000Z`,
                'Status': 'Approved'
            };

            if (venueRecordId) fields['Venue'] = [venueRecordId];
            
            const ticketLink = eventData.Link || eventData.ticketLink;
            if (ticketLink) fields['Link'] = ticketLink;
            
            const parentEventName = eventData['Parent Event Name'] || eventData.parentEventName;
            if (parentEventName) fields['Parent Event Name'] = parentEventName;

            const recurringInfo = eventData['Recurring Info'] || eventData.recurringInfo;
            if (recurringInfo && index === 0) fields['Recurring Info'] = recurringInfo;
            
            const categories = eventData.Category || eventData.categories;
            if (categories && Array.isArray(categories)) fields['Category'] = categories;
            
            if (uploadedImage) fields['Promo Image'] = [{ url: uploadedImage.url }];
            
            return { fields };
        });

        const chunkSize = 10;
        for (let i = 0; i < recordsToCreate.length; i += chunkSize) {
            await eventsTable.create(recordsToCreate.slice(i, i + chunkSize));
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `Successfully created ${recordsToCreate.length} event(s) for "${eventName}".` }),
        };

    } catch (error) {
        console.error("Error creating approved event:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
