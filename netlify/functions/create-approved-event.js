const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');
const venuesTable = base('Venues');

// Helper to find a venue record ID from a name
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

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const eventData = JSON.parse(event.body);

        const venueRecordId = await findVenueRecordId(eventData.venue);

        const newRecord = {
            'Event Name': eventData.name,
            'Description': eventData.description || '',
            'VenueText': eventData.venue || '',
            'Date': `${eventData.date}T${eventData.time || '00:00'}:00.000Z`,
            'Status': 'Approved' // Set status to Approved directly
        };

        if (venueRecordId) {
            newRecord['Venue'] = [venueRecordId];
        }

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
