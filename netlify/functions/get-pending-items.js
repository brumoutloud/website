const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        console.log("Step 1: Starting function execution.");

        const eventQuery = base('Events').select({
            filterByFormula: "{Status} = 'Pending Review'"
        });
        console.log("Step 2: Created query for Events.");

        const venueQuery = base('Venues').select({
            filterByFormula: "{Status} = 'Pending Review'"
        });
        console.log("Step 3: Created query for Venues.");

        console.log("Step 4: Fetching all records from Airtable...");
        const [eventRecords, venueRecords] = await Promise.all([
            eventQuery.all(),
            venueQuery.all()
        ]);
        console.log(`Step 5: Fetched data successfully. Found ${eventRecords.length} events and ${venueRecords.length} venues.`);

        const pendingItems = [];

        eventRecords.forEach(record => {
            pendingItems.push({
                id: record.id,
                type: 'Event',
                name: record.get('Event Name') || 'No Name',
                description: record.get('Description'),
                location: record.get('VenueText'),
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
        
        console.log("Step 6: Processed all records. Returning data.");

        return {
            statusCode: 200,
            body: JSON.stringify(pendingItems),
        };

    } catch (error) {
        console.error("!!! CRITICAL ERROR fetching pending items:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch pending items', details: error.message }),
        };
    }
};
