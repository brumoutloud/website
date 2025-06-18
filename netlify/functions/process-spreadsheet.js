const parser = require('lambda-multipart-parser');
const fetch = require('node-fetch');
const { parse } = require('csv-parse/sync');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
        
        const result = await parser.parse(event);
        const spreadsheetFile = result.files[0];
        if (!spreadsheetFile) throw new Error("No spreadsheet file was uploaded.");

        // Convert the file buffer into a string
        const fileContent = spreadsheetFile.content.toString('utf-8');
        
        // Use the csv-parse library to read the CSV data
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true
        });

        // Convert the parsed data back to a simple string to send to the AI
        const csvText = JSON.stringify(records);
        
        const prompt = `
            You are an event listings assistant.
            The following is a JSON array of objects parsed from a user's uploaded CSV file. The column names are messy.
            Your task is to analyze this data and return a clean JSON array of event objects.
            Each object should have the following keys: "name", "venue", "date" (YYYY-MM-DD), "time" (HH:MM 24-hour), and "description".
            Intelligently map the messy column names (e.g., "Event", "Title") to the correct keys.
            The current year is 2025. If a year is not specified, assume it is 2025.

            Messy Data: ${csvText}
        `;

        const payload = { contents: [{ parts: [{ text: prompt }] }] };
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
        console.error("Error processing spreadsheet:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
