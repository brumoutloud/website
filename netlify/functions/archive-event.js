// netlify/functions/archive-event.js
const Airtable = require('airtable');

// Initialize Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ success: false, message: 'Method Not Allowed' }),
        };
    }

    try {
        const { id, type } = JSON.parse(event.body); // 'type' is included but 'id' is primary

        if (!id) {
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, message: 'Record ID is required for archiving.' }),
            };
        }

        // Update the record in the 'Events' table
        // This assumes you have a 'Status' field in your Airtable 'Events' table.
        // If your field name is different (e.g., 'isActive', 'Visibility'), adjust it here.
        await base('Events').update([
            {
                id: id,
                fields: {
                    "Status": "Archived" // Set the status to 'Archived'
                    // Or, if you have a boolean 'IsActive' field: "IsActive": false
                },
            },
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `Event ${id} archived successfully!` }),
        };
    } catch (error) {
        console.error('Error archiving event:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: `Failed to archive event: ${error.message}` }),
        };
    }
};
