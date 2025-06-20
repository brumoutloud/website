const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

// Helper function to escape strings for Airtable formula values
// This ensures that any double quotes or backslashes within the string
// are correctly escaped for the Airtable formula when embedded in a JS template literal.
function escapeForAirtableValue(str) {
    if (typeof str !== 'string') return str;
    // JSON.stringify converts the string into a valid JavaScript string literal,
    // escaping internal quotes and backslashes. We then slice to remove the
    // outer double quotes added by JSON.stringify, leaving the escaped content.
    return JSON.stringify(str).slice(1, -1);
}

// Helper function to escape HTML characters that could break page rendering
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Helper function to safely encode URL components
function encodeSlug(slug) {
    if (typeof slug !== 'string') return '';
    return encodeURIComponent(slug);
}


exports.handler = async function (event, context) {
  const slug = event.path.split("/").pop();
  if (!slug) { return { statusCode: 400, body: 'Error: Event slug not provided.' }; }

  try {
    const eventRecords = await base('Events').select({
        maxRecords: 1,
        filterByFormula: `{Slug} = "${escapeForAirtableValue(slug)}"`,
        fields: ['Event Name', 'Description', 'Date', 'Promo Image', 'Link', 'Recurring Info', 'Venue Name', 'Venue Slug', 'Parent Event Name', 'VenueText', 'Category']
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
        const parentNameForQuery = escapeForAirtableValue(parentEventName);
        filterFormula = `AND({Parent Event Name} = "${parentNameForQuery}", IS_AFTER({Date}, DATEADD(TODAY(),-1,'days')))`
    } else if (recurringInfo) {
        const eventNameForQuery = escapeForAirtableValue(eventName);
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
        title: escapeHtml(eventName),
        description: `${escapeHtml(description).replace(/\n/g, '\\n')}\\n\\nFind out more: ${pageUrl}`,
        location: escapeHtml(venueName),
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
        return `<a href="/event/${encodeSlug(instance.Slug)}" class="card-bg p-4 flex items-center space-x-4 hover:bg-gray-800 transition-colors duration-200 block">
                    <div class="text-center w-20 flex-shrink-0">
                        <p class="text-2xl font-bold text-white">${day}</p>
                        <p class="text-lg text-gray-400">${month}</p>
                    </div>
                    <div class="flex-grow">
                        <h4 class="font-bold text-white text-xl">${escapeHtml(instance['Event Name'])}</h4>
                        <p class="text-sm text-gray-400">${d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })}</p>
                    </div>
                    <div class="text-accent-color"><i class="fas fa-arrow-right"></i></div>
                </a>`;
    }).join('');

    // --- Start Suggested Events Logic ---
    let suggestedEventsHTML = '';
    const mainEventCategoriesRaw = fields['Category'];
    let mainEventCategories = [];

    // Robustly handle mainEventCategories: ensure it's an array of strings
    if (Array.isArray(mainEventCategoriesRaw)) {
        mainEventCategories = mainEventCategoriesRaw.filter(cat => typeof cat === 'string');
    } else if (typeof mainEventCategoriesRaw === 'string' && mainEventCategoriesRaw.trim() !== '') {
        mainEventCategories = [mainEventCategoriesRaw];
    }
    // If mainEventCategoriesRaw is null, undefined, or an empty string, mainEventCategories remains an empty array.

    if (mainEventCategories.length > 0) {
        const categoryFilter = mainEventCategories.map(cat => `FIND("${escapeForAirtableValue(cat)}", ARRAYJOIN({Category}, ","))`).join(',');
        
        const suggestedEventsRecords = await base('Events').select({
            filterByFormula: `AND(
                {Status} = 'Approved',
                IS_AFTER({Date}, TODAY()),
                NOT({Slug} = '${escapeForAirtableValue(slug)}'),
                OR(${categoryFilter})
            )`,
            sort: [{ field: 'Date', direction: 'asc' }],
            maxRecords: 6, // Set maxRecords to 6 as requested
            fields: ['Event Name', 'Date', 'Promo Image', 'Slug', 'VenueText']
        }).all();

        if (suggestedEventsRecords.length > 0) {
            suggestedEventsHTML = `
                <div class="suggested-events-section">
                    <h2 class="suggested-events-heading"><span class="accent-color">Don't Miss These...</span></h2>
                    <div class="carousel-container">
            `;
            suggestedEventsRecords.forEach(suggestedEvent => {
                const sFields = suggestedEvent.fields;
                const sDate = new Date(sFields.Date);
                const sImageUrl = sFields['Promo Image'] && sFields['Promo Image'][0] ? sFields['Promo Image'][0].url : 'https://placehold.co/400x400/1e1e1e/EAEAEA?text=Event';
                
                let formattedDate = 'Date TBC';
                let formattedTime = '';

                // Validate sDate before formatting to prevent errors
                if (!isNaN(sDate.getTime())) { 
                    formattedDate = sDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                    formattedTime = ` - ${sDate.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                }

                suggestedEventsHTML += `
                    <a href="/event/${encodeSlug(sFields.Slug)}" class="carousel-card group">
                        <img src="${sImageUrl}" alt="${escapeHtml(sFields['Event Name'])}" class="card-image">
                        <div class="card-overlay">
                            <h4 class="card-title">${escapeHtml(sFields['Event Name'])}</h4>
                            <p class="card-date">${formattedDate}${formattedTime}</p>
                        </div>
                    </a>
                `;
            });
            suggestedEventsHTML += `
                    </div>
                </div>
            `;
        }
    }
    // --- End Suggested Events Logic ---


    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(eventName)} | Brum Out Loud</title>
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

            /* New CSS for Suggested Events Carousel */
            .carousel-container {
                display: flex;
                overflow-x: scroll;
                scroll-snap-type: x mandatory;
                -webkit-overflow-scrolling: touch; /* For smoother scrolling on iOS */
                scrollbar-width: none; /* Firefox */
                -ms-overflow-style: none;  /* IE and Edge */
                padding-bottom: 1rem; /* Space for potential scrollbar on some systems */
                gap: 1rem; /* Space between cards */
            }
            .carousel-container::-webkit-scrollbar {
                display: none; /* Chrome, Safari, Opera */
            }

            .carousel-card {
                flex: 0 0 auto; /* Do not grow, do not shrink, base on content */
                width: calc((100% / 1.5) - 0.66rem); /* 1.5 cards on mobile, accounting for gap */
                /* Changed height to create a 2:3 portrait aspect ratio dynamically */
                height: calc(((100% / 1.5) - 0.66rem) * 1.5); 
                position: relative;
                overflow: hidden;
                border-radius: 0.75rem; /* Equivalent to rounded-lg */
                background-color: #1a1a1a; /* Placeholder if image fails, consistent with card-bg */
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
                scroll-snap-align: start;
                text-decoration: none; /* Remove underline from anchor */
                color: inherit; /* Inherit text color */
            }

            .card-image {
                width: 100%;
                height: 100%;
                object-fit: cover;
                position: absolute;
                top: 0;
                left: 0;
                transition: transform 0.3s ease-out;
            }

            .carousel-card:hover .card-image {
                transform: scale(1.05); /* Subtle zoom */
            }

            .card-overlay {
                position: absolute;
                bottom: 0;
                left: 0;
                width: 100%;
                padding: 1rem;
                /* Adjusted gradient for darker coverage and starts from bottom covering 40% */
                background: linear-gradient(to top, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 40%, rgba(0, 0, 0, 0) 100%); 
                color: white;
                z-index: 10;
            }

            .card-title {
                font-family: 'Poppins', sans-serif;
                font-weight: 700;
                font-size: 1.25rem;
                line-height: 1.2;
                margin-bottom: 0.25rem;
            }

            .card-date {
                font-family: 'Poppins', sans-serif;
                font-size: 0.875rem;
                color: #a0aec0; /* A gray shade for date, like text-gray-400 */
            }

            /* Responsive adjustments for carousel cards */
            @media (min-width: 768px) { /* md breakpoint for desktop */
                .carousel-card {
                    width: calc((100% / 2) - 0.5rem); /* Show 2 cards on desktop */
                    height: calc(((100% / 2) - 0.5rem) * 1.5); /* Maintain 2:3 ratio */
                }
            }
            @media (min-width: 1024px) { /* lg breakpoint for desktop */
                .carousel-card {
                    width: calc((100% / 3) - 0.66rem); /* Show 3 cards on larger desktop */
                    height: calc(((100% / 3) - 0.66rem) * 1.5); /* Maintain 2:3 ratio */
                }
            }

            /* Section styling for suggested events */
            .suggested-events-section {
                margin-top: 4rem; /* Equivalent to mt-16 */
            }
            .suggested-events-heading {
                font-family: 'Anton', sans-serif;
                font-size: 2.25rem; /* Equivalent to text-4xl */
                margin-bottom: 2rem; /* Equivalent to mb-8 */
            }
            .suggested-events-heading .accent-color {
                color: #B564F7; /* Changed from #6d28d9 for consistency with main.css and design system */
            }
        </style>
      </head>
      <body class="antialiased">
        <div id="header-placeholder"></div>
        <main class="container mx-auto px-8 py-16">
            <div class="grid lg:grid-cols-3 gap-16">
                <div class="lg:col-span-2">
                     <div class="hero-image-container mb-8">
                        <img src="${imageUrl}" alt="" class="hero-image-bg" aria-hidden="true">
                        <img src="${imageUrl}" alt="${escapeHtml(eventName)}" class="hero-image-fg">
                     </div>
                    <p class="font-semibold accent-color mb-2">EVENT DETAILS</p>
                    <h1 class="font-anton text-6xl lg:text-8xl heading-gradient leading-none mb-8">${escapeHtml(eventName)}</h1>
                    <div class="prose prose-invert prose-lg max-w-none text-gray-300">
                        ${escapeHtml(description).replace(/\n/g, '<br>')}
                    </div>
                    ${(parentEventName || recurringInfo) && otherInstancesHTML ? `<div class="mt-16"><h2 class="font-anton text-4xl mb-8"><span class="accent-color">Other Events</span> in this Series</h2><div class="space-y-4">${otherInstancesHTML}</div></div>` : ''}
                    ${suggestedEventsHTML}
                </div>
                <div class="lg:col-span-1">
                    <div class="card-bg p-8 sticky top-8 space-y-6">
                        <div>
                            <h3 class="font-bold text-lg accent-color-secondary mb-2">Date & Time</h3>
                            <p class="text-2xl font-semibold">${eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                            <p class="text-xl text-gray-400">${eventDate.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' })}</p>
                            ${recurringInfo ? `<p class="mt-2 inline-block bg-teal-400/10 text-teal-300 text-xs font-semibold px-2 py-1 rounded-full">${escapeHtml(recurringInfo)}</p>` : ''}
                        </div>
                         <div>
                            <h3 class="font-bold text-lg accent-color-secondary mb-2">Location</h3>
                            ${venueSlug ? `<a href="/venue/${encodeSlug(venueSlug)}" class="text-2xl font-semibold hover:text-white underline">${escapeHtml(venueName)}</a>` : `<p class="text-2xl font-semibold">${escapeHtml(venueName)}</p>`}
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
                if (isSeries && calendarData.isRecurring) {
                    const rdateString = calendarData.recurringDates.map(d => toICSDate(d)).join(',');
                    icsContent.push('RDATE;VALUE=DATE-TIME:' + rdateString);
                }
                icsContent.push('END:VEVENT', 'END:VCALENDAR');
                const blob = new Blob([icsContent.join('\\r\\n')], { type: 'text/calendar;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = calendarData.title.replace(/ /g, '_') + '.ics';
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
