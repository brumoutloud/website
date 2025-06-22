const Airtable = require('airtable');

exports.handler = async (event, context) => {
    try {
        const { AIRTABLE_PERSONAL_ACCESS_TOKEN, AIRTABLE_BASE_ID } = process.env;
        const base = new Airtable({ apiKey: AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(AIRTABLE_BASE_ID);
        const { view, offset, category, venue, day } = event.queryStringParameters;
        const isAdminView = view === 'admin';

        // Get the current date, normalized to midnight for accurate date range comparison
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (isAdminView) {
            // --- ADMIN PANEL LOGIC (WORKING) - NO CHANGES REQUIRED HERE ---
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
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*', // Ensure CORS is handled
                },
            };

        } else {
            // --- PUBLIC SITE LOGIC ---
            const allRecords = [];
            const selectOptions = {
                // Using filterByFormula to get approved and upcoming events
                filterByFormula: "AND({Status} = 'Approved', IS_AFTER({Date}, DATEADD(TODAY(), -1, 'days')))",
                sort: [{ field: 'Date', direction: 'asc' }],
                // ADDED: New fields for featured and boosted listings
                fields: [
                    'Event Name', 
                    'Description', 
                    'Date', 
                    'Promo Image', 
                    'Slug', 
                    'Recurring Info', 
                    'Venue Name', 
                    'VenueText', 
                    'Category',
                    'Featured Banner Start Date',   // Added field
                    'Featured Banner End Date',     // Added field
                    'Boosted Listing Start Date',   // Added field
                    'Boosted Listing End Date'      // Added field
                ]
            };

            const query = base('Events').select(selectOptions);
            await query.eachPage((records, fetchNextPage) => {
                records.forEach(record => allRecords.push(record));
                fetchNextPage();
            });
            
            // Map records to the desired structure and add isFeatured/isBoosted flags
            const events = allRecords.map((record) => {
                let isFeatured = false;
                let isBoosted = false;

                // Check for Featured Banner eligibility
                const featuredStartDate = record.get('Featured Banner Start Date') ? new Date(record.get('Featured Banner Start Date')) : null;
                const featuredEndDate = record.get('Featured Banner End Date') ? new Date(record.get('Featured Banner End Date')) : null;

                if (featuredStartDate) featuredStartDate.setHours(0, 0, 0, 0);
                if (featuredEndDate) featuredEndDate.setHours(23, 59, 59, 999); // Set to end of day for inclusive comparison

                if (featuredStartDate && featuredEndDate && today >= featuredStartDate && today <= featuredEndDate) {
                    isFeatured = true;
                }

                // Check for Boosted Listing eligibility
                const boostedStartDate = record.get('Boosted Listing Start Date') ? new Date(record.get('Boosted Listing Start Date')) : null;
                const boostedEndDate = record.get('Boosted Listing End Date') ? new Date(record.get('Boosted Listing End Date')) : null;

                if (boostedStartDate) boostedStartDate.setHours(0, 0, 0, 0);
                if (boostedEndDate) boostedEndDate.setHours(23, 59, 59, 999); // Set to end of day for inclusive comparison

                if (boostedStartDate && boostedEndDate && today >= boostedStartDate && today <= boostedEndDate) {
                    isBoosted = true;
                }

                return {
                    id: record.id,
                    name: record.get('Event Name'),
                    description: record.get('Description'),
                    date: record.get('Date'),
                    venue: (record.get('Venue Name') ? record.get('Venue Name')[0] : record.get('VenueText')) || 'TBC',
                    image: record.get('Promo Image') ? record.get('Promo Image')[0].url : null,
                    slug: record.get('Slug') || `#event-${record.id}`, // Fallback if slug is empty
                    recurringInfo: record.get('Recurring Info'),
                    category: record.get('Category') || [],
                    isFeatured: isFeatured, // ADDED: Feature flag
                    isBoosted: isBoosted   // ADDED: Boosted flag
                };
            });
            
            // No sorting by isFeatured/isBoosted here, as it's handled on the frontend (events.html)
            // or should be handled by another specific function if server-side sorting is preferred.
            // The frontend logic (events.html) is designed to filter featured events for the banner
            // and then sort the main grid by date.

            return {
                statusCode: 200,
                body: JSON.stringify(events),
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*', // Ensure CORS is handled
                },
            };
        }

    } catch (error) {
        console.error("Error in get-events function:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch events', details: error.message }),
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        };
    }
};
