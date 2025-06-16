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

/**
 * Re-using the robust base64 image upload logic from the working event function.
 * This is much more reliable in a serverless environment.
 */
async function uploadImage(file) {
    if (!file) return null;
    try {
        const base64String = file.content.toString('base64');
        const dataUri = `data:${file.contentType};base64,${base64String}`;
        
        // Upload the image to a dedicated 'venues' folder in Cloudinary
        const result = await cloudinary.uploader.upload(dataUri, {
            folder: 'brumoutloud_venues',
            // Eager transformations create the optimized versions on upload
            eager: [
                { width: 800, height: 600, crop: 'fill', gravity: 'auto', fetch_format: 'auto', quality: 'auto' }, // Medium
                { width: 400, height: 400, crop: 'fill', gravity: 'auto', fetch_format: 'auto', quality: 'auto' }  // Thumbnail
            ]
        });
        
        // Return an object with different image sizes
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

    // **FIX:** The record object now includes all fields from the form,
    // and we will add the optional ones only if they exist.
    const record = {
        "Name": submission['venue-name'],
        "Description": submission.description,
        "Address": submission.address,
        "Contact Email": submission['contact-email'],
        "Status": "Pending Review",
    };

    // Safely add optional fields to the record if they were submitted
    if (submission['opening-hours']) record['Opening Hours'] = submission['opening-hours'];
    if (submission.accessibility) record['Accessibility'] = submission.accessibility;
    if (submission.website) record.Website = submission.website;
    if (submission.instagram) record.Instagram = submission.instagram;
    if (submission.facebook) record.Facebook = submission.facebook;
    if (submission.tiktok) record.TikTok = submission.tiktok;

    // Add the optimized image URLs to the record if they exist
    if (uploadedImageUrls) {
        record['Photo'] = [{ url: uploadedImageUrls.original }]; // Attach to main photo field
        record['Photo URL'] = uploadedImageUrls.original;
        record['Photo Medium URL'] = uploadedImageUrls.medium;
        record['Photo Thumbnail URL'] = uploadedImageUrls.thumbnail;
    }

    await base('Venues').create([{ fields: record }]);

    console.log("Successfully created venue record in Airtable.");
    
    // Redirect back to a success page or the new venues page
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `<!DOCTYPE html><html><head><title>Success</title><meta http-equiv="refresh" content="3;url=/all-venues.html"></head><body style="font-family: sans-serif; text-align: center; padding-top: 50px;"><h1>Thank You!</h1><p>Your venue has been submitted for review.</p><p>You will be redirected shortly.</p></body></html>`
    };

  } catch (error) {
    console.error("An error occurred during venue submission:", error);
    return {
        statusCode: 500,
        body: `<html><body><h1>Error</h1><p>There was an error processing your submission. Please try again later.</p><pre>${error.toString()}</pre></body></html>`
    };
  }
};
