const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  try {
    const isAdminView = event.queryStringParameters.view === 'admin';
    const offset = event.queryStringParameters.offset;

    const query = base('Events').select({
      filterByFormula: "AND({Status} = 'Approved', IS_AFTER({Date}, DATEADD(TODAY(), -1, 'days')))",
      sort: [{ field: 'Date', direction: 'asc' }],
      pageSize: 50, // We will fetch 50 records at a time
      fields: [
          'Event Name', 'Description', 'Date', 'Promo Image', 'Slug', 
          'Recurring Info', 'Venue Name', 'Venue Slug', 'Category', 
          'VenueText', 'Link', 'Parent Event Name', 'Submitter Email'
      ]
    });

    // Fetch a single page of up to 50 records.
    // The 'offset' tells Airtable which page to start from.
    const page = await query.all({ offset: offset });

    // We get a new offset for the *next* page, which we send to the client.
    const newOffset = page.offset;
    let processedRecords;

    if (isAdminView) {
        processedRecords = page.map((record) => {
            const fields = { ...record.fields };
            if (fields['Submitter Email']) {
                fields['Contact Email'] = fields['Submitter Email'];
                delete fields['Submitter Email'];
            }
            return { id: record.id, type: 'Event', fields: fields };
        });
    } else {
        processedRecords = page.map((record) => {
            const venueDisplay = record.get('Venue Name') ? record.get('Venue Name')[0] : (record.get('VenueText') || 'TBC');
            return {
                id: record.id,
                name: record.get('Event Name'),
                description: record.get('Description'),
                date: record.get('Date'),
                venue: venueDisplay,
                image: record.get('Promo Image') ? record.get('Promo Image')[0].url : null,
                slug: record.get('Slug'),
                recurringInfo: record.get('Recurring Info'),
                category: record.get('Category') || [] 
            };
        });
    }
    
    return { 
        statusCode: 200, 
        body: JSON.stringify({
            events: processedRecords,
            offset: newOffset // Send the offset for the next page back to the client
        }) 
    };

  } catch (error) {
    console.error("Error fetching events:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch events', details: error.toString() }),
    };
  }
};
