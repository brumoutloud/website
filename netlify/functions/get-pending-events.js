const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

async function fetchAllPendingRecords(tableName, fields) {
    console.log(`[${tableName}] Starting paginated fetch for records with status 'Pending Review'.`);
    const allRecords = [];
    let pageCount = 0;
    try {
        await base(tableName).select({
            filterByFormula: "{Status} = 'Pending Review'",
            fields: fields
        }).eachPage((records, fetchNextPage) => {
            pageCount++;
            console.log(`[${tableName}] Fetched page ${pageCount} with ${records.length} records.`);
            records.forEach(record => allRecords.push(record));
            fetchNextPage();
        });
        console.log(`[${tableName}] Finished paginated fetch. Total pages: ${pageCount}. Total records found: ${allRecords.length}`);
        return allRecords;
    } catch (error) {
        console.error(`[${tableName}] Error during Airtable 'eachPage' call:`, error);
        throw error;
    }
}

exports.handler = async function (event, context) {
    try {
        // **FIX**: Requesting 'Submitter Email' instead of 'Contact Email' for Events.
        const records = await fetchAllPendingRecords('Events', [
            'Event Name', 'Description', 'VenueText', 'Submitter Email', 'Date',
            'Link', 'Recurring Info', 'Category', 'Promo Image', 'Parent Event Name'
        ]);

        const pendingEvents = records.map(record => {
            const newFields = { ...record.fields };
            
            // **FIX**: To keep the frontend consistent, we map the value from 'Submitter Email' 
            // to a 'Contact Email' property, which the frontend expects.
            if (newFields['Submitter Email']) {
                newFields['Contact Email'] = newFields['Submitter Email'];
                delete newFields['Submitter Email'];
            }

            return {
                id: record.id,
                type: 'Event',
                fields: newFields
            };
        });

        return {
            statusCode: 200,
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            body: JSON.stringify(pendingEvents),
        };

    } catch (error) {
        console.error("Critical error in get-pending-events handler:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch pending events', details: error.toString() }),
        };
    }
};
