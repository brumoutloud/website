// v8 - Simplified for debugging. Fetches ONLY approved events.
const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  try {
    const records = await base('Events')
      .select({
        // The simplest possible formula to test the connection.
        filterByFormula: "{Status} = 'Approved'",
        sort: [{ field: 'Date', direction: 'asc' }],
        maxRecords: 100,
      })
      .all();

    const events = records.map((record) => ({
      id: record.id,
      name: record.get('Event Name'),
      description: record.get('Description'),
      date: record.get('Date'),
      venue: record.get('Venue'),
      image: record.get('Promo Image') ? record.get('Promo Image')[0].url : null,
      slug: record.get('Slug'),
      // recurringInfo is temporarily removed for debugging.
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
