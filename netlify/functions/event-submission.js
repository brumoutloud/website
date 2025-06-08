// v12 - Adds logic to find and link to existing venues.
const Airtable = require('airtable');
const { parse } = require('querystring');

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

exports.handler = async function (event, context) {
    let submission = {};
    try {
        submission = parse(event.body);
    } catch (e) {
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

        const recordsToCreate = datesToCreate.map((date, index) => {
            const fields = {
                "Event Name": submission['event-name'],
                "Description": submission.description,
                "Date": `${date}T${submission['start-time']}:00.000Z`,
                "Link": submission.link,
                "Submitter Email": submission.email,
                "Status": "Pending Review",
                "VenueText": submission.venue, // Store original submitted text
            };
            if (venueLinkId) {
                fields["Venue"] = venueLinkId; // Link to the found venue record
            }
            if (index === 0 && recurringInfoText) {
                fields["Recurring Info"] = recurringInfoText;
            }
            return { fields };
        });

        await base('Events').create(recordsToCreate, { typecast: true });

        console.log(`Successfully created ${recordsToCreate.length} record(s).`);
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: `<!DOCTYPE html><html><head><title>Success</title></head><body><h1>Thank you!</h1><p>Your event has been submitted.</p><a href="/">Back to site</a></body></html>`
        };
    } catch (error) {
        console.error("An error occurred:", error);
        return { statusCode: 500, body: "Error processing submission." };
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
        if (!response.ok) return [startDate];
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
