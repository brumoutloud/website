const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');
const fetch = require('node-fetch');

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

function generateSlug(text) {
    return text.toString().toLowerCase().trim()
        .replace(/\s+/g, '-')      // Replace spaces with -
        .replace(/[^\w-]+/g, '')   // Remove all non-word chars
        .replace(/--+/g, '-');     // Replace multiple - with single -
}

async function getDatesFromAI(eventName, startDate, recurringInfo) {
    // Construct the prompt for the AI
    const prompt = `You are an event scheduling assistant. An event named "${eventName}" is scheduled to start on ${startDate}. The user has provided the following rule for when it should recur: "${recurringInfo}". Generate a list of all future dates for this event for the next 3 months. Include the original start date. The dates must be a comma-separated list of YYYY-MM-DD strings.`;
    
    // Set up the request payload for the Gemini API
    const payload = { 
        contents: [{ 
            role: "user", 
            parts: [{ text: prompt }] 
        }] 
    };
    
    const apiKey = process.env.GEMINI_API_KEY;

    // If there's no API key, we can't proceed, so just return the single start date
    if (!apiKey) {
        console.warn("GEMINI_API_KEY is not set. Falling back to single date.");
        return [startDate];
    }
    
    try {
        // Call the Gemini API
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("AI API response was not OK:", response.status, errorBody);
            return [startDate]; // Fallback to single date on API error
        }

        const result = await response.json();
        
        // Safely parse the response from the AI
        const textResponse = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResponse) {
            // Clean up the response and split it into an array of dates
            return textResponse.trim().split(',').map(d => d.trim());
        }
        
        // If the response is not as expected, fall back to the single date
        return [startDate];

    } catch (error) {
        console.error("Error calling AI:", error);
        return [startDate]; // Fallback to single date on network or other errors
    }
}

exports.handler = async function (event, context) {
    let submission = {};
    try {
        const result = await parser.parse(event);
        submission = result;
    } catch (e) {
        console.error("Error parsing form data:", e);
        return { statusCode: 400, body: "Error processing form data." };
    }

    try {
        const venueRecord = await findVenueRecord(submission.venue);
        const venueLinkId = venueRecord ? [venueRecord.id] : null;

        let datesToCreate = [];
        const recurringInfoText = submission['recurring-info'] || null;

        // If the user has provided recurring info, call the AI to get all dates
        if (recurringInfoText && recurringInfoText.trim() !== '') {
            datesToCreate = await getDatesFromAI(submission['event-name'], submission.date, recurringInfoText);
        } else {
            // Otherwise, just use the single date provided
            datesToCreate.push(submission.date);
        }

        // Prepare the records for Airtable
        const recordsToCreate = datesToCreate.map((date, index) => {
            const eventName = submission['event-name'];
            const uniqueSlug = generateSlug(`${eventName}-${date}`);

            const fields = {
                "Event Name": eventName,
                "Description": submission.description,
                "Date": `${date}T${submission['start-time']}:00.000Z`,
                "Link": submission.link,
                "Status": "Pending Review",
                "VenueText": submission.venue,
                "Slug": uniqueSlug,
            };
            if (venueLinkId) {
                fields["Venue"] = venueLinkId;
            }
            // Only add the recurring info text to the first event in the series
            if (index === 0 && recurringInfoText) {
                fields["Recurring Info"] = recurringInfoText;
            }
            return { fields };
        });

        // Airtable's API can only create 10 records at a time, so we process in chunks
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
        return { statusCode: 500, body: `Error processing submission.` };
    }
};
