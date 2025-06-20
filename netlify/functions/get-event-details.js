const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  const slug = event.path.split("/").pop();
  if (!slug) { return { statusCode: 400, body: 'Error: Event slug not provided.' }; }

  try {
    const eventRecords = await base('Events').select({
        maxRecords: 1,
        filterByFormula: `{Slug} = "${slug}"`,
        fields: ['Event Name', 'Description', 'Date', 'Promo Image', 'Link', 'Recurring Info', 'Venue Name', 'Venue Slug', 'Parent Event Name', 'VenueText', 'Category', 'Slug']
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

    // --- Fetch other instances in the same series ---
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

    // --- NEW: Fetch suggested events based on category ---
    let suggestedEventsHTML = '';
    const primaryCategories = fields.Category || [];
    if (primaryCategories.length > 0) {
        const categoryFormulas = primaryCategories.map(cat => `FIND('${cat.replace(/'/g, "\\'")}', ARRAYJOIN(Category))`);
        const suggestedEventsFilter = `AND(
            {Status} = 'Approved',
            IS_AFTER({Date}, TODAY()),
            RECORD_ID() != '${eventRecord.id}',
            OR(${categoryFormulas.join(', ')})
        )`;
        
        const suggestedRecords = await base('Events').select({
            filterByFormula: suggestedEventsFilter,
            sort: [{field: 'Date', direction: 'asc'}],
            maxRecords: 3,
            fields: ['Event Name', 'Date', 'Promo Image', 'VenueText', 'Slug']
        }).all();

        if (suggestedRecords.length > 0) {
            suggestedEventsHTML = suggestedRecords.map(rec => {
                const f = rec.fields;
                const d = new Date(f.Date);
                const day = d.toLocaleDateString('en-GB', { day: 'numeric' });
                const month = d.toLocaleDateString('en-GB', { month: 'short' });
                const img = f['Promo Image'] ? f['Promo Image'][0].url : 'https://placehold.co/600x400/171717/FFF?text=Image';
                return `
                    <a href="/event/${rec.id}/${f.Slug}" class="event-card">
                        <div class="relative">
                            <img src="${img}" alt="${f['Event Name']}" class="w-full h-48 object-cover rounded-t-lg">
                            <div class="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-white text-center rounded-md p-2 w-16">
                                <p class="text-2xl font-bold">${day}</p>
                                <p class="text-sm uppercase">${month}</p>
                            </div>
                        </div>
                        <div class="p-4">
                            <h3 class="font-bold text-xl text-white truncate">${f['Event Name']}</h3>
                            <p class="text-gray-400 text-sm truncate">${f.VenueText || 'Venue TBC'}</p>
                        </div>
                    </a>
                `;
            }).join('');
        }
    }
    
    const eventDate = new Date(fields['Date']);
    const venueName = fields['Venue Name'] ? fields['Venue Name'][0] : (fields['VenueText'] || 'TBC');
    const venueSlug = fields['Venue Slug'] ? fields['Venue Slug'][0] : null;
    const description = fields['Description'] || 'No description provided.';
    const pageUrl = `https://brumoutloud.co.uk${event.path}`;
    const imageUrl = fields['Promo Image'] ? fields['Promo Image'][0].url : 'https://placehold.co/1200x675/1a1a1a/f5efe6?text=Brum+Out+Loud';

    const calendarData = { /* ... calendar data remains the same ... */ };
    const otherInstancesToDisplay = allFutureInstances.filter(inst => inst.Date !== fields['Date']);

    const otherInstancesHTML = otherInstancesToDisplay.slice(0, 5).map(instance => {
        const d = new Date(instance.Date);
        const day = d.toLocaleDateString('en-GB', { day: 'numeric' });
        const month = d.toLocaleDateString('en-GB', { month: 'short' });
        return `<a href="/event/${instance.Slug}" class="card-bg p-4 flex items-center space-x-4 hover:bg-gray-800 transition-colors duration-200 block">
                    <div class="text-center w-20 flex-shrink-0">
                        <p class="text-2xl font-bold text-white">${day}</p>
                        <p class="text-lg text-gray-400">${month}</p>
                    </div>
                    <div class="flex-grow">
                        <h4 class="font-bold text-white text-xl">${instance['Event Name']}</h4>
                        <p class="text-sm text-gray-400">${d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })}</p>
                    </div>
                    <div class="text-accent-color"><i class="fas fa-arrow-right"></i></div>
                </a>`;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>${eventName} | Brum Out Loud</title>
      </head>
      <body class="antialiased">
        <div id="header-placeholder"></div>
        <main class="container mx-auto px-8 py-16">
            <div class="grid lg:grid-cols-3 gap-16">
                <div class="lg:col-span-2">
                     <div class="prose prose-invert prose-lg max-w-none text-gray-300">
                        ${description.replace(/\n/g, '<br>')}
                    </div>
                    ${(parentEventName || recurringInfo) && otherInstancesHTML ? `<div class="mt-16"><h2 class="font-anton text-4xl mb-8"><span class="accent-color">Other Events</span> in this Series</h2><div class="space-y-4">${otherInstancesHTML}</div></div>` : ''}
                    
                    ${suggestedEventsHTML ? `
                        <div class="mt-16">
                            <h2 class="font-anton text-4xl mb-8"><span class="accent-color">You Might</span> Also Like</h2>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">${suggestedEventsHTML}</div>
                        </div>
                    ` : ''}

                </div>
                <div class="lg:col-span-1">
                                    </div>
            </div>
        </main>
        <div id="footer-placeholder"></div>
        <script>
            // ... calendar script ...
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
