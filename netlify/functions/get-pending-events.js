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
        const records = await fetchAllPendingRecords('Events', [
            'Event Name', 'Description', 'VenueText', 'Contact Email', 'Date',
            'Link', 'Recurring Info', 'Category', 'Promo Image', 'Parent Event Name'
        ]);

        const pendingEvents = records.map(record => ({
            id: record.id,
            type: 'Event',
            fields: record.fields
        }));

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
