const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');
const fetch = require('node-fetch');
const cloudinary = require('cloudinary').v2;
const admin = require('firebase-admin');

// ... (Firebase initialization code) ...
// ... (getGeminiModelName helper function) ...
// The above two blocks should be copied from the file in step 1

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
// ... (rest of the file is the same, just with the updated getDatesFromAI below)

// **FIX**: Added detailed logging to debug the AI response.
async function getDatesFromAI(startDate, recurringInfo, modelName) {
    console.log(`[getDatesFromAI] INPUT - startDate: "${startDate}", recurringInfo: "${recurringInfo}"`);
    
    if (!GEMINI_API_KEY) return [startDate];
    const prompt = `Based on a start date of ${startDate} and the recurrence rule "${recurringInfo}", provide a comma-separated list of all dates for the next 3 months in format<y_bin_413>-MM-DD. IMPORTANT: Only return the comma-separated list of dates and nothing else.`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
    
    try {
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) {
            console.error(`[getDatesFromAI] AI request failed with status: ${response.status}`);
            return [startDate];
        }
        const result = await response.json();
        const textResponse = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        console.log(`[getDatesFromAI] RAW AI RESPONSE: "${textResponse}"`);
        
        if (!textResponse) {
            console.log("[getDatesFromAI] AI returned no text response. Falling back to start date.");
            return [startDate];
        }

        const dateRegex = /\d{4}-\d{2}-\d{2}/g;
        const dates = textResponse.match(dateRegex);

        const finalDates = dates && dates.length > 0 ? dates : [startDate];
        console.log(`[getDatesFromAI] PARSED DATES:`, finalDates);

        return finalDates;
    } catch (error) {
        console.error("[getDatesFromAI] Error calling AI for dates:", error);
        return [startDate];
    }
}

// ... (The rest of the file, including exports.handler, remains the same)
