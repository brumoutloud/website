const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    try {
      const records = await base('Venues')
        .select({
          filterByFormula: "{Status} = 'Approved'",
          // Add the new photo URL fields to the request
          fields: ['Name', 'Description', 'Slug', 'Category', 'Photo Medium URL', 'Photo Thumbnail URL'],
          maxRecords: 100,
        })
        .all();

      const venues = records.map((record) => {
        return {
          id: record.id,
          name: record.get('Name'),
          description: record.get('Description'),
          // Create a photo object with the different sizes
          photo: {
              medium: record.get('Photo Medium URL') || null,
              thumbnail: record.get('Photo Thumbnail URL') || null,
          },
          category: record.get('Category') || [],
          slug: record.get('Slug') || ''
        };
      });

      console.log('Successfully fetched venues:', venues.length);
      return {
        statusCode: 200,
        body: JSON.stringify(venues),
      };
    } catch (error) {
      console.error('Error fetching venues within handler:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to fetch venues' }),
      };
    }
};
