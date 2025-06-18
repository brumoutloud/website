const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { id, type, newStatus } = JSON.parse(event.body);

        if (!id || !type || !newStatus) {
            return { statusCode: 400, body: 'Missing required parameters.' };
        }

        const table = type === 'Event' ? base('Events') : base('Venues');
        
        await table.update(id, { "Status": newStatus });

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `Record ${id} updated to ${newStatus}` }),
        };

    } catch (error) {
        console.error("Error updating item status:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
