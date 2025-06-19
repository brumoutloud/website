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
        const records = await fetchAllPendingRecords('Venues', [
            'Name', 'Description', 'Address', 'Contact Email', 'Opening Hours',
            'Accessibility', 'Website', 'Instagram', 'Facebook', 'TikTok', 'Photo URL'
        ]);

        const pendingVenues = records.map(record => ({
            id: record.id,
            type: 'Venue',
            fields: record.fields
        }));

        return {
            statusCode: 200,
            body: JSON.stringify(pendingVenues),
        };

    } catch (error) {
        console.error("Error fetching pending venues:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch pending venues', details: error.message }),
        };
    }
};
