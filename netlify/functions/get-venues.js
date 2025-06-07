const Airtable = require('airtable');

// Configure Airtable using the same environment variables
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  try {
    const records = await base('Venues') // Correctly fetches from 'Venues' table
      .select({
        filterByFormula: "{Status} = 'Approved'",
        maxRecords: 100,
      })
      .all();

    const venues = records.map((record) => ({
      id: record.id,
      name: record.get('Name'),
      description: record.get('Description'),
      address: record.get('Address'),
      website: record.get('Website'),
      photo: record.get('Photo') ? record.get('Photo')[0].url : null,
      category: record.get('Category') || [],
    }));

    return {
      statusCode: 200,
      body: JSON.stringify(venues),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch venues' }),
    };
  }
};
