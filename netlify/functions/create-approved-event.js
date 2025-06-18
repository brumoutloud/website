const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');
const fetch = require('node-fetch');
const cloudinary = require('cloudinary').v2;

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');
const venuesTable = base('Venues');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --- Helper Functions ---
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

// **NEW**: Re-integrated the AI date generation logic
async function getDatesFromAI(eventName, startDate, recurringInfo) {
    if (!GEMINI_API_KEY) {
        console.warn("GEMINI_API_KEY not set. Falling back to single date.");
        return [startDate];
    }
    const prompt = `You are an event scheduling assistant. An event named "${eventName}" starts on ${startDate}. The recurrence rule is: "${recurringInfo}". Generate a list of all future dates for this event for the next 3 months, including the start date. Return a comma-separated list of YYYY-MM-DD strings.`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
    
    try {
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) return [startDate];
        const result = await response.json();
        const textResponse = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        return textResponse ? textResponse.trim().split(',').map(d => d.trim()) : [startDate];
    } catch (error) {
        console.error("Error calling AI for dates:", error);
        return [startDate];
    }
}


exports.handler = async function (event, context) {
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

        // **FIX**: Generate multiple dates if recurring info is provided
        if (recurringInfoText && recurringInfoText.trim() !== '') {
            datesToCreate = await getDatesFromAI(eventData.name, eventData.date, recurringInfoText);
        } else {
            datesToCreate.push(eventData.date);
        }

        const recordsToCreate = datesToCreate.map((date, index) => {
            const fields = {
                'Event Name': eventData.name,
                'Description': eventData.description || '',
                'VenueText': eventData.venue || '',
                'Date': `${date}T${eventData.time || '00:00'}:00.000Z`,
                'Status': 'Approved'
            };

            if (venueRecordId) fields['Venue'] = [venueRecordId];
            if (eventData.ticketLink) fields['Link'] = eventData.ticketLink;
            if (eventData.parentEventName) fields['Parent Event Name'] = eventData.parentEventName;
            if (uploadedImage) fields['Promo Image'] = [{ url: uploadedImage.url }];
            if (index === 0 && recurringInfoText) fields['Recurring Info'] = recurringInfoText;
            
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
