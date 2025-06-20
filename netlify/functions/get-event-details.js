const Airtable = require('airtable');

exports.handler = async function (event, context) {
    try {
        const { AIRTABLE_PERSONAL_ACCESS_TOKEN, AIRTABLE_BASE_ID } = process.env;
        const base = new Airtable({ apiKey: AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(AIRTABLE_BASE_ID);
        const { id } = event.queryStringParameters;

        if (!id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Event ID is required' }) };
        }

        // 1. Fetch the primary event
        const primaryEvent = await base('Events').find(id);

        if (!primaryEvent) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Event not found' }) };
        }

        let suggestedEvents = [];
        const primaryEventCategories = primaryEvent.fields.Category || [];

        // 2. If the primary event has categories, find other events with the same categories
        if (primaryEventCategories.length > 0) {
            // Build a formula like: OR(FIND('Category1', ARRAYJOIN(Category)), FIND('Category2', ARRAYJOIN(Category)))
            const categoryFormulas = primaryEventCategories.map(cat => `FIND('${cat}', ARRAYJOIN(Category))`);
            const categoryFilter = `OR(${categoryFormulas.join(', ')})`;

            const filterByFormula = `AND(
                {Status} = 'Approved',
                IS_AFTER({Date}, TODAY()),
                RECORD_ID() != '${id}',
                ${categoryFilter}
            )`;

            const suggestedRecords = await base('Events').select({
                filterByFormula: filterByFormula,
                sort: [{ field: 'Date', direction: 'asc' }],
                maxRecords: 3, // Limit to 3 suggestions
                fields: ['Event Name', 'Date', 'Promo Image', 'VenueText']
            }).all();

            suggestedEvents = suggestedRecords.map(record => ({
                id: record.id,
                fields: record.fields
            }));
        }

        // 3. Return both the main event and the suggestions
        const responsePayload = {
            event: {
                id: primaryEvent.id,
                fields: primaryEvent.fields
            },
            suggestedEvents: suggestedEvents
        };

        return {
            statusCode: 200,
            body: JSON.stringify(responsePayload)
        };

    } catch (error) {
        console.error("Error fetching event details:", error);
        if (error.statusCode === 404) {
             return { statusCode: 404, body: JSON.stringify({ error: 'Event not found' }) };
        }
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch event details', details: error.message }),
        };
    }
};
