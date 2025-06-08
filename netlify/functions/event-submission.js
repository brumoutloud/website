// v13 - Adds promo image handling and unique slugs for recurring events.
const Airtable = require('airtable');
const parser = require('lambda-multipart-parser'); // Changed from querystring

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

async function findVenueRecord(venueName) {
    if (!venueName) return null;
    const formula = `OR(LOWER({Name}) = LOWER("${venueName}"), FIND(LOWER("${venueName}"), LOWER({Aliases})))`;
    try {
        const records = await base('Venues').select({ maxRecords: 1, filterByFormula: formula }).firstPage();
        return records.length > 0 ? records[0] : null;
    } catch (error) {
        console.error("Error finding venue:", error);
        return null;
    }
}

// Helper function to generate a URL-friendly slug
function generateSlug(text) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')      // Replace spaces with -
        .replace(/[^\w-]+/g, '')   // Remove all non-word chars
        .replace(/--+/g, '-');     // Replace multiple - with single -
}

exports.handler = async function (event, context) {
    let submission = {};
    try {
        // Use lambda-multipart-parser to handle multipart form data (including files)
        const result = await parser.parse(event);
        submission = result;
    } catch (e) {
        console.error("Error parsing form data:", e);
        return { statusCode: 400, body: "Error processing form data." };
    }

    console.log("Received submission:", submission);

    try {
        const venueRecord = await findVenueRecord(submission.venue);
        const venueLinkId = venueRecord ? [venueRecord.id] : null;

        let datesToCreate = [];
        const recurringInfoText = submission['recurring-info'] || null;

        if (recurringInfoText && recurringInfoText.trim() !== '') {
            datesToCreate = await getDatesFromAI(submission['event-name'], submission.date, recurringInfoText);
        } else {
            datesToCreate.push(submission.date);
        }

        let promoImageAttachment = null;
        if (submission.files && submission.files.length > 0) {
            const promoFile = submission.files.find(f => f.fieldname === 'promo-image');
            if (promoFile && promoFile.url) { // Netlify might provide a temporary URL here
                promoImageAttachment = [{ url: promoFile.url, filename: promoFile.filename }];
                console.log("Promo image file found with URL:", promoFile.url);
            } else if (promoFile) {
                // If no URL is provided by parser directly, it means the file is raw data.
                // For Airtable Attachment field, a public URL is usually required.
                // This part would need a separate upload step to a service like Cloudinary.
                console.warn("Promo image file found but no direct URL from parser. Skipping attachment for now.");
            }
        }

        const recordsToCreate = datesToCreate.map((date, index) => {
            const eventName = submission['event-name'];
            // Generate a unique slug by appending the date to the event name slug
            const uniqueSlug = generateSlug(`${eventName}-${date}`);

            const fields = {
                "Event Name": eventName,
                "Description": submission.description,
                "Date": `${date}T${submission['start-time']}:00.000Z`,
                "Link": submission.link,
                "Submitter Email": submission.email,
                "Status": "Pending Review",
                "VenueText": submission.venue, // Store original submitted text
                "Slug": uniqueSlug, // Assign the unique slug
            };
            if (venueLinkId) {
                fields["Venue"] = venueLinkId; // Link to the found venue record
            }
            if (index === 0 && recurringInfoText) { // Only add recurring info to the first instance
                fields["Recurring Info"] = recurringInfoText;
            }
            if (promoImageAttachment) {
                fields["Promo Image"] = promoImageAttachment;
            }
            return { fields };
        });

        const chunkSize = 10;
        for (let i = 0; i < recordsToCreate.length; i += chunkSize) {
            const chunk = recordsToCreate.slice(i, i + chunkSize);
            await base('Events').create(chunk, { typecast: true });
            console.log(`Successfully created chunk ${Math.floor(i / chunkSize) + 1} with ${chunk.length} record(s).`);
        }

        console.log(`Successfully created ${recordsToCreate.length} record(s) in total.`);
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: `<!DOCTYPE html><html><head><title>Success</title></head><body><h1>Thank you!</h1><p>Your event has been submitted.</p><a href="/">Back to site</a></body></html>`
        };
    } catch (error) {
        console.error("An error occurred during event submission:", error);
        return { statusCode: 500, body: `Error processing submission: ${error.message || 'Unknown error.'}` };
    }
};

async function getDatesFromAI(eventName, startDate, recurringInfo) {
    const prompt = `You are an event scheduling assistant. An event named "${eventName}" is scheduled to start on ${startDate}. The user has provided the following rule for when it should recur: "${recurringInfo}". Generate a list of all future dates for this event. Include the original start date. The dates must be a comma-separated list of YYYY-MM-DD strings.`;
    const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return [startDate]; 
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorBody = await response.text();
            console.error("AI API response not OK:", response.status, errorBody);
            return [startDate];
        }
        const result = await response.json();
        if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts[0]) {
            return result.candidates[0].content.parts[0].text.trim().split(',').map(d => d.trim());
        }
        return [startDate];
    } catch (error) {
        console.error("Error calling AI:", error);
        return [startDate];
    }
}
