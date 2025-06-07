// v11 - Re-adds saving of "Recurring Info" text to Airtable.
const Airtable = require('airtable');
const { parse } = require('querystring');

// Initialize Airtable client
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  try {
    const submission = parse(event.body);
    console.log("Received submission:", submission);

    let datesToCreate = [];
    const recurringInfoText = submission['recurring-info'] || null;

    if (recurringInfoText && recurringInfoText.trim() !== '') {
        console.log("Recurring info found:", recurringInfoText);
        datesToCreate = await getDatesFromAI(submission['event-name'], submission.date, recurringInfoText);
    } else {
        datesToCreate.push(submission.date);
        console.log("Single event, using date:", submission.date);
    }
    
    const recordsToCreate = datesToCreate.map((date, index) => {
        const fields = {
            "Event Name": submission['event-name'],
            "Description": submission.description,
            "Date": `${date}T${submission['start-time']}:00.000Z`,
            "Venue": submission.venue,
            "Link": submission.link,
            "Submitter Email": submission.email,
            "Status": "Pending Review"
        };
        // ONLY add the recurring info text to the VERY FIRST event in the series
        if (index === 0 && recurringInfoText) {
            fields["Recurring Info"] = recurringInfoText;
        }
        return { fields };
    });

    console.log(`Preparing to create ${recordsToCreate.length} record(s) in Airtable.`);
    const batchSize = 10;
    for (let i = 0; i < recordsToCreate.length; i += batchSize) {
        const batch = recordsToCreate.slice(i, i + batchSize);
        await base('Events').create(batch);
    }

    console.log("Successfully created records in Airtable.");
    
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `
            <!DOCTYPE html><html lang="en" class="dark"><head><meta charset="UTF-8"><title>Submission Received!</title><script src="https://cdn.tailwindcss.com"></script><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet"><style>body { font-family: 'Poppins', sans-serif; background-color: #121212; color: #EAEAEA; }</style></head><body class="flex flex-col items-center justify-center min-h-screen text-center p-4"><div class="bg-[#1e1e1e] p-8 rounded-2xl shadow-lg"><h1 class="text-4xl font-bold text-white mb-4">Thank You!</h1><p class="text-gray-300 mb-6">Your event has been submitted and is now pending review.</p><a href="/" class="bg-[#FADCD9] text-[#333333] px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity">Back to Homepage</a></div></body></html>`
    };

  } catch (error) {
    console.error("An error occurred:", error);
    return {
        statusCode: 500,
        body: `<html><body><h1>Error</h1><p>There was an error processing your submission. Please try again later.</p><pre>${error.toString()}</pre></body></html>`
    };
  }
};

// --- Helper Function to Call Gemini AI ---
async function getDatesFromAI(eventName, startDate, recurringInfo) {
    const prompt = `You are an event scheduling assistant. An event named "${eventName}" is scheduled to start on ${startDate}. The user has provided the following rule for when it should recur: "${recurringInfo}". Based on this rule, generate a list of all future dates for this event. Include the original start date in your list. The dates must be formatted as a comma-separated list of YYYY-MM-DD strings. Example output: 2025-07-04,2025-07-11,2025-07-18. If the "Recurring Info" field is empty or doesn't describe a clear rule, just return the original event's start date in YYYY-MM-DD format. Do not add any other text, explanation, or introductions.`;
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
            const dateString = result.candidates[0].content.parts[0].text.trim();
            return dateString.split(',').map(d => d.trim());
        }
        return [startDate];
    } catch (error) {
        console.error("Error calling AI:", error);
        return [startDate];
    }
}
