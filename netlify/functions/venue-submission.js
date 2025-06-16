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
        console.log("No file provided for upload.");
        return null;
    }
    try {
        console.log("Converting file to base64 for upload...");
        const base64String = file.content.toString('base64');
        const dataUri = `data:${file.contentType};base64,${base64String}`;
        
        console.log("Uploading to Cloudinary...");
        const result = await cloudinary.uploader.upload(dataUri, {
            folder: 'brumoutloud_venues',
            eager: [
                { width: 800, height: 600, crop: 'fill', gravity: 'auto', fetch_format: 'auto', quality: 'auto' }, // Medium
                { width: 400, height: 400, crop: 'fill', gravity: 'auto', fetch_format: 'auto', quality: 'auto' }  // Thumbnail
            ]
        });
        
        console.log("Cloudinary upload successful.");
        return {
            original: result.secure_url,
            medium: result.eager[0].secure_url,
            thumbnail: result.eager[1].secure_url,
        };

    } catch (error) {
        console.error("!!! Cloudinary Upload Error:", error);
        // Throw the error to be caught by the main handler
        throw error;
    }
}


// --- Main Handler ---

exports.handler = async function (event, context) {
  let submission;
  try {
    console.log("Step 1: Parsing form data...");
    submission = await parser.parse(event);
    console.log("Step 1 Success: Form data parsed.");
  } catch (error) {
    console.error("!!! Form Parsing Error:", error);
    return { statusCode: 400, body: "Error processing form data." };
  }
  
  try {
    console.log("Step 2: Finding photo file...");
    const photoFile = submission.files.find(f => f.fieldname === 'photo');
    console.log(`Step 2 Success: Photo file ${photoFile ? 'found' : 'not found'}.`);

    console.log("Step 3: Uploading image...");
    const uploadedImageUrls = await uploadImage(photoFile);
    console.log("Step 3 Success: Image upload process finished.");

    console.log("Step 4: Assembling Airtable record...");
    const record = {
        "Name": submission['venue-name'],
        "Description": submission.description,
        "Address": submission.address,
        "Contact Email": submission['contact-email'],
        "Status": "Pending Review",
    };

    if (submission['opening-hours']) record['Opening Hours'] = submission['opening-hours'];
    if (submission.accessibility) record['Accessibility'] = submission.accessibility;
    if (submission.website) record.Website = submission.website;
    if (submission.instagram) record.Instagram = submission.instagram;
    if (submission.facebook) record.Facebook = submission.facebook;
    if (submission.tiktok) record.TikTok = submission.tiktok;

    if (uploadedImageUrls) {
        record['Photo'] = [{ url: uploadedImageUrls.original }];
        record['Photo URL'] = uploadedImageUrls.original;
        record['Photo Medium URL'] = uploadedImageUrls.medium;
        record['Photo Thumbnail URL'] = uploadedImageUrls.thumbnail;
    }
    console.log("Step 4 Success: Airtable record assembled.");

    console.log("Step 5: Creating record in Airtable...");
    await base('Venues').create([{ fields: record }]);
    console.log("Step 5 Success: Record created in Airtable.");
    
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `<!DOCTYPE html><html><head><title>Success</title><meta http-equiv="refresh" content="3;url=/all-venues.html"></head><body style="font-family: sans-serif; text-align: center; padding-top: 50px;"><h1>Thank You!</h1><p>Your venue has been submitted for review.</p><p>You will be redirected shortly.</p></body></html>`
    };

  } catch (error) {
    console.error("!!! An error occurred in the main handler:", error);
    return {
        statusCode: 500,
        body: `<html><body><h1>Internal Server Error</h1><p>An unexpected error occurred. The technical team has been notified.</p><pre style="display:none;">${error.toString()}</pre></body></html>`
    };
  }
};
