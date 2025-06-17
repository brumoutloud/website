const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');
const fetch = require('node-fetch');
const cloudinary = require('cloudinary').v2;

// --- Initialize Airtable and Cloudinary ---
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --- Helper Functions ---
async function findVenueRecord(venueName) {
    if (!venueName) return null;
    const sanatizedVenueName = venueName.toLowerCase().replace(/"/g, '\\"');
    const formula = `OR(LOWER({Name}) = "${sanatizedVenueName}", FIND("${sanatizedVenueName}", LOWER({Name})), FIND("${sanatizedVenueName}", LOWER({Aliases})))`;
    try {
        const records = await base('Venues').select({ maxRecords: 1, filterByFormula: formula }).firstPage();
        return records.length > 0 ? records[0] : null;
    } catch (error) {
        console.error("Error finding venue:", error);
        return null;
    }
}

async function uploadImage(file) {
    if (!file) return null;
    try {
        const base64String = file.content.toString('base64');
        const dataUri = `data:${file.contentType};base64,${base64String}`;
        const result = await cloudinary.uploader.upload(dataUri, { folder: 'brumoutloud_events' });
        return { url: result.secure_url };
    } catch (error) {
        console.error("Error uploading to Cloudinary:", error);
        return null;
    }
}

async function getDatesFromAI(eventName, startDate, recurringInfo) {
    const prompt = `You are an event scheduling assistant. An event named "${eventName}" is scheduled to start on ${startDate}. The user has provided the following rule for when it should recur: "${recurringInfo}". Generate a list of all future dates for this event for the next 3 months. Include the original start date. The dates must be a comma-separated list of YYYY-MM-DD strings.`;
    const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return [startDate];
    
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) return [startDate];
        const result = await response.json();
        const textResponse = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResponse) return textResponse.trim().split(',').map(d => d.trim());
        return [startDate];
    } catch (error) {
        console.error("Error calling AI:", error);
        return [startDate];
    }
}

// --- Main Handler ---
exports.handler = async function (event, context) {
    let submission;
    try {
        submission = await parser.parse(event);
    } catch (e) {
        return { statusCode: 400, body: "Error processing form data." };
    }

    try {
        const venueRecord = await findVenueRecord(submission.venue);
        const promoImageFile = submission.files.find(f => f.fieldname === 'promo-image');
        const uploadedImage = await uploadImage(promoImageFile);
        let datesToCreate = [];
        const recurringInfoText = submission['recurring-info'] || null;

        if (recurringInfoText && recurringInfoText.trim() !== '') {
            datesToCreate = await getDatesFromAI(submission['event-name'], submission.date, recurringInfoText);
        } else {
            datesToCreate.push(submission.date);
        }

        const recordsToCreate = datesToCreate.map((date, index) => {
            const fields = {
                "Event Name": submission['event-name'],
                "Description": submission.description,
                "Date": `${date}T${submission['start-time']}:00.000Z`,
                "Link": submission.link,
                "Status": "Pending Review",
                "VenueText": submission.venue,
            };

            if (venueRecord) fields["Venue"] = [venueRecord.id];
            if (uploadedImage) fields["Promo Image"] = [{ url: uploadedImage.url }];
            
            // **THE FIX:** If this is a recurring event, set the Parent Event Name.
            if (recurringInfoText) {
                fields["Parent Event Name"] = submission['event-name']; // The main name is the parent
                if (index === 0) {
                     fields["Recurring Info"] = recurringInfoText; // Only add text to the first instance
                }
            }
            return { fields };
        });

        const chunkSize = 10;
        for (let i = 0; i < recordsToCreate.length; i += chunkSize) {
            await base('Events').create(recordsToCreate.slice(i, i + chunkSize), { typecast: true });
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: `<!DOCTYPE html><html><head><title>Success</title><meta http-equiv="refresh" content="3;url=/events.html"></head><body style="font-family: sans-serif; text-align: center; padding-top: 50px;"><h1>Thank you!</h1><p>Your event has been submitted for review.</p><p>You will be redirected shortly.</p></body></html>`
        };
    } catch (error) {
        console.error("An error occurred during event submission:", error);
        return { statusCode: 500, body: `Error processing submission.` };
    }
};
