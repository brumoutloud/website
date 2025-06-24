// netlify/functions/update-submission.js
const Airtable = require('airtable');
const { formidable } = require('formidable');
const cloudinary = require('cloudinary').v2;
const stream = require('stream'); // Node.js stream module

// Initialize Airtable with the correct environment variable name
const AIRTABLE_PERSONAL_ACCESS_TOKEN = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const base = new Airtable({ apiKey: AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(AIRTABLE_BASE_ID);

// Initialize Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper to parse multipart/form-data with a stream from event.body
function parseMultipartForm(event) {
    return new Promise((resolve, reject) => {
        const req = new stream.PassThrough();
        
        if (event.isBase64Encoded) {
            req.end(Buffer.from(event.body, 'base64'));
        } else {
            req.end(event.body);
        }

        req.headers = event.headers;
        req.method = event.httpMethod;

        const form = formidable({
            multiples: false,
            keepExtensions: true,
            allowEmptyFiles: true,
            minFileSize: 0, // FIX: Allow files with 0 bytes
            maxFileSize: 5 * 1024 * 1024 // 5 MB limit
        });

        form.on('error', (err) => {
            console.error('Formidable parsing error:', err);
            reject(err);
        });

        form.parse(req, (err, fields, files) => {
            if (err) {
                console.error('Error during form.parse:', err);
                return reject(err);
            }
            const processedFields = {};
            for (const key in fields) {
                processedFields[key] = fields[key][0];
            }
            const processedFiles = {};
            for (const key in files) {
                processedFiles[key] = files[key][0];
            }

            console.log('Formidable parsed fields (processed):', processedFields);
            console.log('Formidable parsed files (processed):', processedFiles);
            resolve({ fields: processedFields, files: processedFiles });
        });
    });
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ success: false, message: 'Method Not Allowed' }) };
    }

    try {
        console.log('Starting update-submission function...');
        const { fields, files } = await parseMultipartForm(event);
        console.log('Multipart form parsed successfully.');

        const recordId = fields.id;
        const itemType = fields.type;

        if (!recordId || !itemType) {
            console.error('Missing recordId or itemType:', { recordId, itemType });
            return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Record ID and type are required.' }) };
        }

        console.log(`Processing update for ${itemType} ID: ${recordId}`);

        const updateFields = {
            "Event Name": fields['Event Name'] || '',
            "Date": fields.date || '',
            "Time": fields.time || '',
            "Description": fields.Description || '',
            "Link": fields.Link || '',
            "Recurring Info": fields['Recurring Info'] || '',
            "Category": Array.isArray(fields.Category) ? fields.Category : (fields.Category ? [fields.Category] : []),
            "Venue": fields.venueId ? [fields.venueId] : [],
        };
        console.log('Airtable updateFields prepared:', updateFields);

        const promoImageFile = files['promo-image'];
        if (promoImageFile && promoImageFile.size > 0) { // Only upload if file exists and has content
            console.log(`Image file detected: ${promoImageFile.originalFilename}, path: ${promoImageFile.filepath}, size: ${promoImageFile.size}`);
            try {
                console.log('Attempting Cloudinary upload...');
                const uploadResult = await cloudinary.uploader.upload(promoImageFile.filepath, {
                    folder: "brumoutloud_events",
                    resource_type: "image"
                });
                updateFields['Promo Image'] = [{ url: uploadResult.secure_url }];
                console.log('Cloudinary upload successful:', uploadResult.secure_url);
            } catch (uploadError) {
                console.error('Cloudinary upload failed:', uploadError);
                throw new Error(`Image upload failed: ${uploadError.message}`);
            }
        } else {
             console.log('No new promo-image file provided or file is empty.');
             // If you want to remove an existing image when no new one is provided,
             // you would explicitly set updateFields['Promo Image'] = []; here
             // based on a checkbox or other signal from the frontend.
        }

        console.log('Attempting Airtable update...');
        await base('Events').update([
            {
                id: recordId,
                fields: updateFields,
            },
        ]);
        console.log('Airtable update successful.');

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `${itemType} updated successfully!` }),
        };

    } catch (error) {
        console.error('Full update-submission function error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: `Failed to update ${itemType}: ${error.message}` }),
        };
    }
};
