const fetch = require('node-fetch');
const parser = require('lambda-multipart-parser');
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
        const imageFile = result.files[0];
        if (!imageFile) throw new Error("No image file was uploaded.");

        const base64ImageData = imageFile.content.toString('base64');
        
        const prompt = `
            You are an event listings assistant for a local LGBTQ+ guide in Birmingham, UK.
            Analyze the provided image (an event poster) and extract all relevant event details.
            The current year is 2025. If a year is not specified, assume it is 2025.
            Return the data as a JSON array of objects. Each object represents a single event and should have these keys: "name", "venue", "date" (YYYY-MM-DD), "time" (HH:MM 24-hour), "description", "ticketLink", "contactEmail", and "categories" (an array of strings from the list: Comedy, Drag, Live Music, Men Only, Party, Pride, Social, Theatre, Viewing Party, Women Only, Fetish, Community, Exhibition, Health, Quiz).
            If a value isn't found, return an empty string or empty array.
            If the poster is for a recurring event, set a "parentEventName" key to the main series name.
        `;

        const payload = {
            contents: [{
                parts: [
                    { text: prompt },
                    { inline_data: { mime_type: imageFile.contentType, data: base64ImageData } }
                ]
            }]
        };

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
        console.error("Error processing poster:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
