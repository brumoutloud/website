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
            const allRecords = await base('Events').select({
                view: "Approved Events",
                sort: [{ field: 'Date', direction: 'desc' }],
                offset: offset,
            }).all();

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
            
            // 1. Fetch all records from the reliable 'Approved Upcoming' view.
            let allRecords = await base('Events').select({
                view: "Approved Upcoming",
                sort: [{ field: 'Date', direction: 'asc' }],
            }).all();

            // 2. If filters are present, apply them to the results in our code.
            // This is safer and more flexible than creating a complex formula.
            if (category) {
                allRecords = allRecords.filter(record => {
                    const categories = record.get('Category') || [];
                    return categories.includes(category);
                });
            }

            if (venue) {
                // Assuming Venue is a linked record, we check the first ID.
                const venueIds = record.get('Venue') || [];
                allRecords = allRecords.filter(record => venueIds.includes(venue));
            }
            
            if (day) {
                const targetDay = new Date(day).setHours(0,0,0,0);
                 allRecords = allRecords.filter(record => {
                    const eventDate = new Date(record.get('Date')).setHours(0,0,0,0);
                    const endDate = record.get('End Date') ? new Date(record.get('End Date')).setHours(0,0,0,0) : null;
                    if(endDate) {
                        return targetDay >= eventDate && targetDay <= endDate;
                    }
                    return targetDay === eventDate;
                 });
            }

            // 3. Map the final list of records to the format the page expects.
            const events = allRecords.map((record) => ({
                id: record.id,
                name: record.get('Event Name'),
                description: record.get('Description'),
                date: record.get('Date'),
                venue: record.get('VenueText') || (record.get('Venue Name') ? record.get('Venue Name')[0] : 'TBC'),
                image: record.get('Promo Image') ? record.get('Promo Image')[0].url : null,
                slug: record.get('Slug'),
                recurringInfo: record.get('Recurring Info'),
                category: record.get('Category') || [],
            }));

            return {
                statusCode: 200,
                body: JSON.stringify({ events: events, offset: null }), // Public page expects an 'events' property.
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
