// netlify/functions/update-item-status.js
const Airtable = require('airtable');

const AIRTABLE_PERSONAL_ACCESS_TOKEN = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const base = new Airtable({ apiKey: AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(AIRTABLE_BASE_ID);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { id, type, status, rejectionReason } = JSON.parse(event.body);

        if (!id || !type || !status) {
            return { statusCode: 400, body: JSON.stringify({ success: false, message: 'ID, type, and status are required.' }) };
        }

        let tableName;
        if (type === 'Event') {
            tableName = 'Events';
        } else if (type === 'Venue') {
            tableName = 'Venues';
        } else {
            return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Invalid item type provided.' }) };
        }

        const fieldsToUpdate = {
            "Status": status // Update the Status field (e.g., 'Approved', 'Rejected')
        };

        if (status === 'Rejected' && rejectionReason) {
            // Assuming you have a 'Rejection Reason' field in your Airtable tables
            fieldsToUpdate["Rejection Reason"] = rejectionReason;
            // You might also want to clear other fields or set a 'Visibility' field to false
        }

        await base(tableName).update([
            {
                id: id,
                fields: fieldsToUpdate,
            },
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `${type} status updated to ${status}.` }),
        };
    } catch (error) {
        console.error('Error updating item status:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: `Failed to update item status: ${error.message}` }),
        };
    }
};
