const Airtable = require('airtable');
const fetch = require('node-fetch');

// --- CONFIGURATION ---
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');
const BASE_URL = 'https://brumoutloud.co.uk';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- Helper Functions ---
async function getRenderedHtml(url) {
    // This function uses a "headless browser" API to get the fully rendered HTML.
    // This example uses a generic endpoint. You can use services like ScraperAPI or Browserless.
    // You would need to sign up for a service and get an API key.
    console.log(`Fetching fully rendered HTML for: ${url}`);
    const scraperApiKey = process.env.SCRAPER_API_KEY; // You'll need to set this in Netlify
    if (!scraperApiKey) {
        throw new Error("SCRAPER_API_KEY environment variable not set.");
    }
    const scraperUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(url)}&render=true`;

    try {
        const response = await fetch(scraperUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch rendered HTML. Status: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.error("Error getting rendered HTML:", error);
        return null;
    }
}

async function parseEventsFromHtmlWithAI(html) {
    console.log("Passing HTML to Gemini AI for parsing...");
    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY environment variable not set.");
    }

    const prompt = `
        From the following HTML content, extract a list of all events. For each event, provide its name and the full URL to its detail page. Return the data as a JSON array of objects, where each object has a "name" and a "url" key.
        
        HTML:
        ${html}
    `;

    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Gemini API request failed with status ${response.status}`);
        }

        const result = await response.json();
        const textResponse = result.candidates[0].content.parts[0].text;
        
        // Clean up the response from the AI to get clean JSON
        const jsonString = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonString);

    } catch (error) {
        console.error("Error parsing HTML with AI:", error);
        return [];
    }
}


// --- Main Handler ---
exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const renderedHtml = await getRenderedHtml(BASE_URL);
        if (!renderedHtml) {
            return { statusCode: 500, body: JSON.stringify({ success: false, message: "Failed to get page content." }) };
        }

        const events = await parseEventsFromHtmlWithAI(renderedHtml);
        console.log(`AI parsing complete. Found ${events.length} events.`);

        let newEventsCount = 0;
        for (const eventData of events) {
            // Check if event already exists to avoid duplicates
            const existingRecords = await eventsTable.select({ filterByFormula: `{Event Name} = "${eventData.name}"` }).firstPage();
            if (existingRecords.length === 0) {
                await eventsTable.create([{
                    fields: {
                        'Event Name': eventData.name,
                        'Status': 'Approved',
                        // We can add more scraping for description etc. later
                    }
                }]);
                newEventsCount++;
                console.log(`Inserted new event: ${eventData.name}`);
            } else {
                console.log(`Skipping existing event: ${eventData.name}`);
            }
        }
        
        const summary = `Migration complete. Added ${newEventsCount} new events.`;
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: summary }),
        };

    } catch (error) {
        console.error("Migration Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
