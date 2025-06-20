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
    
    // --- Fetch suggested events based on category ---
    let suggestedEventsHTML = '';
    const primaryCategories = fields.Category || [];
    if (primaryCategories.length > 0) {
        // **THE FIX**: Properly escape double quotes in category names before building the formula.
        const categoryFormulas = primaryCategories.map(cat => {
            const escapedCat = cat.replace(/"/g, '\\"');
            return `FIND("${escapedCat}", ARRAYJOIN(Category))`;
        });
        
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
                const slug = f.Slug || rec.id;
                return `
                    <a href="/event/${rec.id}/${slug}" class="event-card">
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
        const day = d.toLocaleDateString('en-GB', { day: 'numeric' });
        const month = d.toLocaleDateString('en-GB', { month: 'short' });
        const slug = instance.Slug || instance.id;
        return `<a href="/event/${slug}" class="card-bg p-4 flex items-center space-x-4 hover:bg-gray-800 transition-colors duration-200 block">
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
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${eventName} | Brum Out Loud</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Anton&family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
        <link rel="stylesheet" href="/css/main.css">
        <script src="/js/main.js" defer></script>
        <style>
            .hero-image-container { position: relative; width: 100%; aspect-ratio: 16 / 9; background-color: #1e1e1e; overflow: hidden; border-radius: 1.25rem; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
            .hero-image-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; filter: blur(24px) brightness(0.5); transform: scale(1.1); transition: opacity 0.4s ease; }
            .hero-image-container:hover .hero-image-bg { opacity: 1; }
            .hero-image-fg { position: relative; width: 100%; height: 100%; object-fit: cover; z-index: 10; transition: all 0.4s ease; }
            .hero-image-container:hover .hero-image-fg { object-fit: contain; transform: scale(0.9); }
        </style>
      </head>
      <body class="antialiased">
        <div id="header-placeholder"></div>
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
                    
                    ${suggestedEventsHTML ? `
                        <div class="mt-16">
                            <h2 class="font-anton text-4xl mb-8"><span class="accent-color">You Might</span> Also Like</h2>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">${suggestedEventsHTML}</div>
                        </div>
                    ` : ''}
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
                            ${venueSlug ? `<a href="/venue/${venueSlug}" class="text-2xl font-semibold hover:text-white underline">${venueName}</a>` : `<p class="text-2xl font-semibold">${venueName}</p>`}
                         </div>
                        ${fields['Link'] ? `<a href="${fields['Link']}" target="_blank" rel="noopener noreferrer" class="block w-full text-center bg-accent-color text-white font-bold py-4 px-6 rounded-lg hover:opacity-90 transition-opacity text-xl">GET TICKETS</a>` : ''}
                        <div id="add-to-calendar-section" class="border-t border-gray-700 pt-6">
                            <h3 class="font-bold text-lg accent-color-secondary mb-4 text-center">Add to Calendar</h3>
                            <div class="grid grid-cols-1 gap-2"></div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
        <div id="footer-placeholder"></div>
        <script>
            const calendarData = ${JSON.stringify(calendarData)};
            
            function toICSDate(dateStr) { return new Date(dateStr).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'; }

            function generateGoogleLink(isSeries) {
                const params = new URLSearchParams({
                    action: 'TEMPLATE',
                    text: calendarData.title,
                    dates: toICSDate(calendarData.startTime) + '/' + toICSDate(calendarData.endTime),
                    details: calendarData.description,
                    location: calendarData.location
                });
                if (isSeries && calendarData.isRecurring) {
                    const rrule = 'RRULE:RDATE;VALUE=DATE-TIME:' + calendarData.recurringDates.map(d => toICSDate(d)).join(',');
                    params.set('recur', rrule);
                }
                return 'https://www.google.com/calendar/render?' + params.toString();
            }

            function generateICSFile(isSeries) {
                let icsContent = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BrumOutLoud//EN', 'BEGIN:VEVENT', 'UID:' + new Date().getTime() + '@brumoutloud.co.uk', 'DTSTAMP:' + toICSDate(new Date()), 'DTSTART:' + toICSDate(calendarData.startTime), 'DTEND:' + toICSDate(calendarData.endTime), 'SUMMARY:' + calendarData.title, 'DESCRIPTION:' + calendarData.description, 'LOCATION:' + calendarData.location];
      _G,_/g, '_') + '.ics';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
            
            document.addEventListener('DOMContentLoaded', () => {
                const container = document.querySelector('#add-to-calendar-section .grid');
                let buttonsHTML = '';
                if (calendarData.isRecurring) {
                    buttonsHTML = 
                        '<a href="' + generateGoogleLink(false) + '" target="_blank" class="bg-gray-700 text-white font-bold py-3 px-4 rounded-lg text-center hover:bg-gray-600">Google Cal (This Event)</a>' +
                        '<button onclick="generateICSFile(false)" class="bg-gray-700 text-white font-bold py-3 px-4 rounded-lg text-center hover:bg-gray-600">Apple/Outlook (This Event)</button>' +
                        '<a href="' + generateGoogleLink(true) + '" target="_blank" class="bg-accent-color text-white font-bold py-3 px-4 rounded-lg text-center hover:opacity-90">Google Cal (All)</a>' +
                        '<button onclick="generateICSFile(true)" class="bg-accent-color text-white font-bold py-3 px-4 rounded-lg text-center hover:opacity-90">Apple/Outlook (All)</button>';
                } else {
                     buttonsHTML = 
                        '<a href="' + generateGoogleLink(false) + '" target="_blank" class="bg-gray-700 text-white font-bold py-3 px-4 rounded-lg text-center hover:bg-gray-600">Google Calendar</a>' +
                        '<button onclick="generateICSFile(false)" class="bg-gray-700 text-white font-bold py-3 px-4 rounded-lg text-center hover:bg-gray-600">Apple/Outlook (.ics)</button>';
                }
                container.innerHTML = buttonsHTML;
            });
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
