const Airtable = require('airtable');

// Helper function to find the Nth weekday of a month
// (e.g., the 3rd Tuesday of July 2025)
const getNthWeekdayOfMonth = (year, month, week, dayOfWeek) => {
    const date = new Date(year, month, 1);
    let count = 0;

    if (week > 0) { // For "First", "Second", "Third", "Fourth"
        // Find the first occurrence of the target dayOfWeek
        while (date.getDay() !== dayOfWeek) {
            date.setDate(date.getDate() + 1);
        }
        // Add the required number of weeks
        date.setDate(date.getDate() + (week - 1) * 7);
    } else { // For "Last" (week = -1)
        date.setMonth(date.getMonth() + 1); // Go to the first day of the next month
        date.setDate(0); // Go to the last day of the target month
        // Find the last occurrence of the target dayOfWeek
        while (date.getDay() !== dayOfWeek) {
            date.setDate(date.getDate() - 1);
        }
    }
    return date;
};


exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    try {
        const { AIRTABLE_PERSONAL_ACCESS_TOKEN, AIRTABLE_BASE_ID } = process.env;
        const base = new Airtable({ apiKey: AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(AIRTABLE_BASE_ID);
        const { eventId, recurrenceRule } = JSON.parse(event.body);

        if (!eventId || !recurrenceRule) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Missing eventId or recurrenceRule' }) };
        }

        // 1. Fetch the source event to use as a template
        const sourceEvent = await base('Events').find(eventId);
        const parentEventName = sourceEvent.fields['Parent Event Name'];

        if (!parentEventName) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Source event must have a "Parent Event Name" to update its series.' }) };
        }

        // 2. Find and archive all future events in the series
        const futureEventsToArchive = await base('Events').select({
            filterByFormula: `AND({Parent Event Name} = "${parentEventName}", IS_AFTER({Date}, TODAY()), {Status} = 'Approved')`
        }).all();

        const archivePayload = futureEventsToArchive.map(record => ({
            id: record.id,
            fields: { 'Status': 'Archived' }
        }));

        if (archivePayload.length > 0) {
            await base('Events').update(archivePayload);
        }

        // 3. Calculate the new dates based on the rule
        const newDates = [];
        const startDate = new Date(sourceEvent.fields.Date);
        const iterations = 52; // Create events for roughly the next year

        for (let i = 0; i < iterations; i++) {
            let nextDate = new Date(startDate);
            
            if (recurrenceRule.type === 'weekly') {
                // This logic would need to be more complex for multi-day weekly repeats
                // For now, it assumes the next week on the same day.
                nextDate.setDate(startDate.getDate() + (i + 1) * 7);
                newDates.push(nextDate);
            } else if (recurrenceRule.type === 'monthly') {
                const targetMonth = startDate.getMonth() + i + 1;
                const targetYear = startDate.getFullYear();
                
                if (recurrenceRule.monthly_type === 'date') {
                    nextDate = new Date(targetYear, targetMonth, recurrenceRule.monthly_day_of_month);
                } else if (recurrenceRule.monthly_type === 'day') {
                    nextDate = getNthWeekdayOfMonth(targetYear, targetMonth, parseInt(recurrenceRule.monthly_week, 10), parseInt(recurrenceRule.monthly_day_of_week, 10));
                }
                newDates.push(nextDate);
            }
        }
        
        // 4. Create new events
        const newEventRecords = newDates.map(date => {
            const newFields = { ...sourceEvent.fields };
            delete newFields.id; // Remove fields that shouldn't be copied
            delete newFields.createdTime;
            
            newFields.Date = date.toISOString().split('T')[0];
            // You might want to add your new structured recurrence fields here too
            // e.g., newFields['Recurrence Type'] = recurrenceRule.type;

            return { fields: newFields };
        });

        if (newEventRecords.length > 0) {
            await base('Events').create(newEventRecords);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true, 
                message: `Successfully updated series. Archived ${archivePayload.length} events and created ${newEventRecords.length} new events.`
            }),
        };

    } catch (error) {
        console.error("Error updating recurring series:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
