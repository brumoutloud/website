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

/**
 * FIX #1 (REVISED): This function now handles uploading an image file to Cloudinary
 * by converting its content to a base64 string, which is much more reliable.
 */
async function uploadImage(file) {
    if (!file) return null;
    try {
        const base64String = file.content.toString('base64');
        const dataUri = `data:${file.contentType};base64,${base64String}`;
        const result = await cloudinary.uploader.upload(dataUri, {
            folder: 'brumoutloud_events',
        });
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

    if (!apiKey) {
        console.warn("GEMINI_API_KEY is not set. Falling back to single date.");
        return [startDate];
    }
    
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("AI API response was not OK:", response.status, errorBody);
            return [startDate];
        }

        const result = await response.json();
        const textResponse = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResponse) {
            return textResponse.trim().split(',').map(d => d.trim());
        }
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
        console.error("Error parsing form data:", e);
        return { statusCode: 400, body: "Error processing form data." };
    }

    try {
        const venueRecord = await findVenueRecord(submission.venue);
        const venueLinkId = venueRecord ? [venueRecord.id] : null;

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
            const eventName = submission['event-name'];
            
            const fields = {
                "Event Name": eventName,
                "Description": submission.description,
                /**
                 * FIX #2 (REVISED): Forcing a full ISO 8601 string with a Z (for UTC).
                 * This is the most reliable way to ensure Airtable parses the time correctly.
                 * The time will be displayed in the user's local time on the front-end.
                 */
                "Date": `${date}T${submission['start-time']}:00.000Z`,
                "Link": submission.link,
                "Status": "Pending Review",
                "VenueText": submission.venue,
            };

            if (venueLinkId) {
                fields["Venue"] = venueLinkId;
            }
            if (index === 0 && recurringInfoText) {
                fields["Recurring Info"] = recurringInfoText;
            }
            if (uploadedImage) {
                fields["Promo Image"] = [{ url: uploadedImage.url }];
            }
            return { fields };
        });

        const chunkSize = 10;
        for (let i = 0; i < recordsToCreate.length; i += chunkSize) {
            const chunk = recordsToCreate.slice(i, i + chunkSize);
            await base('Events').create(chunk, { typecast: true });
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: `<!DOCTYPE html><html><head><title>Success</title><meta http-equiv="refresh" content="3;url=/events.html"></head><body style="font-family: sans-serif; text-align: center; padding-top: 50px;"><h1>Thank you!</h1><p>Your event has been submitted for review.</p><p>You will be redirected shortly.</p></body></html>`
        };
    } catch (error) {
        console.error("An error occurred during event submission:", error);
        const errorMessage = error.message || "Unknown error.";
        return { 
            statusCode: 500, 
            body: `<html><body><h1>Error</h1><p>There was an error processing your submission: ${errorMessage}</p></body></html>`
        };
    }
};
