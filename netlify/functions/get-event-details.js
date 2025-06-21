const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  const slug = event.path.split("/").pop();
  if (!slug) { return { statusCode: 400, body: 'Error: Event slug not provided.' }; }

  try {
    const eventRecords = await base('Events').select({
        maxRecords: 1,
        filterByFormula: `{Slug} = "${slug}"`,
        fields: ['Event Name', 'Description', 'Date', 'Promo Image', 'Link', 'Recurring Info', 'Venue', 'Venue Name', 'Venue Slug', 'Parent Event Name', 'VenueText', 'Category']
    }).firstPage();

    if (!eventRecords || eventRecords.length === 0) {
      return { statusCode: 404, body: `Event not found.` };
    }

    const eventRecord = eventRecords[0];
    const fields = eventRecord.fields;
    const eventName = fields['Event Name'];
    const parentEventName = fields['Parent Event Name'];
    const recurringInfo = fields['Recurring Info'];
    let allFutureInstances = [];

    let filterFormula;
    if (parentEventName) {
        const parentNameForQuery = parentEventName.replace(/"/g, '\\"');
        filterFormula = `AND({Parent Event Name} = "${parentNameForQuery}", IS_AFTER({Date}, DATEADD(TODAY(),-1,'days')))`
    } else if (recurringInfo) {
        const eventNameForQuery = eventName.replace(/"/g, '\\"');
        filterFormula = `AND({Event Name} = "${eventNameForQuery}", {Recurring Info}, IS_AFTER({Date}, DATEADD(TODAY(),-1,'days')))`
    }

    if (filterFormula) {
        const futureInstanceRecords = await base('Events').select({
            filterByFormula: filterFormula,
            sort: [{ field: 'Date', direction: 'asc' }]
        }).all();
        allFutureInstances = futureInstanceRecords.map(rec => rec.fields);
    }
    
    // --- START MODIFICATION for Task 2 ---
    let venueName = fields['VenueText'] || 'TBC';
    let venueHtml = `<p class="text-2xl font-semibold">${venueName}</p>`; // Default to plain text
    
    const venueId = fields['Venue'] ? fields['Venue'][0] : null;

    if (venueId) {
        try {
            const venueRecord = await base('Venues').find(venueId);
            const status = venueRecord.get('Listing Status');
            const name = venueRecord.get('Name');
            const slug = venueRecord.get('Slug');

            venueName = name || venueName; // Use fetched name if available

            if (status === 'Listed' && slug) {
                venueHtml = `<a href="/venue/${slug}" class="text-2xl font-semibold hover:text-white underline">${venueName}</a>`;
            } else {
                venueHtml = `<p class="text-2xl font-semibold">${venueName}</p>`;
            }
        } catch (venueError) {
            console.error("Could not fetch linked venue, falling back to text.", venueError);
            // venueHtml is already set to the fallback, so we just log the error.
        }
    }
    // --- END MODIFICATION for Task 2 ---

    let suggestedEventsHtml = '';
    const primaryEventCategories = fields['Category'] || []; 
    const currentEventId = eventRecord.id;

    if (primaryEventCategories.length > 0) {
        const categoryFilterString = primaryEventCategories.map(cat => `FIND("${cat.replace(/"/g, '\\"')}", ARRAYJOIN({Category}, ","))`).join(', ');
        const suggestedEventsFilter = `AND({Status} = 'Approved', IS_AFTER({Date}, TODAY()), NOT(RECORD_ID() = '${currentEventId}'), OR(${categoryFilterString}))`;
        const suggestedRecords = await base('Events').select({
            filterByFormula: suggestedEventsFilter,
            sort: [{ field: 'Date', direction: 'asc' }],
            maxRecords: 6,
            fields: ['Event Name', 'Date', 'Promo Image', 'Slug', 'Venue Name', 'VenueText']
        }).all();
        if (suggestedRecords.length > 0) {
          // Unchanged suggested events logic...
        }
    }

    const eventDate = new Date(fields['Date']);
    const description = fields['Description'] || 'No description provided.';
    const pageUrl = `https://brumoutloud.co.uk${event.path}`;
    const imageUrl = fields['Promo Image'] ? fields['Promo Image'][0].url : 'https://placehold.co/1200x675/1a1a1a/f5efe6?text=Brum+Out+Loud';

    const calendarData = { /* Unchanged */ };
    const otherInstancesToDisplay = allFutureInstances.filter(inst => inst.Date !== fields['Date']);
    const otherInstancesHTML = otherInstancesToDisplay.slice(0, 5).map(instance => { /* Unchanged */ }).join('');

    // --- FINAL HTML CONSTRUCTION ---
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        // --- Unchanged Head ---
      </head>
      <body class="antialiased">
        <div id="header-placeholder"></div>
        <main class="container mx-auto px-8 py-16">
            <div class="grid lg:grid-cols-3 gap-16">
                <div class="lg:col-span-2">
                    // --- Unchanged Hero/Description ---
                </div>
                <div class="lg:col-span-1">
                    <div class="card-bg p-8 sticky top-8 space-y-6">
                        <div>
                            <h3 class="font-bold text-lg accent-color-secondary mb-2">Date & Time</h3>
                            <p class="text-2xl font-semibold">${eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                            <p class="text-xl text-gray-400">${eventDate.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' })}</p>
                            ${recurringInfo ? `<p class="mt-2 inline-block bg-teal-400/10 text-teal-300 text-xs font-semibold px-2 py-1 rounded-full">${recurringInfo}</p>` : ''}
                        </div>
                         <div>
                            <h3 class="font-bold text-lg accent-color-secondary mb-2">Location</h3>
                            ${venueHtml} 
                         </div>
                        ${fields['Link'] ? `<a href="${fields['Link']}" target="_blank" rel="noopener noreferrer" class="block w-full text-center bg-accent-color text-white font-bold py-4 px-6 rounded-lg hover:opacity-90 transition-opacity text-xl">GET TICKETS</a>` : ''}
                        <div id="add-to-calendar-section" class="border-t border-gray-700 pt-6">
                            // --- Unchanged Calendar Section ---
                        </div>
                    </div>
                </div>
            </div>
            ${suggestedEventsHtml}
        </main>
        <div id="footer-placeholder"></div>
        <script>
            // --- Unchanged Script ---
        </script>
      </body>
      </html>
    `;

    return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: html };

  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: 'Server error fetching event details.' };
  }
};
