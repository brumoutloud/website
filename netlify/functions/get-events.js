const fetch = require('node-fetch');

const AIRTABLE_API_KEY = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_NAME = 'Events';

// The fields we need, URL-encoded for the API call
const fields = [
    'Event Name', 'Description', 'Date', 'Promo Image', 'Slug', 
    'Recurring Info', 'Venue Name', 'Venue Slug', 'Category', 
    'VenueText', 'Link', 'Parent Event Name', 'Submitter Email'
].map(field => `fields%5B%5D=${encodeURIComponent(field)}`).join('&');

// The filter formula, URL-encoded
const filterFormula = `filterByFormula=${encodeURIComponent("AND({Status} = 'Approved', IS_AFTER({Date}, DATEADD(TODAY(), -1, 'days')))")}`;

// The sorting options, URL-encoded
const sort = `sort%5B0%5D%5Bfield%5D=Date&sort%5B0%5D%5Bdirection%5D=asc`;

const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}?pageSize=50&${fields}&${filterFormula}&${sort}`;


exports.handler = async function (event, context) {
  try {
    const offset = event.queryStringParameters.offset;
    let url = BASE_URL;
    if (offset) {
      url += `&offset=${offset}`;
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    const data = await response.json();

    if (!response.ok) {
        console.error("Airtable API Error:", data);
        throw new Error(data.error?.message || 'Failed to fetch data from Airtable.');
    }

    const isAdminView = event.queryStringParameters.view === 'admin';
    let processedRecords;

    if (isAdminView) {
        processedRecords = data.records.map((record) => {
            const fields = { ...record.fields };
            if (fields['Submitter Email']) {
                fields['Contact Email'] = fields['Submitter Email'];
                delete fields['Submitter Email'];
            }
            return { id: record.id, type: 'Event', fields: fields };
        });
    } else {
        processedRecords = data.records.map((record) => {
            const venueDisplay = record.fields['Venue Name'] ? record.fields['Venue Name'][0] : (record.fields['VenueText'] || 'TBC');
            return {
                id: record.id,
                name: record.fields['Event Name'],
                description: record.fields['Description'],
                date: record.fields['Date'],
                venue: venueDisplay,
                image: record.fields['Promo Image'] ? record.fields['Promo Image'][0].url : null,
                slug: record.fields['Slug'],
                recurringInfo: record.fields['Recurring Info'],
                category: record.fields['Category'] || [] 
            };
        });
    }
    
    return { 
        statusCode: 200, 
        body: JSON.stringify({
            events: processedRecords,
            offset: data.offset // The offset for the next page comes directly from the API response
        }) 
    };

  } catch (error) {
    console.error("Error in get-events function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch events', details: error.message }),
    };
  }
};
