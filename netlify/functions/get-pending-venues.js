const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    try {
        const records = await base('Venues').select({
            filterByFormula: "{Status} = 'Pending Review'",
            // Fetch all the fields we need for the edit form
            fields: [
                'Name', 'Description', 'Address', 'Contact Email', 'Opening Hours',
                'Accessibility', 'Website', 'Instagram', 'Facebook', 'TikTok', 'Photo URL'
            ]
        }).all();

        const pendingVenues = records.map(record => ({
            id: record.id,
            type: 'Venue',
            // Pass all fields to the front-end
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
            body: JSON.stringify({ error: 'Failed to fetch pending venues' }),
        };
    }
};
