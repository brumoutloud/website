const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');
const cloudinary = require('cloudinary').v2;

// --- Initialize Airtable and Cloudinary ---
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const venuesTable = base('Venues');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadImage(file) {
    if (!file || !file.content) return null;
    try {
        const base64String = file.content.toString('base64');
        const dataUri = `data:${file.contentType};base64,${base64String}`;
        
        const result = await cloudinary.uploader.upload(dataUri, {
            folder: 'brumoutloud_venues',
            eager: [
                { width: 800, height: 600, crop: 'fill', gravity: 'auto', fetch_format: 'auto', quality: 'auto' },
                { width: 400, height: 400, crop: 'fill', gravity: 'auto', fetch_format: 'auto', quality: 'auto' }
            ]
        });
        
        return {
            original: result.secure_url,
            medium: result.eager[0].secure_url,
            thumbnail: result.eager[1].secure_url,
        };
    } catch (error) {
        console.error("Error uploading to Cloudinary:", error);
        return null;
    }
}

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const submission = await parser.parse(event);
        const photoFile = submission.files.find(f => f.fieldname === 'photo');
        const uploadedImageUrls = await uploadImage(photoFile);

        const record = {
            "Name": submission.name,
            "Description": submission.description,
            "Address": submission.address,
            "Opening Hours": submission['opening-hours'],
            "Accessibility": submission.accessibility,
            "Website": submission.website,
            "Instagram": submission.instagram,
            "Facebook": submission.facebook,
            "TikTok": submission.tiktok,
            "Status": "Approved" // Automatically approved
        };

        if (uploadedImageUrls) {
            record['Photo'] = [{ url: uploadedImageUrls.original }];
            record['Photo URL'] = uploadedImageUrls.original;
            record['Photo Medium URL'] = uploadedImageUrls.medium;
            record['Photo Thumbnail URL'] = uploadedImageUrls.thumbnail;
        }

        await venuesTable.create([{ fields: record }]);

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `Venue "${submission.name}" created successfully.` }),
        };

    } catch (error) {
        console.error("Error creating approved venue:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
