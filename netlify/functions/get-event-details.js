const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  const slug = event.path.split("/").pop();
  if (!slug) { return { statusCode: 400, body: 'Error: Event slug not provided.' }; }

  try {
    const eventRecords = await base('Events').select({
        maxRecords: 1,
        filterByFormula: `{Slug} = "${slug}"`,
        fields: ['Event Name', 'Description', 'Date', 'Promo Image', 'Link', 'Recurring Info', 'Venue Name', 'Venue Slug', 'Parent Event Name', 'VenueText']
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
    
    const eventDate = new Date(fields['Date']);
    const venueName = fields['Venue Name'] ? fields['Venue Name'][0] : (fields['VenueText'] || 'TBC');
    const venueSlug = fields['Venue Slug'] ? fields['Venue Slug'][0] : null;
    const description = fields['Description'] || 'No description provided.';
    const pageUrl = `https://brumoutloud.co.uk${event.path}`;
    const imageUrl = fields['Promo Image'] ? fields['Promo Image'][0].url : 'https://placehold.co/1200x675/1a1a1a/f5efe6?text=Brum+Out+Loud';

    const calendarData = {
        title: eventName,
        description: `${description.replace(/\n/g, '\\n')}\\n\\nFind out more: ${pageUrl}`,
        location: venueName,
        startTime: eventDate.toISOString(),
        endTime: new Date(eventDate.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        isRecurring: (parentEventName || recurringInfo) && allFutureInstances.length > 1,
        recurringDates: allFutureInstances.map(i => i.Date)
    };
    
    const otherInstancesToDisplay = allFutureInstances.filter(inst => inst.Date !== fields['Date']);

    const otherInstancesHTML = otherInstancesToDisplay.slice(0, 5).map(instance => {
        const d = new Date(instance.Date);
        return `<a href="/event/${instance.Slug}" class="card-bg p-4 flex items-center space-x-4 hover:bg-gray-800 transition-colors duration-200 block"> ... </a>`;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${eventName} | Brum Out Loud</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Anton&family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
        <link rel="stylesheet" href="/css/main.css">
        <style>
            .hero-image-container {
                position: relative;
                width: 100%;
                aspect-ratio: 16 / 9;
                background-color: #1e1e1e;
                overflow: hidden;
                border-radius: 1.25rem;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            }
            .hero-image-bg {
                position: absolute;
                top: 0; left: 0; width: 100%; height: 100%;
                object-fit: cover;
                /* **FIX**: Hidden by default, appears on hover */
                opacity: 0;
                filter: blur(24px) brightness(0.5);
                transform: scale(1.1);
                transition: opacity 0.4s ease;
            }
            .hero-image-container:hover .hero-image-bg {
                opacity: 1;
            }
            .hero-image-fg {
                position: relative;
                width: 100%;
                height: 100%;
                object-fit: cover; /* Default state: cropped */
                z-index: 10;
                transition: all 0.4s ease;
            }
            .hero-image-container:hover .hero-image-fg {
                object-fit: contain; /* Hover state: uncropped */
                transform: scale(0.9);
            }
        </style>
      </head>
      <body class="antialiased">
        <header class="p-8"><!-- ... --></header>
        <main class="container mx-auto px-8 py-16">
            <div class="grid lg:grid-cols-3 gap-16">
                <div class="lg:col-span-2">
                     <div class="hero-image-container mb-8">
                        <img src="${imageUrl}" alt="" class="hero-image-bg" aria-hidden="true">
                        <img src="${imageUrl}" alt="${eventName}" class="hero-image-fg">
                     </div>
                    <p class="font-semibold accent-color mb-2">EVENT DETAILS</p>
                    <h1 class="font-anton text-6xl lg:text-8xl heading-gradient leading-none mb-8">${eventName}</h1>
                    <div class="prose prose-invert prose-lg max-w-none text-gray-300">
                        ${description.replace(/\n/g, '<br>')}
                    </div>
                    ${(parentEventName || recurringInfo) && otherInstancesHTML ? `<div class="mt-16"><h2 class="font-anton text-4xl mb-8"><span class="accent-color">Other Events</span> in this Series</h2><div class="space-y-4">${otherInstancesHTML}</div></div>` : ''}
                </div>
                <div class="lg:col-span-1">
                    <div class="card-bg p-8 sticky top-8 space-y-6">
                        <!-- ... Sidebar content ... -->
                    </div>
                </div>
            </div>
        </main>
        <script>
            // ... Calendar script ...
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
