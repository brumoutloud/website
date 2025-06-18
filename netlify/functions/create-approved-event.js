const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');
const venuesTable = base('Venues');

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

        // **FIX:** The record now includes all the new optional fields.
        const newRecord = {
            'Event Name': eventData.name,
            'Description': eventData.description || '',
            'VenueText': eventData.venue || '',
            'Date': `${eventData.date}T${eventData.time || '00:00'}:00.000Z`,
            'Status': 'Approved' // Directly approved
        };

        if (venueRecordId) newRecord['Venue'] = [venueRecordId];
        if (eventData.ticketLink) newRecord['Link'] = eventData.ticketLink;
        if (eventData.parentEventName) newRecord['Parent Event Name'] = eventData.parentEventName;
        if (eventData.categories && eventData.categories.length > 0) newRecord['Category'] = eventData.categories.split(',');
        
        // Note: Image upload from this form is not implemented yet, but can be added.

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
