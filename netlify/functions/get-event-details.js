const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    const slug = event.path.split("/").pop();
    if (!slug) {
        return { statusCode: 400, body: 'Error: Event slug not provided.' };
    }

    try {
        const dateMatch = slug.match(/\d{4}-\d{2}-\d{2}$/);
        let eventRecords = [];

        if (dateMatch) {
            // Case 1: Slug has a date. This is a specific child event.
            const dateFromSlug = dateMatch[0];
            eventRecords = await base('Events').select({
                maxRecords: 1,
                filterByFormula: `AND({Slug} = "${slug}", DATETIME_FORMAT(Date, 'YYYY-MM-DD') = '${dateFromSlug}')`
            }).firstPage();
        } else {
            // Case 2: Slug does NOT have a date. This could be a standalone event or a parent series.
            // First, try to find a standalone event with this exact dateless slug.
            eventRecords = await base('Events').select({
                maxRecords: 1,
                filterByFormula: `{Slug} = "${slug}"`
            }).firstPage();

            if (!eventRecords || eventRecords.length === 0) {
                // If no standalone event was found, now check if it implies a parent event series
                // that should redirect to its next instance.

                // Find ANY event record associated with this "parent" slug to determine the series name.
                // We assume if a slug is dateless and not a standalone event, it refers to a series.
                const seriesAnchorRecords = await base('Events').select({
                    maxRecords: 1,
                    // Look for an event whose main slug or parent event slug matches
                    // or where its slug starts with the current slug.
                    filterByFormula: `OR({Slug} = "${slug}", STARTS_WITH({Slug}, "${slug}-"), {Parent Slug} = "${slug}")`
                }).firstPage();

                if (seriesAnchorRecords && seriesAnchorRecords.length > 0) {
                    const anchorRecord = seriesAnchorRecords[0];
                    // Prefer Parent Event Name, but fall back to Event Name if it's the "root" event
                    // of the series and thus has no parent name.
                    const seriesNameForQuery = anchorRecord.fields['Parent Event Name'] || anchorRecord.fields['Event Name'];

                    if (!seriesNameForQuery) {
                        return { statusCode: 404, body: `Could not identify series name for '${slug}'.` };
                    }

                    // Find the next upcoming instance of this series
                    const nextInstanceRecords = await base('Events').select({
                        maxRecords: 1,
                        // Use both Parent Event Name and Event Name for robustness,
                        // as sometimes the 'root' event might not have a Parent Event Name
                        filterByFormula: `AND(OR({Parent Event Name} = "${seriesNameForQuery.replace(/"/g, '\\"')}", {Event Name} = "${seriesNameForQuery.replace(/"/g, '\\"')}"), IS_AFTER({Date}, DATEADD(TODAY(), -1, 'days')))`,
                        sort: [{ field: 'Date', direction: 'asc' }]
                    }).firstPage();

                    if (nextInstanceRecords && nextInstanceRecords.length > 0) {
                        const nextInstanceSlug = nextInstanceRecords[0].fields.Slug;
                        if (nextInstanceSlug) {
                            return {
                                statusCode: 302, // 302 is a temporary redirect, good for "next available"
                                headers: { 'Location': `/event/${nextInstanceSlug}` }
                            };
                        }
                    }
                    // If a series was identified but no upcoming instance.
                    return { statusCode: 404, body: `Event series '${seriesNameForQuery}' has concluded or has no upcoming dates.` };
                } else {
                    // If it's not a dated slug, not a standalone event, and not identifiable as any series.
                    return { statusCode: 404, body: `Event '${slug}' not found.` };
                }
            }
        }

        // If we reached here, it means a specific event instance (either standalone or dated child) was found.
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
            // If it's a standalone recurring event without a specific Parent Event Name
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

        let venueNameForDisplay = fields['Venue Name'] ? fields['Venue Name'][0] : (fields['VenueText'] || 'TBC');
        let venueHtml = `<p class="text-2xl font-semibold">${venueNameForDisplay}</p>`;

        const venueId = fields['Venue'] ? fields['Venue'][0] : null;

        if (venueId) {
            try {
                const venueRecord = await base('Venues').find(venueId);
                const status = venueRecord.get('Listing Status');
                const name = venueRecord.get('Name');
                const venueSlug = venueRecord.get('Slug');
                venueNameForDisplay = name || venueNameForDisplay;
                if (status === 'Listed' && venueSlug) {
                    venueHtml = `<a href="/venue/${venueSlug}" class="text-2xl font-semibold hover:text-white underline">${venueNameForDisplay}</a>`;
                } else {
                    venueHtml = `<p class="text-2xl font-semibold">${venueNameForDisplay}</p>`;
                }
            } catch (venueError) { console.error("Could not fetch linked venue, falling back to text.", venueError); }
        }

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
                const suggestedCardsHtml = suggestedRecords.map(suggEvent => {
                    const suggEventName = suggEvent.get('Event Name');
                    const suggEventDate = new Date(suggEvent.get('Date'));
                    const suggImageUrl = suggEvent.get('Promo Image') ? suggEvent.get('Promo Image')[0].url : 'https://placehold.co/400x600/1e1e1e/EAEAEA?text=Event';
                    const suggEventSlug = suggEvent.get('Slug');

                    return `<a href="/event/${suggEventSlug}" class="suggested-card aspect-[2/3] w-10/12 md:w-5/12 lg:w-[32%] flex-shrink-0 relative overflow-hidden flex flex-col justify-end snap-start"><div class="absolute inset-0 bg-cover bg-center" style="background-image: url('${suggImageUrl}')"></div><div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent"></div><div class="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-center p-2 rounded-lg z-20"><p class="font-bold text-xl leading-none">${suggEventDate.getDate()}</p><p class="text-sm uppercase">${suggEventDate.toLocaleDateString('en-GB', { month: 'short' })}</p></div><div class="relative z-10 p-4"><h4 class="font-extrabold text-white text-2xl">${suggEventName}</h4></div></a>`;
                }).join('');

                suggestedEventsHtml = `<div class="mt-16 suggested-events-section"><h2 class="font-anton text-4xl mb-8">Don't Miss These...</h2><div class="suggested-carousel flex overflow-x-auto gap-6 snap-x snap-mandatory pr-6">${suggestedCardsHtml}</div></div>`;
            }
        }

        const eventDate = new Date(fields['Date']);
        const description = fields['Description'] || 'No description provided.';
        const pageUrl = `https://brumoutloud.co.uk${event.path}`;
        const imageUrl = fields['Promo Image'] ? fields['Promo Image'][0].url : 'https://placehold.co/1200x675/1a1a1a/f5efe6?text=Brum+Out+Loud';

        const calendarData = {
            title: eventName,
            description: `${description.replace(/\n/g, '\\n')}\\n\\nFind out more: ${pageUrl}`,
            location: venueNameForDisplay,
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
            return `<a href="/event/${instance.Slug}" class="card-bg p-4 flex items-center space-x-4 hover:bg-gray-800 transition-colors duration-200 block"><div class="text-center w-20 flex-shrink-0"><p class="text-2xl font-bold text-white">${day}</p><p class="text-lg text-gray-400">${month}</p></div><div class="flex-grow"><h4 class="font-bold text-white text-xl">${instance['Event Name']}</h4><p class="text-sm text-gray-400">${d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' })}</p></div><div class="text-accent-color"><i class="fas fa-arrow-right"></i></div></a>`;
        }).join('');

        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${eventName} | Brum Out Loud</title><script src="https://cdn.tailwindcss.com"></script><link href="https://fonts.googleapis.com/css2?family=Anton&family=Poppins:wght@400;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css"><link rel="stylesheet" href="/css/main.css"><script src="/js/main.js" defer></script><style>.hero-image-container { position: relative; width: 100%; aspect-ratio: 16 / 9; background-color: #1e1e1e; overflow: hidden; border-radius: 1.25rem; box-shadow: 0 10px 30px rgba(0,0,0,0.3); } .hero-image-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; filter: blur(24px) brightness(0.5); transform: scale(1.1); transition: opacity 0.4s ease; } .hero-image-container:hover .hero-image-bg { opacity: 1; } .hero-image-fg { position: relative; width: 100%; height: 100%; object-fit: cover; z-index: 10; transition: all 0.4s ease; } .hero-image-container:hover .hero-image-fg { object-fit: contain; transform: scale(0.9); } .suggested-card { border-radius: 1.25rem; box-shadow: 0 10px 30px rgba(0,0,0,0.3); background-color: #1e1e1e; transition: transform 0.3s ease, box-shadow 0.3s ease; } .suggested-card:hover { transform: translateY(-5px); box-shadow: 0 15px 40px rgba(0,0,0,0.5); } .suggested-carousel { scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; overflow-x: auto; padding-bottom: 1rem; scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.3) rgba(0, 0, 0, 0.1); } .suggested-carousel::-webkit-scrollbar { height: 4px; } .suggested-carousel::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.1); border-radius: 2px; } .suggested-carousel::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.3); border-radius: 2px; }</style></head><body class="antialiased"><div id="header-placeholder"></div><main class="container mx-auto px-8 py-16"><div class="grid lg:grid-cols-3 gap-16"><div class="lg:col-span-2"><div class="hero-image-container mb-8"><img src="${imageUrl}" alt="" class="hero-image-bg" aria-hidden="true"><img src="${imageUrl}" alt="${eventName}" class="hero-image-fg"></div><p class="font-semibold accent-color mb-2">EVENT DETAILS</p><h1 class="font-anton text-6xl lg:text-8xl heading-gradient leading-none mb-8">${eventName}</h1><div class="prose prose-invert prose-lg max-w-none text-gray-300">${description.replace(/\n/g, '<br>')}</div>${(parentEventName || recurringInfo) && otherInstancesHTML ? `<div class="mt-16"><h2 class="font-anton text-4xl mb-8"><span class="accent-color">Other Events</span> in this Series</h2><div class="space-y-4">${otherInstancesHTML}</div></div>` : ''}</div><div class="lg:col-span-1"><div class="card-bg p-8 sticky top-8 space-y-6"><div><h3 class="font-bold text-lg accent-color-secondary mb-2">Date & Time</h3><p class="text-2xl font-semibold">${eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p><p class="text-xl text-gray-400">${eventDate.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' })}</p>${recurringInfo ? `<p class="mt-2 inline-block bg-teal-400/10 text-teal-300 text-xs font-semibold px-2 py-1 rounded-full">${recurringInfo}</p>` : ''}</div><div><h3 class="font-bold text-lg accent-color-secondary mb-2">Location</h3>${venueHtml}</div>${fields['Link'] ? `<a href="${fields['Link']}" target="_blank" rel="noopener noreferrer" class="block w-full text-center bg-accent-color text-white font-bold py-4 px-6 rounded-lg hover:opacity-90 transition-opacity text-xl">GET TICKETS</a>` : ''}<div id="add-to-calendar-section" class="border-t border-gray-700 pt-6"><h3 class="font-bold text-lg accent-color-secondary mb-4 text-center">Add to Calendar</h3><div class="grid grid-cols-1 gap-2"></div></div></div></div></div>${suggestedEventsHtml}</main><div id="footer-placeholder"></div><script>const calendarData = ${JSON.stringify(calendarData)}; function toICSDate(dateStr) { return new Date(dateStr).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'; } function generateGoogleLink(isSeries) { const params = new URLSearchParams({ action: 'TEMPLATE', text: calendarData.title, dates: toICSDate(calendarData.startTime) + '/' + toICSDate(calendarData.endTime), details: calendarData.description, location: calendarData.location }); if (isSeries && calendarData.isRecurring) { const rrule = 'RRULE:RDATE;VALUE=DATE-TIME:' + calendarData.recurringDates.map(d => toICSDate(d)).join(','); params.set('recur', rrule); } return 'https://www.google.com/calendar/render?' + params.toString(); } function generateICSFile(isSeries) { let icsContent = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BrumOutLoud//EN', 'BEGIN:VEVENT', 'UID:' + new Date().getTime() + '@brumoutloud.co.uk', 'DTSTAMP:' + toICSDate(new Date()), 'DTSTART:' + toICSDate(calendarData.startTime), 'DTEND:' + toICSDate(calendarData.endTime), 'SUMMARY:' + calendarData.title, 'DESCRIPTION:' + calendarData.description, 'LOCATION:' + calendarData.location]; if (isSeries && calendarData.isRecurring) { const rdateString = calendarData.recurringDates.map(d => toICSDate(d)).join(','); icsContent.push('RDATE;VALUE=DATE-TIME:' + rdateString); } icsContent.push('END:VEVENT', 'END:VCALENDAR'); const blob = new Blob([icsContent.join('\\r\\n')], { type: 'text/calendar;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = calendarData.title.replace(/ /g, '_') + '.ics'; document.body.appendChild(a); a.click(); document.body.removeChild(a); } document.addEventListener('DOMContentLoaded', () => { const container = document.querySelector('#add-to-calendar-section .grid'); let buttonsHTML = ''; if (calendarData.isRecurring) { buttonsHTML = '<a href="' + generateGoogleLink(false) + '" target="_blank" class="bg-gray-700 text-white font-bold py-3 px-4 rounded-lg text-center hover:bg-gray-600">Google Cal (This Event)</a>' + '<button onclick="generateICSFile(false)" class="bg-gray-700 text-white font-bold py-3 px-4 rounded-lg text-center hover:bg-gray-600">Apple/Outlook (This Event)</button>' + '<a href="' + generateGoogleLink(true) + '" target="_blank" class="bg-accent-color text-white font-bold py-3 px-4 rounded-lg text-center hover:opacity-90">Google Cal (All)</a>' + '<button onclick="generateICSFile(true)" class="bg-accent-color text-white font-bold py-3 px-4 rounded-lg text-center hover:opacity-90">Apple/Outlook (All)</button>'; } else { buttonsHTML = '<a href="' + generateGoogleLink(false) + '" target="_blank" class="bg-gray-700 text-white font-bold py-3 px-4 rounded-lg text-center hover:bg-gray-600">Google Calendar</a>' + '<button onclick="generateICSFile(false)" class="bg-gray-700 text-white font-bold py-3 px-4 rounded-lg text-center hover:bg-gray-600">Apple/Outlook (.ics)</button>'; } container.innerHTML = buttonsHTML; });</script></body></html>`;

        return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: html };

    } catch (error) {
        console.error("Caught error in handler:", error); // More specific logging
        return { statusCode: 500, body: 'Server error fetching event details. Please try again later.' };
    }
};
