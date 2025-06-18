const Airtable = require('airtable');
const fetch = require('node-fetch');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// **NEW**: This function asks the Gemini AI to categorize an event
async function getCategoriesFromAI(eventName, eventDescription) {
    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY environment variable not set.");
    }
    
    // The list of valid categories you want the AI to choose from.
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
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`Gemini API request failed with status ${response.status}`);
            return []; // Return empty array on failure
        }

        const result = await response.json();
        const textResponse = result.candidates[0].content.parts[0].text;
        
        // Clean up the response to get valid JSON
        const jsonString = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        const categories = JSON.parse(jsonString);

        // Ensure the AI only returned valid categories
        return categories.filter(cat => validCategories.includes(cat));

    } catch (error) {
        console.error("Error parsing categories with AI:", error);
        return [];
    }
}


exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        console.log("Starting AI category cleanup script...");
        const recordsToUpdate = [];
        
        // 1. Fetch all records that are missing a category
        const records = await eventsTable.select({
            filterByFormula: "NOT({Category})",
            fields: ["Event Name", "Description"] // Fetch the fields we need
        }).all();

        console.log(`Found ${records.length} events without a category.`);

        // 2. For each record, ask the AI to categorize it
        for (const record of records) {
            const eventName = record.get("Event Name");
            const description = record.get("Description");

            if (eventName && description) {
                const categories = await getCategoriesFromAI(eventName, description);
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

        // 3. Update the records in Airtable in batches of 10
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
