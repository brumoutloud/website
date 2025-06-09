const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');
// You will need to install the cloudinary package: npm install cloudinary
const cloudinary = require('cloudinary').v2;

// Initialize Airtable client
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

// Configure Cloudinary with your credentials from Netlify environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper function to upload image to Cloudinary
async function uploadToCloudinary(file) {
    if (!file) return null;

    try {
        // Cloudinary needs the file content as a base64 string
        const base64String = file.content.toString('base64');
        
        // Upload the image
        const result = await cloudinary.uploader.upload(`data:${file.contentType};base64,${base64String}`, {
            folder: 'brumoutloud_venues', // Optional: organize uploads in a folder
            // Eager transformations create the optimized versions on upload
            eager: [
                { width: 400, height: 400, crop: 'fill', gravity: 'auto', fetch_format: 'auto', quality: 'auto' }, // Medium
                { width: 200, height: 200, crop: 'fill', gravity: 'auto', fetch_format: 'auto', quality: 'auto' }  // Thumbnail
            ]
        });

        // Return the URLs for the different versions
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
  try {
    const result = await parser.parse(event);
    
    console.log("Received venue submission");

    const photoFile = result.files.find(f => f.fieldname === 'photo');
    const uploadedImageUrls = await uploadToCloudinary(photoFile);

    const record = {
        "Name": result['venue-name'],
        "Description": result.description,
        "Address": result.address,
        "Opening Hours": result['opening-hours'],
        "Accessibility": result.accessibility,
        "Website": result.website,
        "Instagram": result.instagram,
        "Facebook": result.facebook,
        "TikTok": result.tiktok,
        "X (Twitter)": result['X (Twitter)'],
        "Contact Email": result['contact-email'],
        "Status": "Pending Review",
    };

    // Add the optimized image URLs to the record if they exist
    if (uploadedImageUrls) {
        record['Photo URL'] = uploadedImageUrls.original;
        record['Photo Medium URL'] = uploadedImageUrls.medium;
        record['Photo Thumbnail URL'] = uploadedImageUrls.thumbnail;
    }

    await base('Venues').create([{ fields: record }]);

    console.log("Successfully created venue record in Airtable.");
    
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `<!DOCTYPE html><html lang="en" class="dark"><head><meta charset="UTF-8"><title>Submission Received!</title><script src="https://cdn.tailwindcss.com"></script><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet"><style>body { font-family: 'Poppins', sans-serif; background-color: #121212; color: #EAEAEA; }</style></head><body class="flex flex-col items-center justify-center min-h-screen text-center p-4"><div class="bg-[#1e1e1e] p-8 rounded-2xl shadow-lg"><h1 class="text-4xl font-bold text-white mb-4">Thank You!</h1><p class="text-gray-300 mb-6">Your venue details have been submitted and are now pending review.</p><a href="/" class="bg-[#FADCD9] text-[#333333] px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity">Back to Main Site</a></div></body></html>`
    };

  } catch (error) {
    console.error("An error occurred:", error);
    return {
        statusCode: 500,
        body: `<html><body><h1>Error</h1><p>There was an error processing your submission. Please try again later.</p><pre>${error.toString()}</pre></body></html>`
    };
  }
};
