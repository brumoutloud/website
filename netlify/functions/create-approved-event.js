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
    if (!GEMINI_API_KEY) return [startDate];
    const prompt = `Based on a start date of ${startDate} and the recurrence rule "${recurringInfo}", provide a comma-separated list of all dates for the next 3 months in format<y_bin_413>-MM-DD. IMPORTANT: Only return the comma-separated list of dates and nothing else.`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
    
    try {
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) return [startDate];
        const result = await response.json();
        const textResponse = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!textResponse) return [startDate];

        const dateRegex = /\d{4}-\d{2}-\d{2}/g;
        const dates = textResponse.match(dateRegex);

        return dates && dates.length > 0 ? dates : [startDate];
    } catch (error) {
        console.error("Error calling AI for dates:", error);
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
        
        const venueRecordId = await findVenueRecordId(eventData.venue);
        const promoImageFile = eventData.files.find(f => f.fieldname === 'promoImage');
        const uploadedImage = await uploadImage(promoImageFile);
        
        let datesToCreate = [];
        const recurringInfoText = eventData.recurringInfo || null;

        if (recurringInfoText && recurringInfoText.trim() !== '') {
            datesToCreate = await getDatesFromAI(eventData.date, recurringInfoText, geminiModel);
        } else {
            datesToCreate.push(eventData.date);
        }

        const recordsToCreate = datesToCreate.map((date, index) => {
            const fields = {
                'Event Name': eventData.name,
                'Description': eventData.description || '',
                'VenueText': eventData.venue || '',
                'Date': `${date}T${eventData.time || '00:00'}:00.000Z`,
                'Status': 'Pending Review'
            };

            if (venueRecordId) fields['Venue'] = [venueRecordId];
            if (eventData.ticketLink) fields['Link'] = eventData.ticketLink;
            if (eventData.parentEventName) fields['Parent Event Name'] = eventData.parentEventName;
            if (eventData.recurringInfo) fields['Recurring Info'] = eventData.recurringInfo;
            if (eventData.categories && Array.isArray(eventData.categories)) fields['Category'] = eventData.categories;
            if (uploadedImage) fields['Promo Image'] = [{ url: uploadedImage.url }];
            
            return { fields };
        });

        const chunkSize = 10;
        for (let i = 0; i < recordsToCreate.length; i += chunkSize) {
            await eventsTable.create(recordsToCreate.slice(i, i + chunkSize));
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `Successfully created ${recordsToCreate.length} event(s) for "${eventData.name}".` }),
        };

    } catch (error) {
        console.error("Error creating approved event:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
