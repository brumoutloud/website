// v2 - Makes the function more robust and fetches the slug.
const Airtable = require('airtable');

// Add console.log to check if environment variables are being accessed
console.log('Airtable Personal Access Token available:', !!process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN);
console.log('Airtable Base ID available:', !!process.env.AIRTABLE_BASE_ID);

try {
  // Initialize Airtable client outside the handler, but ensure env vars are present
  // If this line fails, it might be due to missing env vars.
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

      console.log('Successfully fetched venues:', venues.length); // Log success
      return {
        statusCode: 200,
        body: JSON.stringify(venues),
      };
    } catch (error) {
      // Log the full error object and its message/stack for more details
      console.error('Error fetching venues within handler:', error);
      console.error('Error message:', error.message);
      if (error.stack) {
          console.error('Error stack:', error.stack);
      }
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to fetch venues' }),
      };
    }
  };
} catch (outerError) {
  // This catch block will capture errors during Airtable client initialization
  console.error('Error initializing Airtable client outside handler:', outerError);
  exports.handler = async function (event, context) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to initialize Airtable client' }),
    };
  };
}
