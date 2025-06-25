// netlify/functions/update-item-status.js
const Airtable = require('airtable');

const AIRTABLE_PERSONAL_ACCESS_TOKEN = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const base = new Airtable({ apiKey: AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(AIRTABLE_BASE_ID);

// Helper function to create a URL-friendly slug from a string
const slugify = (text) => {
  if (!text) return '';
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { id, type, status, rejectionReason } = JSON.parse(event.body);

        if (!id || !type || !status) {
            return { statusCode: 400, body: JSON.stringify({ success: false, message: 'ID, type, and status are required.' }) };
        }

        if (type !== 'Event') {
            return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Invalid item type. Only Events are handled by this approval flow.' }) };
        }

        const tableName = 'Events';

        const fieldsToUpdate = {
            "Status": status
        };

        if (status === 'Rejected' && rejectionReason) {
            fieldsToUpdate["Rejection Reason"] = rejectionReason;
        } else if (status === 'Approved') {
            // --- NEW SLUG GENERATION LOGIC ---
            // Fetch the record to get the data needed for the slug
            const record = await base(tableName).find(id);
            const eventName = record.get('Event Name');
            const parentName = record.get('Parent Event Name');
            const eventDate = record.get('Date');
            
            let newSlug = '';
            // If it's a recurring event instance (it has a Parent Event Name)
            if (parentName && eventDate) {
                const baseSlug = slugify(parentName);
                const dateString = new Date(eventDate).toISOString().split('T')[0];
                newSlug = `${baseSlug}-${dateString}`;
            } else {
                // Otherwise, it's a one-off event
                newSlug = slugify(eventName);
            }

            if (newSlug) {
                fieldsToUpdate['Slug'] = newSlug;
            }
            // --- END NEW SLUG LOGIC ---
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
