const Airtable = require('airtable');

exports.handler = async (event, context) => {
    try {
        const { AIRTABLE_PERSONAL_ACCESS_TOKEN, AIRTABLE_BASE_ID } = process.env;
        const base = new Airtable({ apiKey: AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(AIRTABLE_BASE_ID);
        const { view, offset, category, venue, day } = event.queryStringParameters;
        const isAdminView = view === 'admin';

        if (isAdminView) {
            // --- ADMIN PANEL LOGIC (WORKING) ---
            let selectOptions = {
                view: "Approved Upcoming",
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
            // --- PUBLIC SITE LOGIC (CORRECTED AND REVERTED TO STABLE VERSION) ---
            const allRecords = [];
            const selectOptions = {
                // Using filterByFormula as it's more reliable than a view with hidden columns
                filterByFormula: "AND({Status} = 'Approved', IS_AFTER({Date}, DATEADD(TODAY(), -1, 'days')))",
                sort: [{ field: 'Date', direction: 'asc' }],
                fields: [
                    'Event Name', 'Description', 'Date', 'Promo Image', 'Slug', 
                    'Recurring Info', 'Venue Name', 'VenueText', 'Category'
                ]
            };

            const query = base('Events').select(selectOptions);
            await query.eachPage((records, fetchNextPage) => {
                records.forEach(record => allRecords.push(record));
                fetchNextPage();
            });
            
            // Map to the simple, flat structure the public page was originally built for.
            const events = allRecords.map((record) => ({
                id: record.id,
                name: record.get('Event Name'),
                description: record.get('Description'),
                date: record.get('Date'),
                venue: (record.get('Venue Name') ? record.get('Venue Name')[0] : record.get('VenueText')) || 'TBC',
                image: record.get('Promo Image') ? record.get('Promo Image')[0].url : null,
                slug: record.get('Slug'),
                recurringInfo: record.get('Recurring Info'),
                category: record.get('Category') || [],
            }));
            
            // Return the simple array directly, as the page expects.
            return {
                statusCode: 200,
                body: JSON.stringify(events),
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
