const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');

// Initialize Airtable client
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  try {
    // Use the parser to handle form data with file uploads
    const result = await parser.parse(event);
    const submission = result;
    
    console.log("Received venue submission:", submission);

    // Prepare the Photo data for Airtable's Attachment field
    // Netlify automatically makes uploaded files available via a URL
    let photoAttachment = null;
    if (submission.photo && submission.photo.length > 0) {
        // Find the file in the parsed data
        const photoFile = submission.files.find(f => f.fieldname === 'photo');
        if (photoFile) {
            // We need to construct the URL from the temporary path.
            // This part is a placeholder as the exact URL construction depends on Netlify's handling.
            // For now, let's assume we can link to it directly. This may need adjustment.
            // A more robust solution might involve uploading to Cloudinary or a similar service.
            // For now we will rely on the fact that Netlify's form submission payload for functions
            // will eventually contain a direct URL to the asset.
             console.log("Photo found in submission, but direct URL handling is complex in this context.");
             // As a fallback, we won't add a photo for now.
        }
    }

    // Prepare the record for Airtable
    const record = {
        "Name": submission['venue-name'],
        "Description": submission.description,
        "Address": submission.address,
        "Opening Hours": submission['opening-hours'],
        "Accessibility": submission.accessibility,
        "Website": submission.website,
        "Instagram": submission.instagram,
        "Facebook": submission.facebook,
        "TikTok": submission.tiktok,
        "X (Twitter)": submission['X (Twitter)'],
        "Contact Email": submission['contact-email'],
        "Status": "Pending Review", // Always set new venues as pending
    };

    // Add photo if we have a URL for it
    if (photoAttachment) {
        record.Photo = [{ url: photoAttachment }];
    }

    // Create the record in the 'Venues' table
    await base('Venues').create([{ fields: record }]);

    console.log("Successfully created venue record in Airtable.");
    
    // Return a user-friendly HTML success page
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `
            <!DOCTYPE html><html lang="en" class="dark"><head><meta charset="UTF-8"><title>Submission Received!</title><script src="https://cdn.tailwindcss.com"></script><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet"><style>body { font-family: 'Poppins', sans-serif; background-color: #121212; color: #EAEAEA; }</style></head><body class="flex flex-col items-center justify-center min-h-screen text-center p-4"><div class="bg-[#1e1e1e] p-8 rounded-2xl shadow-lg"><h1 class="text-4xl font-bold text-white mb-4">Thank You!</h1><p class="text-gray-300 mb-6">Your venue details have been submitted and are now pending review.</p><a href="/" class="bg-[#FADCD9] text-[#333333] px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity">Back to Main Site</a></div></body></html>`
    };

  } catch (error) {
    console.error("An error occurred:", error);
    return {
        statusCode: 500,
        body: `<html><body><h1>Error</h1><p>There was an error processing your submission. Please try again later.</p><pre>${error.toString()}</pre></body></html>`
    };
  }
};
