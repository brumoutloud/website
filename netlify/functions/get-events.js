const Airtable = require('airtable');
const fetch = require('node-fetch');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const AIRTABLE_API_KEY = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

exports.handler = async function (event, context) {
  try {
    const isAdminView = event.queryStringParameters.view === 'admin';

    // **FIX**: The function now has two distinct paths for the public site vs. the admin panel.
    if (isAdminView) {
        // --- ADMIN PANEL LOGIC (Paginated) ---
        const TABLE_NAME = 'Events';
        const fields = [
            'Event Name', 'Description', 'Date', 'Promo Image', 'Slug', 
            'Recurring Info', 'Venue Name', 'Venue Slug', 'Category', 
            'VenueText', 'Link', 'Parent Event Name', 'Submitter Email'
        ].map(field => `fields%5B%5D=${encodeURIComponent(field)}`).join('&');
        const filterFormula = `filterByFormula=${encodeURIComponent("AND({Status} = 'Approved', IS_AFTER({Date}, DATEADD(TODAY(), -1, 'days')))")}`;
        const sort = `sort%5B0%5D%5Bfield%5D=Date&sort%5B0%5D%5Bdirection%5D=asc`;
        const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}?pageSize=50&${fields}&${filterFormula}&${sort}`;
        
        const offset = event.queryStringParameters.offset;
        let url = BASE_URL;
        if (offset) {
          url += `&offset=${offset}`;
        }
        const response = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message);

        const processedRecords = data.records.map((record) => {
            const fields = { ...record.fields };
            if (fields['Submitter Email']) {
                fields['Contact Email'] = fields['Submitter Email'];
                delete fields['Submitter Email'];
            }
            return { id: record.id, type: 'Event', fields: fields };
        });
        
        return { 
            statusCode: 200, 
            body: JSON.stringify({ events: processedRecords, offset: data.offset }) 
        };

    } else {
        // --- PUBLIC SITE LOGIC (Fetch All) ---
        const allRecords = [];
        await base('Events').select({
            filterByFormula: "AND({Status} = 'Approved', IS_AFTER({Date}, DATEADD(TODAY(), -1, 'days')))",
            sort: [{ field: 'Date', direction: 'asc' }],
            fields: ['Event Name', 'Description', 'Date', 'Promo Image', 'Slug', 'Recurring Info', 'Venue Name', 'Venue Slug', 'Category', 'VenueText']
        }).eachPage((records, fetchNextPage) => {
            records.forEach(record => allRecords.push(record));
            fetchNextPage();
        });

        const events = allRecords.map((record) => {
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
        // Return a simple array, as the public page expects.
        return { statusCode: 200, body: JSON.stringify(events) };
    }

  } catch (error) {
    console.error("Error in get-events function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch events', details: error.message }),
    };
  }
};
