const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

// This function fetches all records from a table using pagination to avoid timeouts.
async function fetchAllRecords(tableName) {
    const allRecords = [];
    try {
        await base(tableName).select({
            filterByFormula: "{Status} = 'Pending Review'"
        }).eachPage((records, fetchNextPage) => {
            records.forEach(record => allRecords.push(record));
            fetchNextPage();
        });
        return allRecords;
    } catch (error) {
        console.error(`Error fetching records from ${tableName}:`, error);
        throw error; // Re-throw the error to be caught by the main handler
    }
}

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        console.log("Starting function execution using paginated fetch.");

        // **FIX:** Using the new paginated fetch function to avoid timeouts.
        const [eventRecords, venueRecords] = await Promise.all([
            fetchAllRecords('Events'),
            fetchAllRecords('Venues')
        ]);
        
        console.log(`Fetched data successfully. Found ${eventRecords.length} events and ${venueRecords.length} venues.`);

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
        
        console.log("Processed all records. Returning data.");

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
