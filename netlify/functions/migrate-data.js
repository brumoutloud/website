const Airtable = require('airtable');
const fetch = require('node-fetch');

// --- CONFIGURATION ---
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');
const BASE_URL = 'https://brumoutloud.co.uk';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function getRenderedHtml(url) {
    console.log(`Step A: Fetching rendered HTML for: ${url}`);
    const scraperApiKey = process.env.SCRAPER_API_KEY;
    if (!scraperApiKey) throw new Error("SCRAPER_API_KEY environment variable not set.");
    
    const scraperUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(url)}&render=true`;

    try {
        const response = await fetch(scraperUrl, { timeout: 25000 }); // 25 second timeout
        console.log(`Step B: Scraper API response status: ${response.status}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Scraper API failed with status ${response.status}: ${errorText}`);
        }
        return await response.text();
    } catch (error) {
        console.error("Error in getRenderedHtml:", error);
        throw error; // Re-throw the error to be caught by the main handler
    }
}

async function parseEventsFromHtmlWithAI(html) {
    console.log("Step C: Passing HTML to Gemini AI for parsing...");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY environment variable not set.");

    const prompt = `From the following HTML, extract event information. Return a JSON array of objects, where each object has "name" (string) and "url" (string, the full href attribute). HTML: ${html}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        console.log(`Step D: Gemini API response status: ${response.status}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API failed with status ${response.status}: ${errorText}`);
        }
        const result = await response.json();
        const textResponse = result.candidates[0].content.parts[0].text;
        const jsonString = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Error in parseEventsFromHtmlWithAI:", error);
        throw error;
    }
}

// --- Main Handler ---
exports.handler = async function (event, context) {
    console.log("Migration function started.");
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const renderedHtml = await getRenderedHtml(BASE_URL);
        if (!renderedHtml) {
            throw new Error("Failed to get page content from scraper.");
        }

        const events = await parseEventsFromHtmlWithAI(renderedHtml);
        console.log(`Step E: AI parsing complete. Found ${events.length} potential events.`);

        let newEventsCount = 0;
        for (const eventData of events) {
            if (!eventData.name || !eventData.url) continue; // Skip invalid entries
            
            const existingRecords = await eventsTable.select({ filterByFormula: `{Event Name} = "${eventData.name.replace(/"/g, '\\"')}"` }).firstPage();
            if (existingRecords.length === 0) {
                await eventsTable.create([{
                    fields: {
                        'Event Name': eventData.name,
                        'Status': 'Approved',
                        'Description': `Imported from ${BASE_URL}${eventData.url}`
                    }
                }]);
                newEventsCount++;
            }
        }
        
        const summary = `Migration successful. Added ${newEventsCount} new events.`;
        console.log(summary);
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: summary }),
        };

    } catch (error) {
        console.error("!!! Migration Error in Handler:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
