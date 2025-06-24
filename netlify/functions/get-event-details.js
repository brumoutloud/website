// netlify/functions/get-event-details.js
const Airtable = require('airtable');

const AIRTABLE_PERSONAL_ACCESS_TOKEN = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const base = new Airtable({ apiKey: AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(AIRTABLE_BASE_ID);

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { id, slug } = event.queryStringParameters; // Can receive either ID or slug

    if (!id && !slug) {
        return {
            statusCode: 400,
            body: JSON.stringify({ success: false, message: 'Event ID or slug is required.' }),
            headers: { 'Content-Type': 'application/json' },
        };
    }

    let filterFormula;
    if (id) {
        filterFormula = `{Record ID} = '${id}'`; // Filter by Airtable's internal Record ID
    } else {
        filterFormula = `{Slug} = '${slug}'`; // Filter by the 'Slug' field (for public pages)
    }

    try {
        const records = await base('Events').select({ // Assuming 'Events' is your table name
            filterByFormula: filterFormula,
            maxRecords: 1, // Expecting only one record
        }).firstPage();

        if (records.length === 0) {
            return {
                statusCode: 404,
                body: JSON.stringify({ success: false, message: 'Event not found.' }),
                headers: { 'Content-Type': 'application/json' },
            };
        }

        const eventRecord = records[0];
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                id: eventRecord.id,
                fields: eventRecord.fields, // Return all fields
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
