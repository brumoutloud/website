const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');
const cloudinary = require('cloudinary').v2;

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');
const venuesTable = base('Venues');

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


exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const eventData = await parser.parse(event);
        const promoImageFile = eventData.files.find(f => f.fieldname === 'promoImage');
        
        const venueRecordId = await findVenueRecordId(eventData.venue);
        const uploadedImage = await uploadImage(promoImageFile);

        const newRecord = {
            'Event Name': eventData.name,
            'Description': eventData.description || '',
            'VenueText': eventData.venue || '',
            'Date': `${eventData.date}T${eventData.time || '00:00'}:00.000Z`,
            'Status': 'Approved'
        };

        if (venueRecordId) newRecord['Venue'] = [venueRecordId];
        if (eventData.ticketLink) newRecord['Link'] = eventData.ticketLink;
        if (eventData.parentEventName) newRecord['Parent Event Name'] = eventData.parentEventName;
        if (eventData.recurringInfo) newRecord['Recurring Info'] = eventData.recurringInfo;
        if (eventData.categories && eventData.categories.length > 0) newRecord['Category'] = eventData.categories.split(',').map(c => c.trim());
        if (uploadedImage) newRecord['Promo Image'] = [{ url: uploadedImage.url }];
        

        await eventsTable.create([{ fields: newRecord }]);
        
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `Event "${eventData.name}" created successfully.` }),
        };

    } catch (error) {
        console.error("Error creating approved event:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
