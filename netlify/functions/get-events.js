const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  try {
    const records = await base('Events')
      .select({
        filterByFormula: "AND({Status} = 'Approved', IS_AFTER({Date}, DATEADD(TODAY(), -1, 'days')))",
        sort: [{ field: 'Date', direction: 'asc' }],
        // **FIX**: Added 'VenueText' to the list of fields to fetch.
        fields: ['Event Name', 'Description', 'Date', 'Promo Image', 'Slug', 'Recurring Info', 'Venue Name', 'Venue Slug', 'Category', 'VenueText']
      })
      .all();

    const events = records.map((record) => {
      // **FIX**: If a linked 'Venue Name' exists, use it. Otherwise, fall back to the 'VenueText'.
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

    return {
      statusCode: 200,
      body: JSON.stringify(events),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch events' }),
    };
  }
};
