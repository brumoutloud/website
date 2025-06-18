const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const fetchEvents = base('Events').select({
            filterByFormula: "{Status} = 'Pending Review'",
            fields: ["Event Name", "Description", "VenueText"] // Fetch fields needed for review
        }).all();

        const fetchVenues = base('Venues').select({
            filterByFormula: "{Status} = 'Pending Review'",
            fields: ["Name", "Description", "Address"] // Fetch fields needed for review
        }).all();

        const [eventRecords, venueRecords] = await Promise.all([fetchEvents, fetchVenues]);

        const pendingItems = [];

        eventRecords.forEach(record => {
            pendingItems.push({
                id: record.id,
                type: 'Event',
                name: record.get('Event Name'),
                description: record.get('Description'),
                location: record.get('VenueText')
            });
        });

        venueRecords.forEach(record => {
            pendingItems.push({
                id: record.id,
                type: 'Venue',
                name: record.get('Name'),
                description: record.get('Description'),
                location: record.get('Address')
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
