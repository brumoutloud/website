const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');
const cloudinary = require('cloudinary').v2;

// --- Initialize Airtable and Cloudinary ---
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --- Helper Functions ---

async function uploadImage(file) {
    if (!file) {
        return null;
    }
    try {
        const base64String = file.content.toString('base64');
        const dataUri = `data:${file.contentType};base64,${base64String}`;
        
        const result = await cloudinary.uploader.upload(dataUri, {
            folder: 'brumoutloud_venues',
            eager: [
                { width: 800, height: 600, crop: 'fill', gravity: 'auto', fetch_format: 'auto', quality: 'auto' }, // Medium
                { width: 400, height: 400, crop: 'fill', gravity: 'auto', fetch_format: 'auto', quality: 'auto' }  // Thumbnail
            ]
        });
        
        return {
            original: result.secure_url,
            medium: result.eager[0].secure_url,
            thumbnail: result.eager[1].secure_url,
        };

    } catch (error) {
        console.error("!!! Cloudinary Upload Error:", error);
        throw error;
    }
}

// Helper to ensure checkbox values are always arrays for Airtable
const toArray = (value) => {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
};

// --- Main Handler ---

exports.handler = async function (event, context) {
  let submission;
  try {
    submission = await parser.parse(event);
  } catch (error) {
    console.error("Error parsing form data:", error);
    return { statusCode: 400, body: "Error processing form data." };
  }
  
  try {
    const photoFile = submission.files.find(f => f.fieldname === 'photo');
    const uploadedImageUrls = await uploadImage(photoFile);

    // Determine if submission is from admin-add-venue.html (which auto-approves)
    // by checking for fields unique to that form (e.g., accessibility-rating, vibe-tags)
    const isFromAdminAddVenue = submission['accessibility-rating'] !== undefined || submission['vibe-tags'] !== undefined;

    const record = {
        // Use 'name' if present (from admin form), fallback to 'venue-name' (from public form)
        "Name": submission.name || submission['venue-name'],
        "Description": submission.description || '',
        "Address": submission.address || '',
        "Contact Email": submission['contact-email'] || '',
        // Set status based on the originating form
        "Status": isFromAdminAddVenue ? "Approved" : "Pending Review",
    };

    // Optional text fields
    if (submission['opening-hours']) record['Opening Hours'] = submission['opening-hours'];
    if (submission.accessibility) record['Accessibility'] = submission.accessibility;
    if (submission.website) record.Website = submission.website;
    if (submission.instagram) record.Instagram = submission.instagram;
    if (submission.facebook) record.Facebook = submission.facebook;
    if (submission.tiktok) record.TikTok = submission.tiktok;
    if (submission['contact-phone']) record['Contact Phone'] = submission['contact-phone'];
    if (submission['accessibility-rating']) record['Accessibility Rating'] = submission['accessibility-rating'];
    if (submission['parking-exception']) record['Parking Exception'] = submission['parking-exception'];

    // Handle multiple-select checkbox fields, ensuring they are arrays
    record['Vibe Tags'] = toArray(submission['vibe-tags']);
    record['Venue Features'] = toArray(submission['venue-features']);
    record['Accessibility Features'] = toArray(submission['accessibility-features']);

    if (uploadedImageUrls) {
        record['Photo URL'] = uploadedImageUrls.original;
        record['Photo Medium URL'] = uploadedImageUrls.medium;
        record['Photo Thumbnail URL'] = uploadedImageUrls.thumbnail;
    }

    await base('Venues').create([{ fields: record }]);
    
    // Return different responses based on the originating form
    if (isFromAdminAddVenue) {
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `Venue "${record.Name}" created successfully.` }),
        };
    } else {
        // Original success message for public form
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: `<!DOCTYPE html><html><head><title>Success</title><meta http-equiv="refresh" content="3;url=/all-venues.html"></head><body style="font-family: sans-serif; text-align: center; padding-top: 50px;"><h1>Thank You!</h1><p>Your venue has been submitted for review.</p><p>You will be redirected shortly.</p></body></html>`
        };
    }

  } catch (error) {
    console.error("!!! An error occurred in the main handler:", error);
    return {
        statusCode: 500,
        body: `<html><body><h1>Internal Server Error</h1><p>An unexpected error occurred. The technical team has been notified.</p><pre style="display:none;">${error.toString()}</pre></body></html>`
    };
  }
};
