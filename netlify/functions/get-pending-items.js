const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

// This function fetches all records from a table using pagination to avoid timeouts.
async function fetchAllRecords(tableName) {
    const allRecords = [];
    let pageCount = 0;
    console.log(`[${tableName}] Starting paginated fetch...`);
    try {
        await base(tableName).select({
            filterByFormula: "{Status} = 'Pending Review'"
        }).eachPage((records, fetchNextPage) => {
            pageCount++;
            console.log(`[${tableName}] Fetched page ${pageCount} with ${records.length} records.`);
            records.forEach(record => allRecords.push(record));
            fetchNextPage();
        });
        console.log(`[${tableName}] Finished paginated fetch. Total pages: ${pageCount}, Total records: ${allRecords.length}`);
        return allRecords;
    } catch (error) {
        console.error(`[${tableName}] Error during pagination:`, error);
        throw error; // Re-throw to be caught by the main handler
    }
}

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        console.log("Starting function execution using paginated fetch.");

        const [eventRecords, venueRecords] = await Promise.all([
            fetchAllRecords('Events'),
            fetchAllRecords('Venues')
        ]);
        
        console.log(`Data fetching complete. Events: ${eventRecords.length}, Venues: ${venueRecords.length}.`);

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
