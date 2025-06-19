const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    try {
        const records = await base('Events').select({
            filterByFormula: "{Status} = 'Pending Review'",
            // Fetch all the fields we need for the edit form
            fields: [
                'Event Name', 'Description', 'VenueText', 'Contact Email', 'Date',
                'Link', 'Recurring Info', 'Category', 'Promo Image', 'Parent Event Name'
            ]
        }).all();

        const pendingEvents = records.map(record => ({
            id: record.id,
            type: 'Event',
            // Pass all fields to the front-end
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
            body: JSON.stringify({ error: 'Failed to fetch pending events' }),
        };
    }
};
