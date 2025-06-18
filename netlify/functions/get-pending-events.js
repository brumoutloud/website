const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    try {
        const records = await base('Events').select({
            filterByFormula: "{Status} = 'Pending Review'"
        }).all();

        const pendingEvents = records.map(record => ({
            id: record.id,
            type: 'Event',
            name: record.get('Event Name') || 'No Name',
            description: record.get('Description'),
            location: record.get('VenueText'),
            contactEmail: record.get('Contact Email') || record.get('email') || record.get('Submitter Email')
        }));

        return {
            statusCode: 200,
            body: JSON.stringify(pendingEvents),
        };

    } catch (error) {
        console.error("Error fetching pending events:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch pending events' }),
        };
    }
};
