// v8 - Renamed file to match the form name for automatic Netlify trigger.
const Airtable = require('airtable');

// Initialize Airtable client
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

// This is the main function that Netlify will run on form submission
exports.handler = async function (event, context) {
  try {
    // 1. Parse the submission data from the incoming event
    const submission = JSON.parse(event.body).payload.data;
    console.log("Received submission:", submission);

    let datesToCreate = [];

    // 2. Check if there's recurring info to process
    if (submission['recurring-info'] && submission['recurring-info'].trim() !== '') {
        console.log("Recurring info found:", submission['recurring-info']);
        // Use AI to get an array of dates
        datesToCreate = await getDatesFromAI(submission['event-name'], submission.date, submission['recurring-info']);
    } else {
        // If not recurring, just use the single date provided
        datesToCreate.push(submission.date);
        console.log("Single event, using date:", submission.date);
    }
    
    // 3. Prepare the records for Airtable
    const recordsToCreate = datesToCreate.map(date => {
        return {
            fields: {
                "Event Name": submission['event-name'],
                "Description": submission.description,
                "Date": `${date}T${submission['start-time']}:00.000Z`, // Combine date and time
                "Venue": submission.venue,
                "Link": submission.link,
                "Submitter Email": submission.email,
                "Promo Image": submission['promo-image'] ? [{ url: submission['promo-image'].url }] : null,
                "Status": "Pending Review" // Always set new events as pending
            }
        };
    });

    // 4. Create the records in Airtable in batches of 10
    console.log(`Preparing to create ${recordsToCreate.length} record(s) in Airtable.`);
    const batchSize = 10;
    for (let i = 0; i < recordsToCreate.length; i += batchSize) {
        const batch = recordsToCreate.slice(i, i + batchSize);
        console.log(`Creating batch of ${batch.length} records...`);
        await base('Events').create(batch);
    }

    console.log("Successfully created all records in Airtable.");
    return {
        statusCode: 200,
        body: "Submission processed successfully."
    };

  } catch (error) {
    console.error("An error occurred:", error);
    return {
        statusCode: 500,
        body: "Error processing submission."
    };
  }
};

// --- Helper Function to Call Gemini AI ---
async function getDatesFromAI(eventName, startDate, recurringInfo) {
    console.log("Calling AI to parse recurring info...");

    const prompt = `You are an event scheduling assistant. An event named "${eventName}" is scheduled to start on ${startDate}. The user has provided the following rule for when it should recur: "${recurringInfo}". Based on this rule, generate a list of all future dates for this event. Include the original start date in your list. The dates must be formatted as a comma-separated list of YYYY-MM-DD strings. Example output: 2025-07-04,2025-07-11,2025-07-18. If the "Recurring Info" field is empty or doesn't describe a clear rule, just return the original event's start date in YYYY-MM-DD format. Do not add any other text, explanation, or introductions.`;

    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }]
    };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("GEMINI_API_KEY environment variable is not set.");
        return [startDate]; // Fallback if no key is provided
    }

    try {
        // Using the exact model name from the user's screenshot
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("AI API request failed:", response.status, response.statusText, errorBody);
            return [startDate]; // Fallback to original date on failure
        }

        const result = await response.json();
        
        if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts[0]) {
            const dateString = result.candidates[0].content.parts[0].text.trim();
            console.log("AI responded with date string:", dateString);
            return dateString.split(',').map(d => d.trim());
        } else {
            console.error("Unexpected AI response format:", result);
            return [startDate]; // Fallback
        }
    } catch (error) {
        console.error("Error calling AI:", error);
        return [startDate]; // Fallback to original date on error
    }
}
