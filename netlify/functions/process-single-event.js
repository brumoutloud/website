const Airtable = require('airtable');
const fetch = require('node-fetch');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');

async function getEventDetailsWithAI(html) {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) throw new Error("GEMINI_API_KEY environment variable not set.");

    const prompt = `From the following HTML of an event detail page, extract the event's name and its description. Return a single JSON object with "name" and "description" keys. HTML: ${html}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Gemini API request failed with status ${response.status}`);
    const result = await response.json();
    const textResponse = result.candidates[0].content.parts[0].text;
    const jsonString = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonString);
}

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { eventUrl } = JSON.parse(event.body);
        if (!eventUrl) return { statusCode: 400, body: JSON.stringify({ message: "eventUrl not provided." }) };

        const response = await fetch(eventUrl);
        const html = await response.text();
        const details = await getEventDetailsWithAI(html);

        if (details.name) {
            const existingRecords = await eventsTable.select({ filterByFormula: `{Event Name} = "${details.name.replace(/"/g, '\\"')}"` }).firstPage();
            if (existingRecords.length === 0) {
                await eventsTable.create([{
                    fields: {
                        'Event Name': details.name,
                        'Description': details.description || '',
                        'Status': 'Approved'
                    }
                }]);
                return { statusCode: 200, body: JSON.stringify({ success: true, status: 'created', name: details.name }) };
            } else {
                return { statusCode: 200, body: JSON.stringify({ success: true, status: 'skipped', name: details.name }) };
            }
        }
        return { statusCode: 200, body: JSON.stringify({ success: false, status: 'no_name_found' }) };

    } catch (error) {
        console.error("Error processing single event:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
