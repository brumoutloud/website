// netlify/functions/get-event-details-by-id.js
const Airtable = require('airtable');

const AIRTABLE_PERSONAL_ACCESS_TOKEN = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const base = new Airtable({ apiKey: AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(AIRTABLE_BASE_ID);

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { id } = event.queryStringParameters; // Only expect 'id'

    if (!id) {
        return {
            statusCode: 400,
            body: JSON.stringify({ success: false, message: 'Event ID is required.' }),
            headers: { 'Content-Type': 'application/json' },
        };
    }

    try {
        console.log(`Attempting to find event by ID: ${id} for get-event-details-by-id`);
        // Use Airtable's .find() method for direct record ID lookup
        const eventRecord = await base('Events').find(id);
        console.log(`Found record by ID: ${eventRecord ? eventRecord.id : 'None'}`);

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
                fields: eventRecord.fields, // Return all fields
            }),
            headers: { 'Content-Type': 'application/json' },
        };
    } catch (error) {
        console.error('Error in get-event-details-by-id function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: `Error fetching event details by ID: ${error.message}` }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
};
