// netlify/functions/get-event-details.js
const Airtable = require('airtable');

const AIRTABLE_PERSONAL_ACCESS_TOKEN = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const base = new Airtable({ apiKey: AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(AIRTABLE_BASE_ID);

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { id, slug } = event.queryStringParameters;

    if (!id && !slug) {
        return {
            statusCode: 400,
            body: JSON.stringify({ success: false, message: 'Event ID or slug is required.' }),
            headers: { 'Content-Type': 'application/json' },
        };
    }

    try {
        let eventRecord;

        if (id) {
            console.log(`Attempting to find event by ID: ${id}`);
            // FIX: Use Airtable's .find() method for direct record ID lookup
            eventRecord = await base('Events').find(id);
            console.log(`Found record by ID: ${eventRecord ? eventRecord.id : 'None'}`);

        } else if (slug) {
            console.log(`Attempting to find event by slug: ${slug}`);
            // Keep filterByFormula for slug as it's not a direct ID lookup
            const records = await base('Events').select({
                filterByFormula: `{Slug} = '${slug}'`,
                maxRecords: 1,
            }).firstPage();
            eventRecord = records.length > 0 ? records[0] : null;
            console.log(`Found record by slug: ${eventRecord ? eventRecord.id : 'None'}`);
        }

        if (!eventRecord) {
            return {
                statusCode: 404,
                body: JSON.stringify({ success: false, message: 'Event not found.' }),
                headers: { 'Content-Type': 'application/json' },
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                id: eventRecord.id,
                fields: eventRecord.fields,
            }),
            headers: { 'Content-Type': 'application/json' },
        };
    } catch (error) {
        console.error('Error in get-event-details function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: `Error fetching event details: ${error.message}` }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
};
