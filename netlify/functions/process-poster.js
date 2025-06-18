const fetch = require('node-fetch');
const parser = require('lambda-multipart-parser');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
        
        const result = await parser.parse(event);
        const imageFile = result.files[0];
        if (!imageFile) throw new Error("No image file was uploaded.");

        const base64ImageData = imageFile.content.toString('base64');
        
        // **FIX:** Updated prompt to ask for more details
        const prompt = `
            You are an event listings assistant for a local LGBTQ+ guide in Birmingham, UK.
            Analyze the provided image (an event poster) and extract all relevant event details.
            The current year is 2025. If a year is not specified, assume it is 2025.
            Return the data as a JSON array of objects. Each object represents a single event and should have these keys: "name", "venue", "date" (YYYY-MM-DD), "time" (HH:MM 24-hour), "description", "ticketLink", and "categories" (an array of strings from this list: Comedy, Drag, Live Music, Men Only, Party, Pride, Social, Theatre, Viewing Party, Women Only, Fetish, Community, Exhibition, Health, Quiz).
            If a value isn't found, return an empty string or empty array.
            If the poster is for a recurring event (e.g., "Glittershit"), set a "parentEventName" key to the main series name.
        `;

        const payload = {
            contents: [{
                parts: [
                    { text: prompt },
                    { inline_data: { mime_type: imageFile.contentType, data: base64ImageData } }
                ]
            }]
        };

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
        
        const aiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            throw new Error(`Gemini API request failed: ${errorText}`);
        }

        const aiResult = await aiResponse.json();
        const textResponse = aiResult.candidates[0].content.parts[0].text;
        const jsonString = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedEvents = JSON.parse(jsonString);

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, events: parsedEvents }),
        };

    } catch (error) {
        console.error("Error processing poster:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
