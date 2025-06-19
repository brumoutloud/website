const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  try {
    const isAdminView = event.queryStringParameters.view === 'admin';
    const offset = event.queryStringParameters.offset;

    // This is the query that will be paginated
    const query = base('Events').select({
      filterByFormula: "AND({Status} = 'Approved', IS_AFTER({Date}, DATEADD(TODAY(), -1, 'days')))",
      sort: [{ field: 'Date', direction: 'asc' }],
      pageSize: 50, // Fetch 50 records per page
      fields: [
          'Event Name', 'Description', 'Date', 'Promo Image', 'Slug', 
          'Recurring Info', 'Venue Name', 'Venue Slug', 'Category', 
          'VenueText', 'Link', 'Parent Event Name', 'Submitter Email'
      ]
    });

    // Fetch a single page of records
    const page = await query.firstPage();
    
    // The Airtable API provides an 'offset' for the next page, which we'll use for pagination
    const responseData = {
        records: page,
        offset: page.offset,
    };

    let events;

    if (isAdminView) {
        events = responseData.records.map((record) => {
            const fields = { ...record.fields };
            if (fields['Submitter Email']) {
                fields['Contact Email'] = fields['Submitter Email'];
                delete fields['Submitter Email'];
            }
            return {
                id: record.id,
                type: 'Event',
                fields: fields
            };
        });
    } else {
        events = responseData.records.map((record) => {
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
            events: events,
            offset: responseData.offset // Send the offset back to the client
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
