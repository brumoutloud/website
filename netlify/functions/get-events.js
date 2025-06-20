const fetch = require('node-fetch');

const AIRTABLE_API_KEY = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_NAME = 'Events';
// **THE FIX**: We now specify the new, pre-filtered view.
const VIEW_NAME = encodeURIComponent('Approved Upcoming');

// The list of fields we need.
const fields = [
    'Event Name', 'Description', 'Date', 'Promo Image', 'Slug', 
    'Recurring Info', 'Venue Name', 'Venue Slug', 'Category', 
    'VenueText', 'Link', 'Parent Event Name', 'Submitter Email'
].map(field => `fields%5B%5D=${encodeURIComponent(field)}`).join('&');

// The new URL is much simpler, as the filtering and sorting is handled by the view.
const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}?pageSize=50&${fields}&view=${VIEW_NAME}`;


exports.handler = async function (event, context) {
  try {
    const isAdminView = event.queryStringParameters.view === 'admin';
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
            offset: data.offset
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
