const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');
const fetch = require('node-fetch');

// Firebase and other initializations remain the same...

async function getDatesFromAI(startDate, recurrenceData, modelName) {
    let recurrenceRule = "";
    if (recurrenceData.frequency === 'weekly') {
        recurrenceRule = `the event repeats weekly, every ${recurrenceData.interval || 1} week(s)`;
        if (recurrenceData.days && recurrenceData.days.length > 0) {
            recurrenceRule += ` on ${recurrenceData.days.join(', ')}`;
        }
    } else if (recurrenceData.frequency === 'monthly') {
        recurrenceRule = `the event repeats monthly, every ${recurrenceData.interval || 1} month(s)`;
        if (recurrenceData.monthly_type === 'day_of_month') {
            recurrenceRule += ` on day ${recurrenceData.monthly_day} of the month`;
        } else if (recurrenceData.monthly_type === 'day_of_week') {
            recurrenceRule += ` on the ${recurrenceData.monthly_ordinal} ${recurrenceData.monthly_weekday} of the month`;
        }
    }

    const prompt = `Based on a start date of ${startDate}, and the rule that "${recurrenceRule}", provide a comma-separated list of all dates for the next 3 months in format YYYY-MM-DD. IMPORTANT: Only return the comma-separated list of dates and nothing else.`;
    
    console.log(`[getDatesFromAI] AI PROMPT: "${prompt}"`);

    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    // The rest of the AI call logic remains the same...
}

exports.handler = async function (event, context) {
    const geminiModel = 'gemini-1.5-flash';
    
    try {
        const submission = JSON.parse(event.body); 
        const eventsToCreate = submission.events;

        for (const eventData of eventsToCreate) {
            let datesToCreate = [];
            const startDate = eventData.date;
            
            if (eventData.recurrence_frequency && eventData.recurrence_frequency !== 'none' && startDate) {
                const recurrenceData = {
                    frequency: eventData.recurrence_frequency,
                    interval: eventData.recurrence_interval,
                    days: eventData.recurrence_days,
                    monthly_type: eventData.monthly_type,
                    monthly_day: eventData.monthly_day,
                    monthly_ordinal: eventData.monthly_ordinal,
                    monthly_weekday: eventData.monthly_weekday
                };
                datesToCreate = await getDatesFromAI(startDate, recurrenceData, geminiModel);
            } else if (startDate) {
                datesToCreate.push(startDate);
            } else {
                continue; 
            }

            const recordsToCreate = datesToCreate.map((date, index) => {
                const fields = {
                    'Event Name': eventData.name,
                    'Description': eventData.description,
                    'Date': `${date}T${eventData.time || '00:00'}:00.000Z`,
                    'Status': 'Approved',
                    'Link': eventData.link
                };
                if (eventData.venueId) fields['Venue'] = [eventData.venueId];
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
