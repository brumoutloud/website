const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');
const fetch = require('node-fetch');

// Firebase and other initializations remain the same...

async function getDatesFromAI(startDate, recurrenceData, modelName) {
    // --- NEW: Build a structured prompt ---
    let prompt = `Based on a start date of ${startDate}, generate a comma-separated list of all dates for the next 3 months in YYYY-MM-DD format. The event repeats ${recurrenceData.frequency}`;
    if (recurrenceData.frequency === 'weekly') {
        prompt += `, every ${recurrenceData.interval || 1} week(s)`;
        if (recurrenceData.days && recurrenceData.days.length > 0) {
            prompt += ` on ${recurrenceData.days.join(', ')}.`;
        }
    }
    prompt += ` IMPORTANT: Only return the comma-separated list of dates and nothing else.`;
    
    console.log(`[getDatesFromAI] AI PROMPT: "${prompt}"`);

    // The rest of the AI call logic remains the same...
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    // ...
}

exports.handler = async function (event, context) {
    const geminiModel = 'gemini-1.5-flash'; // Hardcoded for simplicity, can be fetched from Firestore
    
    try {
        const submission = JSON.parse(event.body); // Assuming JSON body from "Approve All"
        const eventsToCreate = submission.events;

        for (const eventData of eventsToCreate) {
            let datesToCreate = [];
            const startDate = eventData.date;
            
            // --- NEW: Check for structured recurrence data ---
            if (eventData.recurrence_frequency && eventData.recurrence_frequency !== 'none' && startDate) {
                const recurrenceData = {
                    frequency: eventData.recurrence_frequency,
                    interval: eventData.recurrence_interval,
                    days: eventData.recurrence_days // This should be an array of day strings
                };
                datesToCreate = await getDatesFromAI(startDate, recurrenceData, geminiModel);
            } else if (startDate) {
                datesToCreate.push(startDate);
            } else {
                console.error("Skipping event due to missing date:", eventData);
                continue; // Skip this event if no date is provided
            }

            const recordsToCreate = datesToCreate.map((date, index) => {
                const fields = {
                    'Event Name': eventData.name,
                    'Description': eventData.description,
                    'Date': `${date}T${eventData.time || '00:00'}:00.000Z`,
                    'Status': 'Approved',
                    'Link': eventData.link
                };
                if (eventData.venueId) {
                    fields['Venue'] = [eventData.venueId];
                }
                return { fields };
            });

            const chunkSize = 10;
            for (let i = 0; i < recordsToCreate.length; i += chunkSize) {
                await base('Events').create(recordsToCreate.slice(i, i + chunkSize));
            }
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `Successfully processed ${eventsToCreate.length} event(s).` }),
        };

    } catch (error) {
        console.error("Error creating approved event(s):", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
