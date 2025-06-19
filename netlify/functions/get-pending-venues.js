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
        // **FIX**: Requesting all possible email fields for Venues.
        const records = await fetchAllPendingRecords('Venues', [
            'Name', 'Description', 'Address', 'Contact Email', 'email', 'Submitter Email', 'Opening Hours',
            'Accessibility', 'Website', 'Instagram', 'Facebook', 'TikTok', 'Photo URL'
        ]);

        const pendingVenues = records.map(record => {
            const newFields = { ...record.fields };
            
            // **FIX**: Find the first available email and map it to a consistent 'Contact Email' property.
            const email = newFields['Contact Email'] || newFields['email'] || newFields['Submitter Email'];
            if (email) {
                newFields['Contact Email'] = email;
            }

            // Clean up the original email fields to avoid confusion
            if (newFields.email) delete newFields.email;
            if (newFields['Submitter Email']) delete newFields['Submitter Email'];

            return {
                id: record.id,
                type: 'Venue',
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
            body: JSON.stringify(pendingVenues),
        };

    } catch (error) {
        console.error("Critical error in get-pending-venues handler:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch pending venues', details: error.toString() }),
        };
    }
};
