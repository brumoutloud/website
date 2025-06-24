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
        const form = formidable({
            multiples: false, // Set to false if you expect a single file per field name
            keepExtensions: true, // Keep original file extensions
            allowEmptyFiles: true, // Allow empty file uploads, will be ignored by Cloudinary if size 0
            maxFileSize: 5 * 1024 * 1024 // 5 MB limit (adjust as needed)
        });

        // Event listener for errors during parsing
        form.on('error', (err) => {
            console.error('Formidable parsing error:', err);
            reject(err);
        });

        form.parse(event.body, (err, fields, files) => {
            if (err) {
                console.error('Error during form.parse:', err);
                return reject(err);
            }
            console.log('Formidable parsed fields:', fields); // Debug log
            console.log('Formidable parsed files:', files);   // Debug log
            resolve({ fields, files });
        });
    });
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ success: false, message: 'Method Not Allowed' }) };
    }

    try {
        console.log('Starting update-submission function...'); // Debug log
        // Parse the multipart form data
        const { fields, files } = await parseMultipartForm(event);
        console.log('Multipart form parsed successfully.'); // Debug log

        const recordId = fields.id?.[0] || fields.id; // formidable returns fields as arrays
        const itemType = fields.type?.[0] || fields.type;

        if (!recordId || !itemType) {
            console.error('Missing recordId or itemType:', { recordId, itemType }); // Debug log
            return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Record ID and type are required.' }) };
        }

        console.log(`Processing update for ${itemType} ID: ${recordId}`); // Debug log

        // Prepare fields for Airtable update
        // Note: formidable returns field values as arrays, so access with [0]
        const updateFields = {
            "Event Name": fields['Event Name']?.[0] || '',
            "Date": fields.date?.[0] || '',
            "Time": fields.time?.[0] || '',
            "Description": fields.Description?.[0] || '',
            "Link": fields.Link?.[0] || '',
            "Recurring Info": fields['Recurring Info']?.[0] || '',
            // Categories might be multiple, so check if it's an array or single string
            "Category": Array.isArray(fields.Category) ? fields.Category : (fields.Category ? [fields.Category?.[0]] : []),
            "Venue": fields.venueId?.[0] ? [fields.venueId?.[0]] : [], // Airtable linked records are arrays of IDs
        };
        console.log('Airtable updateFields prepared:', updateFields); // Debug log

        // Handle image upload if a file is provided
        const promoImageFile = files['promo-image']?.[0]; // Access the first file in the array
        if (promoImageFile && promoImageFile.size > 0) {
            console.log(`Image file detected: ${promoImageFile.originalFilename}, path: ${promoImageFile.filepath}, size: ${promoImageFile.size}`); // Debug log
            try {
                console.log('Attempting Cloudinary upload...'); // Debug log
                const uploadResult = await cloudinary.uploader.upload(promoImageFile.filepath, {
                    folder: "brumoutloud_events", // Optional: specify a folder in Cloudinary
                    resource_type: "image" // Ensure it's treated as an image
                });
                updateFields['Promo Image'] = [{ url: uploadResult.secure_url }]; // Airtable attachment format
                console.log('Cloudinary upload successful:', uploadResult.secure_url); // Debug log
            } catch (uploadError) {
                console.error('Cloudinary upload failed:', uploadError); // Debug log
                // Decide whether to fail the whole submission or continue without image
                // For now, we'll re-throw to fail the submission if image upload fails
                throw new Error(`Image upload failed: ${uploadError.message}`);
            }
        } else {
             console.log('No new promo-image file provided or file is empty.'); // Debug log
             // If no new file is uploaded, we might want to preserve the existing image
             // or clear it if explicitly requested by a separate form field.
             // For now, if no new file is provided, the 'Promo Image' field in updateFields
             // is not set, meaning Airtable will *not* be told to change the image.
             // If you want to *clear* an existing image, you'd need a separate checkbox.
        }

        // Perform the Airtable update
        console.log('Attempting Airtable update...'); // Debug log
        await base('Events').update([ // Assuming your events table is named 'Events'
            {
                id: recordId,
                fields: updateFields,
            },
        ]);
        console.log('Airtable update successful.'); // Debug log

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `${itemType} updated successfully!` }),
        };

    } catch (error) {
        console.error('Full update-submission function error:', error); // Comprehensive error log
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: `Failed to update ${itemType}: ${error.message}` }),
        };
    }
};
