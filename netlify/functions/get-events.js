const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async (event, context) => {
    try {
        const { view } = event.queryStringParameters;
        if (view === 'admin') {
            // Admin view logic remains unchanged
            const query = base('Events').select({ view: "Approved Upcoming", sort: [{ field: 'Date', direction: 'asc' }]});
            const allRecords = await query.all();
            const records = allRecords.map(record => ({ id: record.id, fields: record.fields }));
            return { statusCode: 200, body: JSON.stringify({ events: records, offset: allRecords.offset }) };
        }

        // --- PUBLIC SITE LOGIC ---
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const allRecords = await base('Events').select({
            filterByFormula: "AND({Status} = 'Approved', IS_AFTER({Date}, DATEADD(TODAY(), -1, 'days')))",
            sort: [{ field: 'Date', direction: 'asc' }],
            fields: [
                'Event Name', 'Description', 'Date', 'Promo Image', 'Slug', 
                'Venue Name', 'VenueText', 'Category',
                'Featured Banner Start Date', 'Featured Banner End Date',
                'Boosted Listing Start Date', 'Boosted Listing End Date'
            ]
        }).all();
        
        const events = allRecords.map((record) => {
            const fields = record.fields;
            let isFeatured = false;
            let isBoosted = false;

            const featuredStartDate = fields['Featured Banner Start Date'] ? new Date(fields['Featured Banner Start Date']) : null;
            const featuredEndDate = fields['Featured Banner End Date'] ? new Date(fields['Featured Banner End Date']) : null;
            if (featuredStartDate && featuredEndDate && today >= featuredStartDate && today <= new Date(featuredEndDate.getTime() + 86400000) ) { // Add one day to include end date
                isFeatured = true;
            }

            const boostedStartDate = fields['Boosted Listing Start Date'] ? new Date(fields['Boosted Listing Start Date']) : null;
            const boostedEndDate = fields['Boosted Listing End Date'] ? new Date(fields['Boosted Listing End Date']) : null;
            if (boostedStartDate && boostedEndDate && today >= boostedStartDate && today <= new Date(boostedEndDate.getTime() + 86400000) ) {
                isBoosted = true;
            }

            const promoImage = fields['Promo Image'] && fields['Promo Image'][0] ? fields['Promo Image'][0] : null;

            return {
                id: record.id,
                name: fields['Event Name'],
                description: fields['Description'],
                date: fields['Date'],
                venue: (fields['Venue Name'] ? fields['Venue Name'][0] : fields['VenueText']) || 'TBC',
                image: promoImage ? promoImage.url : null,
                // Add image dimensions for adaptive layout
                imageWidth: promoImage?.width,
                imageHeight: promoImage?.height,
                slug: fields['Slug'] || `#event-${record.id}`,
                category: fields['Category'] || [],
                isFeatured: isFeatured,
                isBoosted: isBoosted
            };
        });
        
        return {
            statusCode: 200,
            body: JSON.stringify(events),
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        };

    } catch (error) {
        console.error("Error in get-events function:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch events', details: error.message }),
        };
    }
};
