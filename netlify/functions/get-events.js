const Airtable = require('airtable');

exports.handler = async (event, context) => {
    try {
        const { AIRTABLE_PERSONAL_ACCESS_TOKEN, AIRTABLE_BASE_ID } = process.env;
        const base = new Airtable({ apiKey: AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(AIRTABLE_BASE_ID);
        const { view, offset, category, venue, day } = event.queryStringParameters;
        const isAdminView = view === 'admin';

        if (isAdminView) {
            // --- ADMIN PANEL LOGIC ---
            let selectOptions = {
                view: "Approved Upcoming",
                // Corrected sort order to be ascending (soonest to furthest)
                sort: [{ field: 'Date', direction: 'asc' }],
            };

            if (offset) {
                selectOptions.offset = offset;
            }

            const query = base('Events').select(selectOptions);
            const allRecords = await query.all();

            const records = allRecords.map(record => ({
                id: record.id,
                fields: record.fields
            }));

            return {
                statusCode: 200,
                body: JSON.stringify({ events: records, offset: allRecords.offset }),
            };

        } else {
            // --- PUBLIC SITE LOGIC ---
            let selectOptions = {
                view: "Approved Upcoming",
                sort: [{ field: 'Date', direction: 'asc' }],
                // **THE FIX**: Explicitly request all fields needed by events.html
                // This ensures we get the data even if columns are hidden in the Airtable view.
                fields: [
                    'Event Name', 'Description', 'Date', 'End Date', 'Promo Image', 
                    'Slug', 'Recurring Info', 'Venue', 'Venue Name', 
                    'VenueText', 'Category'
                ]
            };
            
            let allRecords = await base('Events').select(selectOptions).all();

            // Post-fetch filtering for category, venue, or day
            if (category) {
                allRecords = allRecords.filter(record => (record.get('Category') || []).includes(category));
            }
            if (venue) {
                allRecords = allRecords.filter(record => (record.get('Venue') || []).includes(venue));
            }
            if (day) {
                const targetDay = new Date(day).setHours(0, 0, 0, 0);
                allRecords = allRecords.filter(record => {
                    const eventDate = new Date(record.get('Date')).setHours(0, 0, 0, 0);
                    const endDate = record.get('End Date') ? new Date(record.get('End Date')).setHours(0, 0, 0, 0) : null;
                    if (endDate) {
                        return targetDay >= eventDate && targetDay <= endDate;
                    }
                    return targetDay === eventDate;
                });
            }

            const events = allRecords.map(record => ({
                id: record.id,
                fields: record.fields
            }));

            return {
                statusCode: 200,
                body: JSON.stringify({ events: events, offset: null }),
            };
        }

    } catch (error) {
        console.error("Error in get-events function:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch events', details: error.message }),
        };
    }
};
