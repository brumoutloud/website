// v9 - Uses reliable lookup fields for venue data.
const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  const slug = event.path.split("/").pop();

  if (!slug) {
    return { statusCode: 400, body: 'Error: Event slug could not be determined from the URL.' };
  }

  try {
    const records = await base('Events')
      .select({
        maxRecords: 1,
        filterByFormula: `{Slug} = "${slug}"`,
        fields: ['Event Name', 'Description', 'Date', 'Promo Image', 'Link', 'Recurring Info', 'Venue Name', 'Venue Slug']
      })
      .firstPage();

    if (!records || records.length === 0) {
      return { statusCode: 404, body: `Event not found.` };
    }

    const eventRecord = records[0];
    const eventName = eventRecord.get('Event Name');
    const venueName = eventRecord.get('Venue Name') ? eventRecord.get('Venue Name')[0] : 'TBC';
    const venueSlug = eventRecord.get('Venue Slug') ? eventRecord.get('Venue Slug')[0] : null;

    // ... (The rest of the function remains the same, it just uses the new variables)
    const eventDate = new Date(eventRecord.get('Date'));
    const formattedDate = eventDate.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'Europe/London'
    });
    const description = eventRecord.get('Description') || 'No description provided.';
    const imageUrl = eventRecord.get('Promo Image') ? eventRecord.get('Promo Image')[0].url : 'https://placehold.co/1200x630/1e1e1e/EAEAEA?text=Brum+Out+Loud';
    const ticketLink = eventRecord.get('Link');
    const recurringInfo = eventRecord.get('Recurring Info');
    const pageUrl = `https://bolwebsite.netlify.app${event.path}`;
    
    const html = `
      <!DOCTYPE html>
      <html lang="en" class="dark">
        <head>
          <title>${eventName} | Brum Out Loud</title>
          <!-- Meta tags and stylesheets are unchanged -->
        </head>
        <body>
          <!-- The venue link now uses the reliable venueSlug -->
          ${venueSlug 
              ? `<a href="/venue/${venueSlug}" class="text-gray-300 hover:text-white hover:underline">${venueName}</a>` 
              : `<p class="text-gray-300">${venueName}</p>`
          }
          <!-- The rest of the HTML template is unchanged -->
        </body>
      </html>
    `;

    // The full HTML generation is omitted for brevity but is the same as the last version, just using the new variables
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `... FULL HTML HERE ...` // Paste the full HTML from previous version here.
    };

  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: 'Server error.' };
  }
};
