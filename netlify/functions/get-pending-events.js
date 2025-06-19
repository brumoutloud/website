const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

// This helper function fetches all records from a table using pagination to ensure reliability.
async function fetchAllPendingRecords(tableName, fields) {
    const allRecords = [];
    await base(tableName).select({
        filterByFormula: "{Status} = 'Pending Review'",
        fields: fields
    }).eachPage((records, fetchNextPage) => {
        records.forEach(record => allRecords.push(record));
        fetchNextPage();
    });
    return allRecords;
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
            body: JSON.stringify(pendingEvents),
        };

    } catch (error) {
        console.error("Error fetching pending events:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch pending events', details: error.message }),
        };
    }
};
