const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    // This function is designed to get a simple list of all approved venues.
    // It is used to populate dropdown menus.
    
    try {
        const records = await base('Venues').select({
            filterByFormula: "({Status} = 'Approved')",
            sort: [{field: "Name", direction: "asc"}],
            // Only fetch the fields we absolutely need for the dropdown.
            fields: ["Name"] 
        }).all();

        const venues = records.map(record => ({
            id: record.id,
            name: record.get('Name')
        }));

        return {
            statusCode: 200,
            body: JSON.stringify(venues),
        };
    } catch (error) {
        console.error("Error fetching venue list:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch venue list' }),
        };
    }
};
