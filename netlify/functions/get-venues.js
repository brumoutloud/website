// v2 - Makes the function more robust and fetches the slug.
const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  try {
    const records = await base('Venues')
      .select({
        filterByFormula: "{Status} = 'Approved'",
        maxRecords: 100,
      })
      .all();

    const venues = records.map((record) => {
      return {
        id: record.id,
        name: record.get('Name'),
        description: record.get('Description'),
        photo: record.get('Photo') ? record.get('Photo')[0].url : null,
        category: record.get('Category') || [], // Default to empty array if undefined
        slug: record.get('Slug') || '' // Safely get slug
      };
    });

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
