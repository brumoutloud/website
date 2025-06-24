// netlify/functions/get-venue-details.js
const Airtable = require('airtable');

const AIRTABLE_PERSONAL_ACCESS_TOKEN = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const base = new Airtable({ apiKey: AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(AIRTABLE_BASE_ID);

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { id, slug } = event.queryStringParameters; // Get both id and slug

    if (!id && !slug) {
        return {
            statusCode: 400,
            body: JSON.stringify({ success: false, message: 'Venue ID or slug is required.' }),
            headers: { 'Content-Type': 'application/json' },
        };
    }

    let filterFormula;
    if (id) {
        filterFormula = `{Record ID} = '${id}'`; // Airtable's internal Record ID
    } else { // Fallback to slug if ID is not provided
        filterFormula = `{Slug} = '${slug}'`; // Assuming you have a 'Slug' field
    }

    try {
        const records = await base('Venues').select({
            filterByFormula: filterFormula,
            maxRecords: 1, // We expect only one record
        }).firstPage();

        if (records.length === 0) {
            return {
                statusCode: 404,
                body: JSON.stringify({ success: false, message: 'Venue not found.' }),
                headers: { 'Content-Type': 'application/json' },
            };
        }

        const venue = records[0];
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                id: venue.id,
                fields: venue.fields, // Return all fields
            }),
            headers: { 'Content-Type': 'application/json' },
        };
    } catch (error) {
        console.error('Error in get-venue-details function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: `Error fetching venue details: ${error.message}` }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
};
