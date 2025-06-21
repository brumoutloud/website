// netlify/functions/get-venues.js
const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    try {
      const records = await base('Venues')
        .select({
          filterByFormula: "{Status} = 'Approved'",
          // **FIX**: Added all required fields to the select query
          fields: [
              'Name',
              'Description',
              'Slug',
              'Photo URL',           // Original photo URL
              'Photo Medium URL',    // Medium sized photo URL
              'Photo Thumbnail URL', // Thumbnail photo URL
              'Address',
              'Opening Hours',
              'Accessibility',
              'Website',
              'Instagram',
              'Facebook',
              'TikTok',
              'Contact Email',
              'Contact Phone',
              'Accessibility Rating',
              'Accessibility Features',
              'Parking Exception',
              'Vibe Tags',
              'Venue Features'
          ],
          maxRecords: 100, // Retain maxRecords if desired, or remove for all
        })
        .all();

      const venues = records.map((record) => {
        return {
          id: record.id,
          name: record.get('Name'),
          description: record.get('Description'),
          slug: record.get('Slug') || '',
          // Ensure photo URLs are structured correctly
          photo: {
              original: record.get('Photo URL') || null,
              medium: record.get('Photo Medium URL') || null,
              thumbnail: record.get('Photo Thumbnail URL') || null,
          },
          // **FIX**: Mapped all additional fields
          address: record.get('Address') || '',
          openingHours: record.get('Opening Hours') || '',
          accessibility: record.get('Accessibility') || '',
          website: record.get('Website') || '',
          instagram: record.get('Instagram') || '',
          facebook: record.get('Facebook') || '',
          tiktok: record.get('TikTok') || '',
          contactEmail: record.get('Contact Email') || '',
          contactPhone: record.get('Contact Phone') || '',
          accessibilityRating: record.get('Accessibility Rating') || '',
          parkingException: record.get('Parking Exception') || '',
          vibeTags: record.get('Vibe Tags') || [],
          venueFeatures: record.get('Venue Features') || [],
          accessibilityFeatures: record.get('Accessibility Features') || [],
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
