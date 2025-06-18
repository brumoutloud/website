const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    try {
        const records = await base('Venues').select({
            filterByFormula: "{Status} = 'Pending Review'"
        }).all();

        const pendingVenues = records.map(record => ({
            id: record.id,
            type: 'Venue',
            name: record.get('Name') || 'No Name',
            description: record.get('Description'),
            location: record.get('Address'),
            contactEmail: record.get('Contact Email') || record.get('email') || record.get('Submitter Email')
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
