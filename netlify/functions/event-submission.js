const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');
const cloudinary = require('cloudinary').v2;

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadImage(file) {
    if (!file) return null;
    try {
        const base64String = file.content.toString('base64');
        const dataUri = `data:${file.contentType};base64,${base64String}`;
        const result = await cloudinary.uploader.upload(dataUri, { folder: 'brumoutloud_events' });
        return result.secure_url;
    } catch (error) {
        console.error("Cloudinary upload error in event-submission:", error);
        return null;
    }
}

exports.handler = async function (event, context) {
    try {
        const submission = await parser.parse(event);
        
        const imageUrl = await uploadImage(submission.files.find(f => f.fieldname === 'promo-image'));
        const venueId = submission.venueId || null;

        // --- FIX: Combine date and time from the form into a single ISO string for Airtable ---
        const eventDate = submission.date;
        const eventTime = submission['start-time'] || '00:00'; // Default to midnight if time isn't provided
        const combinedDateTime = new Date(`${eventDate}T${eventTime}`).toISOString();
        // --- END FIX ---

        const eventRecord = {
            "Event Name":      submission['event-name'] || 'Untitled Event',
            "Date":            combinedDateTime,
            "Description":     submission.description || '',
            "Link":            submission.link || '',
            "Recurring Info":  submission['recurring-info'] || '',
            "Status":          "Pending Review",
        };

        if (imageUrl) {
            eventRecord["Promo Image"] = [{ url: imageUrl }];
        }
        
        if (venueId && venueId.startsWith('rec')) {
            eventRecord["Venue"] = [venueId];
        }

        await base('Events').create([{ fields: eventRecord }]);
    
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: `<!DOCTYPE html><html><head><title>Success</title><meta http-equiv="refresh" content="3;url=/events.html"></head><body style="font-family: sans-serif; text-align: center; padding-top: 50px;"><h1>Thank You!</h1><p>Your event has been submitted for review.</p><p>You will be redirected shortly.</p></body></html>`
        };

    } catch (error) {
        console.error("!!! An error occurred in event-submission handler:", error);
        return {
            statusCode: 500,
            body: `<html><body><h1>Internal Server Error</h1><p>An unexpected error occurred: ${error.toString()}</p></body></html>`
        };
    }
};
