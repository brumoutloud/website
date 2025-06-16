const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');
// const cloudinary = require('cloudinary').v2; // Temporarily commented out for diagnostics

// --- Initialize Airtable and Cloudinary ---
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

// cloudinary.config({ // Temporarily commented out for diagnostics
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// });

// --- Helper Functions ---

async function uploadImage(file) {
    // DIAGNOSTIC STEP: We are deliberately skipping the upload for this test.
    console.log("DIAGNOSTIC: Skipping Cloudinary upload.");
    if (!file) {
        console.log("No file provided for upload.");
        return null;
    }
    // This will return a fake URL object to allow the rest of the function to run.
    return {
        original: 'https://fake-url.com/original.jpg',
        medium: 'https://fake-url.com/medium.jpg',
        thumbnail: 'https://fake-url.com/thumbnail.jpg',
    };
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

    console.log("Step 3: Uploading image (DIAGNOSTIC - SKIPPED)...");
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
        body: `<!DOCTYPE html><html><head><title>Success (Diagnostic Mode)</title><meta http-equiv="refresh" content="3;url=/all-venues.html"></head><body style="font-family: sans-serif; text-align: center; padding-top: 50px;"><h1>Thank You!</h1><p>Your venue has been submitted for review.</p><p>You will be redirected shortly.</p></body></html>`
    };

  } catch (error) {
    console.error("!!! An error occurred in the main handler:", error);
    return {
        statusCode: 500,
        body: `<html><body><h1>Internal Server Error</h1><p>An unexpected error occurred. The technical team has been notified.</p><pre style="display:none;">${error.toString()}</pre></body></html>`
    };
  }
};
