const Airtable = require('airtable');

exports.handler = async (event, context) => {
    try {
        const { AIRTABLE_PERSONAL_ACCESS_TOKEN, AIRTABLE_BASE_ID } = process.env;
        const base = new Airtable({ apiKey: AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(AIRTABLE_BASE_ID);
        const { view, offset, category, venue, day } = event.queryStringParameters;
        const isAdminView = view === 'admin';

        if (isAdminView) {
            // --- ADMIN PANEL LOGIC ---
            // This logic is for the admin panel, which requires paginated results.
            
            let selectOptions = {
                view: "Approved Events",
                sort: [{ field: 'Date', direction: 'desc' }],
            };

            // **THE FIX**: Only add the offset to the options if it's actually provided in the URL.
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
            // This logic is for the public events.html page.
            // It fetches all events from the 'Approved Upcoming' view first.
            
            let allRecords = await base('Events').select({
                view: "Approved Upcoming",
                sort: [{ field: 'Date', direction: 'asc' }],
            }).all();

            // Then, if URL filters are present, it filters the results.
            if (category) {
                allRecords = allRecords.filter(record => {
                    const categories = record.get('Category') || [];
                    return categories.includes(category);
                });
            }

            if (venue) {
                const venueRecIds = record.get('Venue') || [];
                allRecords = allRecords.filter(record => venueRecIds.includes(venue));
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

            // Map the final list of records to the format the page expects.
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
