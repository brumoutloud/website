const Airtable = require('airtable');

const getNthWeekdayOfMonth = (year, month, week, dayOfWeek) => {
    const date = new Date(Date.UTC(year, month, 1));
    if (week > 0) {
        let day = date.getUTCDay();
        let diff = (dayOfWeek - day + 7) % 7;
        date.setUTCDate(date.getUTCDate() + diff);
        date.setUTCDate(date.getUTCDate() + (week - 1) * 7);
    } else {
        date.setUTCMonth(date.getUTCMonth() + 1);
        date.setUTCDate(0);
        let day = date.getUTCDay();
        let diff = (dayOfWeek - day + 7) % 7;
        date.setUTCDate(date.getUTCDate() - diff);
    }
    if (date.getUTCMonth() !== month) return null;
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
        
        const sourceEvent = await base('Events').find(eventId);
        const parentEventName = sourceEvent.fields['Parent Event Name'];
        if (!parentEventName) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Source event must have a "Parent Event Name" to update its series.' }) };
        }

        const futureEventsToArchive = await base('Events').select({
            filterByFormula: `AND({Parent Event Name} = "${parentEventName.replace(/"/g, '\\"')}", IS_AFTER({Date}, TODAY()), {Status} = 'Approved')`
        }).all();
        const archivePayload = futureEventsToArchive.map(record => ({ id: record.id, fields: { 'Status': 'Archived' } }));
        if (archivePayload.length > 0) {
            for (let i = 0; i < archivePayload.length; i += 10) {
                await base('Events').update(archivePayload.slice(i, i + 10));
            }
        }
        
        const newDates = [];
        const startDate = new Date(sourceEvent.fields.Date + 'T00:00:00Z');
        
        if (recurrenceRule.type === 'weekly') {
            const daysOfWeek = recurrenceRule.weekly_days.map(d => parseInt(d, 10));
            if(daysOfWeek.length > 0) {
                let currentDate = new Date(startDate);
                currentDate.setUTCDate(currentDate.getUTCDate() + 1); // Start checking from the day after the source event
                for (let i = 0; i < 365; i++) { // Generate for the next year
                    if (daysOfWeek.includes(currentDate.getUTCDay())) {
                        newDates.push(new Date(currentDate));
                    }
                    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
                }
            }
        } else if (recurrenceRule.type === 'monthly') {
            const interval = recurrenceRule.monthly_interval > 0 ? recurrenceRule.monthly_interval : 1;
            for (let i = 0; i < 24; i++) { // Generate for the next 2 years
                let nextDate;
                const monthOffset = (i + 1) * interval;
                const currentTargetMonth = startDate.getUTCMonth() + monthOffset;
                const targetYear = startDate.getUTCFullYear() + Math.floor(currentTargetMonth / 12);
                const targetMonth = currentTargetMonth % 12;

                if (recurrenceRule.monthly_type === 'date') {
                    nextDate = new Date(Date.UTC(targetYear, targetMonth, recurrenceRule.monthly_day_of_month));
                } else if (recurrenceRule.monthly_type === 'day') {
                    nextDate = getNthWeekdayOfMonth(targetYear, targetMonth, parseInt(recurrenceRule.monthly_week, 10), parseInt(recurrenceRule.monthly_day_of_week, 10));
                }
                if (nextDate) newDates.push(nextDate);
            }
        }
        
        const newEventRecords = newDates.map(date => {
            const newFields = { ...sourceEvent.fields };
            delete newFields.id;
            delete newFields.createdTime;
            delete newFields['Auto-description'];
            newFields.Date = date.toISOString().split('T')[0];
            return { fields: newFields };
        });

        if (newEventRecords.length > 0) {
             for (let i = 0; i < newEventRecords.length; i += 10) {
                await base('Events').create(newEventRecords.slice(i, i + 10));
            }
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
