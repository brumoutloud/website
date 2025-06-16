const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  try {
    const records = await base('Events')
      .select({
        // The formula now filters for events that are today or in the future.
        filterByFormula: "AND({Status} = 'Approved', IS_AFTER({Date}, DATEADD(TODAY(), -1, 'days')))",
        sort: [{ field: 'Date', direction: 'asc' }],
        // **FIX:** Added 'Category' to the list of fields to fetch.
        fields: ['Event Name', 'Description', 'Date', 'Promo Image', 'Slug', 'Recurring Info', 'Venue Name', 'Venue Slug', 'Category']
      })
      .all();

    const events = records.map((record) => ({
      id: record.id,
      name: record.get('Event Name'),
      description: record.get('Description'),
      date: record.get('Date'),
      venue: record.get('Venue Name') ? record.get('Venue Name')[0] : 'TBC',
      image: record.get('Promo Image') ? record.get('Promo Image')[0].url : null,
      slug: record.get('Slug'),
      recurringInfo: record.get('Recurring Info'),
      // Add the category to the returned event object. It might be an array if it's a multi-select field.
      category: record.get('Category') || [] 
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
