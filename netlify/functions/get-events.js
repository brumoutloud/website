// This is our Netlify Function, a secure bridge to Airtable.
const Airtable = require('airtable');

// Configure Airtable using environment variables for security
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  try {
    const records = await base('Events')
      .select({
        // Select only records where the Status is 'Approved'
        filterByFormula: "{Status} = 'Approved'",
        // Sort by the event date, earliest first
        sort: [{ field: 'Date', direction: 'asc' }],
        maxRecords: 100, // Adjust as needed
      })
      .all();

    // Clean up the data to send back to the website
    const events = records.map((record) => ({
      id: record.id,
      name: record.get('Event Name'),
      description: record.get('Description'),
      date: record.get('Date'),
      venue: record.get('Venue'),
      recurringInfo: record.get('Recurring Info'),
      image: record.get('Promo Image') ? record.get('Promo Image')[0].url : null,
      // You can add more fields here if needed, like 'Category'
    }));

    return {
      statusCode: 200,
      body: JSON.stringify(events),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch events' }),
    };
  }
};
