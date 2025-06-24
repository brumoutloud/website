// netlify/functions/update-submission.js
const Airtable = require('airtable');
const formidable = require('formidable'); // For parsing multipart/form-data
const cloudinary = require('cloudinary').v2; // For image uploads

// Initialize Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

// Initialize Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper to parse multipart/form-data
function parseMultipartForm(event) {
    return new Promise((resolve, reject) => {
        const form = formidable({ multiples: true }); // 'multiples' for array fields if needed
        form.parse(event.body, (err, fields, files) => {
            if (err) return reject(err);
            resolve({ fields, files });
        });
    });
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ success: false, message: 'Method Not Allowed' }) };
    }

    try {
        // Parse the multipart form data
        const { fields, files } = await parseMultipartForm(event);

        const recordId = fields.id;
        const itemType = fields.type; // 'Event' or 'Venue'

        if (!recordId || !itemType) {
            return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Record ID and type are required.' }) };
        }

        // Prepare fields for Airtable update
        const updateFields = {
            "Event Name": fields['Event Name'] || '',
            "Date": fields.date || '',
            "Time": fields.time || '', // Assuming you have a 'Time' field in Airtable
            "Description": fields.Description || '',
            "Link": fields.Link || '',
            "Recurring Info": fields['Recurring Info'] || '',
            "Category": Array.isArray(fields.Category) ? fields.Category : (fields.Category ? [fields.Category] : []), // Handle single or multiple categories
            // Link to venue record (assuming venueId is the ID of the linked record)
            "Venue": fields.venueId ? [fields.venueId] : [], // Airtable linked records are arrays of IDs
        };

        // Handle image upload if a file is provided
        if (files['promo-image'] && files['promo-image'].length > 0) {
            const imageFile = files['promo-image'][0]; // formidable stores single files in an array if 'multiples' is true

            if (imageFile.size > 0) {
                console.log(`Uploading image: ${imageFile.filepath} to Cloudinary...`);
                const uploadResult = await cloudinary.uploader.upload(imageFile.filepath, {
                    folder: "brumoutloud_events", // Optional: specify a folder in Cloudinary
                    resource_type: "image" // Ensure it's treated as an image
                });
                updateFields['Promo Image'] = [{ url: uploadResult.secure_url }]; // Airtable attachment format
                console.log('Cloudinary upload successful:', uploadResult.secure_url);
            } else {
                console.log('No new image file provided or file is empty.');
                // If an existing image needs to be removed without new upload,
                // you'd need a separate mechanism (e.g., a "clear image" checkbox).
                // For now, if no new file is uploaded, keep existing image if any, or leave blank.
            }
        } else {
             console.log('No promo-image file found in the submission.');
             // If you want to allow clearing an image without uploading a new one,
             // you'd need another form field (e.g., a checkbox) to signal this.
             // For simplicity, if no new file, we don't touch existing image field unless explicitly told.
        }

        // Perform the Airtable update
        await base('Events').update([ // Assuming your events table is named 'Events'
            {
                id: recordId,
                fields: updateFields,
            },
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `${itemType} updated successfully!` }),
        };

    } catch (error) {
        console.error('Error updating submission:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: `Failed to update ${itemType}: ${error.message}` }),
        };
    }
};
