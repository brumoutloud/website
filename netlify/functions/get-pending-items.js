const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

// This function fetches all records from a table using pagination to avoid timeouts.
async function fetchAllRecords(tableName) {
    const allRecords = [];
    console.log(`Starting to fetch from ${tableName}...`);
    try {
        await base(tableName).select({
            filterByFormula: "{Status} = 'Pending Review'"
        }).eachPage((records, fetchNextPage) => {
            console.log(`Fetched a page of ${records.length} records from ${tableName}.`);
            records.forEach(record => allRecords.push(record));
            fetchNextPage();
        });
        console.log(`Finished fetching all pages from ${tableName}. Total: ${allRecords.length}`);
        return allRecords;
    } catch (error) {
        console.error(`Error during pagination for ${tableName}:`, error);
        throw error;
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
        
        console.log(`Data fetching complete. Found ${eventRecords.length} events and ${venueRecords.length} venues.`);

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
