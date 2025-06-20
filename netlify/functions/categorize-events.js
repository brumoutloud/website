const Airtable = require('airtable');
const fetch = require('node-fetch');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK for fetching settings
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
} catch (error) { console.error("Firebase Admin Initialization Error:", error); }
const db = admin.firestore();

// Initialize Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Helper to get the Gemini model name from Firestore
async function getGeminiModelName() {
    try {
        const doc = await db.collection('settings').doc('gemini').get();
        if (doc.exists && doc.data().modelName) {
            return doc.data().modelName;
        }
    } catch (error) {
        console.error("Error fetching Gemini model from Firestore:", error);
    }
    // Fallback to a default model if not found or on error
    return 'gemini-1.5-flash';
}

async function getCategoriesFromAI(eventName, eventDescription, modelName) {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set.");
    
    const validCategories = ["Comedy", "Drag", "Live Music", "Men Only", "Party", "Pride", "Social", "Theatre", "Viewing Party", "Women Only", "Fetish", "Community", "Exhibition", "Health", "Quiz"];
    const prompt = `
        You are an event categorization assistant. Based on the event name and description, select the most appropriate categories from this list: ${validCategories.join(', ')}.
        Return your answer as a JSON array of strings. For example: ["Drag", "Party"]. If no category seems appropriate, return an empty array.
        Event Name: "${eventName}"
        Event Description: "${eventDescription}"
    `;

    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        if (!response.ok) {
             console.error(`AI API call failed with status: ${response.status}`);
             return [];
        }
        const result = await response.json();
        const textResponse = result.candidates[0].content.parts[0].text;
        // Clean the response to ensure it's valid JSON
        const jsonString = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        const categories = JSON.parse(jsonString);
        // Ensure all returned categories are from the valid list
        return categories.filter(cat => validCategories.includes(cat));
    } catch (error) {
        console.error("Error parsing categories with AI:", error);
        return [];
    }
}

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }
    try {
        const geminiModel = await getGeminiModelName();
        const recordsToUpdate = [];
        const recordsMissingCategory = await eventsTable.select({
            filterByFormula: "NOT({Category})",
            fields: ["Event Name", "Description"]
        }).all();

        for (const record of recordsMissingCategory) {
            const eventName = record.get("Event Name");
            const description = record.get("Description");
            // Only process if we have something to work with
            if (eventName || description) {
                const categories = await getCategoriesFromAI(eventName, description, geminiModel);
                if (categories.length > 0) {
                    recordsToUpdate.push({
                        id: record.id,
                        fields: { "Category": categories }
                    });
                }
            }
        }
        
        if (recordsToUpdate.length > 0) {
            // Airtable's update method can handle up to 10 records at a time.
            const chunkSize = 10;
            for (let i = 0; i < recordsToUpdate.length; i += chunkSize) {
                await eventsTable.update(recordsToUpdate.slice(i, i + chunkSize));
            }
        }
        const summary = `Cleanup complete. Added categories to ${recordsToUpdate.length} of ${recordsMissingCategory.length} events found without a category.`;
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: summary }),
        };
    } catch (error) {
        console.error("Categorization Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
