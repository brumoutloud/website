const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  try {
    const records = await base('Events')
      .select({
        filterByFormula: "AND({Status} = 'Approved', IS_AFTER({Date}, DATEADD(TODAY(), -1, 'days')))",
        sort: [{ field: 'Date', direction: 'asc' }],
        // Always fetch all fields; we'll decide how to format them below.
        fields: [
            'Event Name', 'Description', 'Date', 'Promo Image', 'Slug', 
            'Recurring Info', 'Venue Name', 'Venue Slug', 'Category', 
            'VenueText', 'Link', 'Parent Event Name', 'Submitter Email'
        ]
      })
      .all();

    // Check if the admin view is requested via a URL parameter e.g., ?view=admin
    const isAdminView = event.queryStringParameters.view === 'admin';

    if (isAdminView) {
        // If it's for the admin panel, return the full, detailed data structure
        const events = records.map((record) => {
            const fields = { ...record.fields };
            if (fields['Submitter Email']) {
                fields['Contact Email'] = fields['Submitter Email'];
                delete fields['Submitter Email'];
            }
            return {
                id: record.id,
                type: 'Event',
                fields: fields
            };
        });
        return { statusCode: 200, body: JSON.stringify(events) };

    } else {
        // Otherwise, return the original, public-safe data structure for your live site
        const events = records.map((record) => {
            const venueDisplay = record.get('Venue Name') ? record.get('Venue Name')[0] : (record.get('VenueText') || 'TBC');
            return {
                id: record.id,
                name: record.get('Event Name'),
                description: record.get('Description'),
                date: record.get('Date'),
                venue: venueDisplay,
                image: record.get('Promo Image') ? record.get('Promo Image')[0].url : null,
                slug: record.get('Slug'),
                recurringInfo: record.get('Recurring Info'),
                category: record.get('Category') || [] 
            };
        });
        return { statusCode: 200, body: JSON.stringify(events) };
    }
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch events' }),
    };
  }
};
