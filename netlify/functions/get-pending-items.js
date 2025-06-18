const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const fetchEvents = base('Events').select({
            filterByFormula: "{Status} = 'Pending Review'"
        }).all();

        const fetchVenues = base('Venues').select({
            filterByFormula: "{Status} = 'Pending Review'"
        }).all();

        const [eventRecords, venueRecords] = await Promise.all([fetchEvents, fetchVenues]);

        const pendingItems = [];

        eventRecords.forEach(record => {
            pendingItems.push({
                id: record.id,
                type: 'Event',
                name: record.get('Event Name') || 'No Name',
                description: record.get('Description'),
                location: record.get('VenueText'),
                // **FIX**: The script now checks for multiple possible field names for the email.
                contactEmail: record.get('Contact Email') || record.get('email') || record.get('Submitter Email')
            });
        });

        venueRecords.forEach(record => {
            pendingItems.push({
                id: record.id,
                type: 'Venue',
                name: record.get('Name') || 'No Name',
                description: record.get('Description'),
                location: record.get('Address'),
                contactEmail: record.get('Contact Email') || record.get('email') || record.get('Submitter Email')
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
