const parser = require('lambda-multipart-parser');
const fetch = require('node-fetch');
const xlsx = require('xlsx'); 
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
        });
    }
} catch (error) {
    console.error("Firebase Admin Initialization Error:", error);
}
const db = admin.firestore();

// Helper to get Gemini model name from Firestore
async function getGeminiModelName() {
    try {
        const doc = await db.collection('settings').doc('gemini').get();
        if (doc.exists && doc.data().modelName) {
            return doc.data().modelName;
        }
    } catch (error) {
        console.error("Error fetching Gemini model from Firestore:", error);
    }
    return 'gemini-2.5-flash';
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

exports.handler = async function (event, context) {
    const geminiModel = await getGeminiModelName();
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
        
        const result = await parser.parse(event);
        const spreadsheetFile = result.files[0];
        if (!spreadsheetFile) throw new Error("No spreadsheet file was uploaded.");

        let csvText;

        if (spreadsheetFile.contentType.includes('spreadsheetml') || spreadsheetFile.contentType.includes('ms-excel')) {
            const workbook = xlsx.read(spreadsheetFile.content, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            csvText = xlsx.utils.sheet_to_csv(worksheet);
        } else {
            csvText = spreadsheetFile.content.toString('utf-8');
        }
        
        const prompt = `
            You are an event listings assistant.
            The following is raw CSV data from a user's uploaded spreadsheet. The column names may be messy or inconsistent.
            Your task is to analyze this data and return a clean JSON array of event objects.
            Each object should have the following keys: "name", "venue", "date" (in YY-MM-DD format), "time" (in HH:MM 24-hour format), and "description".
            Intelligently map the messy column names (e.g., "Event", "Title") to the correct keys.
            The current year is 2025. If a year is not specified, assume it is 2025.

            CSV Data:
            ${csvText}
        `;

        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`;
        
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
