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
    const sanatizedVenueName = venueName.toLowerCase().replace(/"/g, '\\"');
    const formula = `OR(LOWER({Name}) = "${sanatizedVenueName}", FIND("${sanatizedVenueName}", LOWER({Name})), FIND("${sanatizedVenueName}", LOWER({Aliases})))`;
    try {
        const records = await venuesTable.select({ maxRecords: 1, filterByFormula: formula }).firstPage();
        return records.length > 0 ? records[0].id : null;
    } catch (error) {
        console.error("Error finding venue:", error);
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
    let submissionData;
    let promoImageFile = null;
    const isJson = event.headers['content-type'] === 'application/json';

    if (isJson) {
        submissionData = JSON.parse(event.body);
    } else {
        const parsedForm = await parser.parse(event);
        submissionData = {
            name: parsedForm['event-name'],
            venue: parsedForm.venue,
            date: parsedForm.date,
            time: parsedForm['start-time'],
            description: parsedForm.description,
            link: parsedForm.link,
            recurringInfo: parsedForm['recurring-info'],
            contactEmail: parsedForm.email,
        };
        promoImageFile = parsedForm.files.find(f => f.fieldname === 'promo-image');
    }

    try {
        const venueRecordId = await findVenueRecordId(submissionData.venue);
        const uploadedImage = await uploadImage(promoImageFile);
        
        let datesToCreate = [];
        const recurringInfoText = submissionData.recurringInfo || null;

        if (recurringInfoText && recurringInfoText.trim() !== '') {
            datesToCreate = await getDatesFromAI(submissionData.date, recurringInfoText, geminiModel);
        } else {
            datesToCreate.push(submissionData.date);
        }

        const recordsToCreate = datesToCreate.map((date, index) => {
            const fields = {
                'Event Name': submissionData.name,
                'Description': submissionData.description || '',
                'VenueText': submissionData.venue || '',
                'Date': `${date}T${submissionData.time || '00:00'}:00.000Z`,
                'Link': submissionData.link || '',
                'Submitter Email': submissionData.contactEmail || '',
                'Status': 'Pending Review'
            };

            if (venueRecordId) fields.Venue = [venueRecordId];
            if (uploadedImage) fields['Promo Image'] = [{ url: uploadedImage.url }];
            if (recurringInfoText) {
                fields['Parent Event Name'] = submissionData.name;
                if (index === 0) fields['Recurring Info'] = recurringInfoText;
            }
            return { fields };
        });

        const chunkSize = 10;
        for (let i = 0; i < recordsToCreate.length; i += chunkSize) {
            await eventsTable.create(recordsToCreate.slice(i, i + chunkSize));
        }

        if (isJson) {
            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        } else {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'text/html' },
                body: `<!DOCTYPE html><html><head><title>Success</title><meta http-equiv="refresh" content="3;url=/events.html"></head><body style="font-family: sans-serif; text-align: center; padding-top: 50px;"><h1>Thank you!</h1><p>Your event has been submitted for review.</p><p>You will be redirected shortly.</p></body></html>`
            };
        }
    } catch (error) {
        console.error("Error processing event submission:", error);
        return { statusCode: 500, body: `Error: ${error.toString()}` };
    }
};
