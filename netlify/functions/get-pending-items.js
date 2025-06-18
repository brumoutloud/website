const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const fetchEvents = base('Events').select({
            filterByFormula: "{Status} = 'Pending Review'",
            // **FIX:** Added 'Contact Email' to the list of fields to fetch.
            fields: ["Event Name", "Description", "VenueText", "Contact Email"]
        }).all();

        const fetchVenues = base('Venues').select({
            filterByFormula: "{Status} = 'Pending Review'",
            // **FIX:** Added 'Contact Email' to the list of fields to fetch.
            fields: ["Name", "Description", "Address", "Contact Email"]
        }).all();

        const [eventRecords, venueRecords] = await Promise.all([fetchEvents, fetchVenues]);

        const pendingItems = [];

        eventRecords.forEach(record => {
            pendingItems.push({
                id: record.id,
                type: 'Event',
                name: record.get('Event Name'),
                description: record.get('Description'),
                location: record.get('VenueText'),
                contactEmail: record.get('Contact Email') // Now included
            });
        });

        venueRecords.forEach(record => {
            pendingItems.push({
                id: record.id,
                type: 'Venue',
                name: record.get('Name'),
                description: record.get('Description'),
                location: record.get('Address'),
                contactEmail: record.get('Contact Email') // Now included
            });
        });

        return {
            statusCode: 200,
            body: JSON.stringify(pendingItems),
        };

    } catch (error) {
        console.error("Error fetching pending items:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch pending items' }),
        };
    }
};
