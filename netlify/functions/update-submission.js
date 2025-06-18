const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { id, type, fields } = JSON.parse(event.body);

        if (!id || !type || !fields) {
            return { statusCode: 400, body: 'Missing required parameters.' };
        }

        const table = type === 'Event' ? base('Events') : base('Venues');
        
        // Airtable expects the fields to be updated in a specific format.
        // We'll rename the 'name' field to match Airtable's schema if necessary.
        const fieldsToUpdate = { ...fields };
        if (type === 'Venue' && fieldsToUpdate.name) {
            fieldsToUpdate['Name'] = fieldsToUpdate.name;
            delete fieldsToUpdate.name;
        } else if (type === 'Event' && fieldsToUpdate.name) {
             fieldsToUpdate['Event Name'] = fieldsToUpdate.name;
            delete fieldsToUpdate.name;
        }

        await table.update(id, fieldsToUpdate);

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `Record ${id} updated successfully.` }),
        };

    } catch (error) {
        console.error("Error updating submission:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
