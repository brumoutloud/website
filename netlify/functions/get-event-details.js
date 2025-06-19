const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  try {
    const records = await base('Events')
      .select({
        filterByFormula: "AND({Status} = 'Approved', IS_AFTER({Date}, DATEADD(TODAY(), -1, 'days')))",
        sort: [{ field: 'Date', direction: 'asc' }],
        // **FIX**: Fetching all fields needed for both display and editing.
        fields: [
            'Event Name', 'Description', 'Date', 'Promo Image', 'Slug', 
            'Recurring Info', 'Venue Name', 'Venue Slug', 'Category', 
            'VenueText', 'Link', 'Parent Event Name', 'Submitter Email'
        ]
      })
      .all();

    // **FIX**: Return events in the same format as the approvals queue to reuse the edit logic.
    const events = records.map((record) => {
      const fields = { ...record.fields };
      if (fields['Submitter Email']) {
          fields['Contact Email'] = fields['Submitter Email'];
          delete fields['Submitter Email'];
      }

      return {
        id: record.id,
        type: 'Event', // Add type for consistency
        fields: fields
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
