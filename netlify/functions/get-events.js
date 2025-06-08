// v8 - Uses reliable lookup fields for venue data.
const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  try {
    const records = await base('Events')
      .select({
        filterByFormula: "AND({Status} = 'Approved', IS_AFTER({Date}, TODAY()))",
        sort: [{ field: 'Date', direction: 'asc' }],
        // Request the new lookup fields
        fields: ['Event Name', 'Description', 'Date', 'Promo Image', 'Slug', 'Recurring Info', 'Venue Name', 'Venue Slug']
      })
      .all();

    const events = records.map((record) => ({
      id: record.id,
      name: record.get('Event Name'),
      description: record.get('Description'),
      date: record.get('Date'),
      venue: record.get('Venue Name') ? record.get('Venue Name')[0] : 'TBC', // Use lookup field
      image: record.get('Promo Image') ? record.get('Promo Image')[0].url : null,
      slug: record.get('Slug'),
      recurringInfo: record.get('Recurring Info')
    }));

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
