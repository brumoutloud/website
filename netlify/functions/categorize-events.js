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
    return 'gemini-1.5-flash';
}

async function getCategoriesFromAI(eventName, eventDescription, modelName) {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set.");
    
    const validCategories = ["Comedy", "Drag", "Live Music", "Men Only", "Party", "Pride", "Social", "Theatre", "Viewing Party", "Women Only", "Fetish", "Community", "Exhibition", "Health", "Quiz"];
    const prompt = `
        You are an event categorization assistant for a city events guide. Your task is to select the most appropriate categories for an event based on its name and description.
        You MUST select at least one category from this list: ${validCategories.join(', ')}.
        If you are unsure, make your best guess based on the available text. Do not leave the category blank.
        Return your answer as a JSON array of strings. For example: ["Drag", "Party"].
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
        const jsonString = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        const categories = JSON.parse(jsonString);
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
        let recordsToUpdate = [];
        let skippedCount = 0;
        let defaultCount = 0;
        let aiCount = 0;
        let lookupCount = 0;

        const recordsMissingCategory = await eventsTable.select({
            filterByFormula: "NOT({Category})",
            fields: ["Event Name", "Description"]
        }).all();

        for (const record of recordsMissingCategory) {
            const eventName = record.get("Event Name");
            const description = record.get("Description");
            
            if (eventName) {
                try {
                    const existingRecords = await eventsTable.select({
                        filterByFormula: `AND({Event Name} = "${eventName.replace(/"/g, '\\"')}", NOT({Category} = ''))`,
                        fields: ["Category"],
                        maxRecords: 1
                    }).firstPage();

                    if (existingRecords && existingRecords.length > 0) {
                        const categories = existingRecords[0].get("Category");
                        if (categories && categories.length > 0) {
                            recordsToUpdate.push({ id: record.id, fields: { "Category": categories } });
                            lookupCount++;
                            continue;
                        }
                    }
                } catch (e) {
                    console.error("Error during Airtable lookup:", e);
                }
            }
            
            if (eventName || description) {
                let categories = await getCategoriesFromAI(eventName, description, geminiModel);
                
                if (!categories || categories.length === 0) {
                    categories = ["Social"];
                    defaultCount++;
                } else {
                    aiCount++;
                }
                
                recordsToUpdate.push({ id: record.id, fields: { "Category": categories } });

            } else {
                skippedCount++;
            }
        }
        
        if (recordsToUpdate.length > 0) {
            const chunkSize = 10;
            for (let i = 0; i < recordsToUpdate.length; i += chunkSize) {
                await eventsTable.update(recordsToUpdate.slice(i, i + chunkSize));
            }
        }

        let summary = `Cleanup complete. Of ${recordsMissingCategory.length} events, ${recordsToUpdate.length} were updated: ${lookupCount} via name lookup, ${aiCount} via AI, and ${defaultCount} with a default.`;
        if (skippedCount > 0) {
            summary += ` Skipped ${skippedCount} events due to missing data.`;
        }

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
