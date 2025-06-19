const Airtable = require('airtable');
const fetch = require('node-fetch');
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

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function getCategoriesFromAI(eventName, eventDescription, modelName) {
    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY environment variable not set.");
    }
    
    const validCategories = ["Comedy", "Drag", "Live Music", "Men Only", "Party", "Pride", "Social", "Theatre", "Viewing Party", "Women Only", "Fetish", "Community", "Exhibition", "Health", "Quiz"];

    const prompt = `
        You are an event categorization assistant for an LGBTQ+ listings website.
        Based on the event name and description, please select the most appropriate categories from the provided list.
        Return your answer as a JSON array of strings. For example: ["Drag", "Comedy"].
        If no category seems appropriate, return an empty array.

        Valid Categories: ${validCategories.join(', ')}

        Event Name: "${eventName}"
        Event Description: "${eventDescription}"
    `;

    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`Gemini API request failed with status ${response.status}`);
            return [];
        }

        const result = await response.json();
        const textResponse = result.candidates[0].content.parts[0].text;
        
        const jsonString = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        const categories = JSON.parse(jsonString);

        return categories.filter(cat => validCategories.includes(cat));

    } catch (error) {
        console.error("Error parsing categories with AI:", error);
        return [];
    }
}


exports.handler = async function (event, context) {
    const geminiModel = await getGeminiModelName();
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        console.log("Starting AI category cleanup script...");
        const recordsToUpdate = [];
        
        const records = await eventsTable.select({
            filterByFormula: "NOT({Category})",
            fields: ["Event Name", "Description"]
        }).all();

        console.log(`Found ${records.length} events without a category.`);

        for (const record of records) {
            const eventName = record.get("Event Name");
            const description = record.get("Description");

            if (eventName && description) {
                const categories = await getCategoriesFromAI(eventName, description, geminiModel);
                if (categories.length > 0) {
                    recordsToUpdate.push({
                        id: record.id,
                        fields: { "Category": categories }
                    });
                     console.log(`Categorized "${eventName}" as: ${categories.join(', ')}`);
                } else {
                     console.log(`Could not categorize "${eventName}".`);
                }
            }
        }
        
        console.log(`Prepared to update ${recordsToUpdate.length} records with new categories.`);

        const chunkSize = 10;
        for (let i = 0; i < recordsToUpdate.length; i += chunkSize) {
            const chunk = recordsToUpdate.slice(i, i + chunkSize);
            await eventsTable.update(chunk);
        }

        const summary = `Cleanup complete. Added categories to ${recordsToUpdate.length} events.`;
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
