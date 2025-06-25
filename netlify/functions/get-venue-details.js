const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    const slug = event.path.split("/").pop();
    if (!slug) { return { statusCode: 400, body: 'Error: Venue slug not provided.' }; }

    try {
        const venueRecords = await base('Venues').select({
            maxRecords: 1,
            filterByFormula: `{Slug} = "${slug}"`
        }).firstPage();

        if (!venueRecords || venueRecords.length === 0) {
            return { statusCode: 404, body: 'Venue not found.' };
        }

        const venue = venueRecords[0];
        const venueId = venue.id;
        const fields = venue.fields;
        const venueName = fields['Name'];
        
        const upcomingEventsRecords = await base('Events').select({
            filterByFormula: `AND({Venue} = '${venueId}', {Status} = 'Approved', IS_AFTER({Date}, TODAY()))`,
            sort: [{field: 'Date', direction: 'asc'}],
            fields: ['Event Name', 'Date', 'Promo Image', 'Slug']
        }).all();

        const upcomingEventsHtml = upcomingEventsRecords.length > 0 ? upcomingEventsRecords.map(record => {
            const eventFields = record.fields;
            const eventDate = new Date(eventFields['Date']);
            const imageUrl = eventFields['Promo Image'] ? eventFields['Promo Image'][0].url : 'https://placehold.co/400x400/1e1e1e/EAEAEA?text=Event';

            return `
                <a href="/event/${eventFields['Slug']}" class="item-card card-bg block group">
                    <div class="relative aspect-video bg-gray-900/50">
                        <img src="${imageUrl}" alt="${eventFields['Event Name']}" class="absolute h-full w-full object-cover">
                        <div class="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-center p-2 rounded-lg z-10">
                            <p class="font-bold text-xl leading-none">${eventDate.getDate()}</p>
                            <p class="text-sm uppercase">${eventDate.toLocaleDateString('en-GB', { month: 'short' })}</p>
                        </div>
                    </div>
                    <div class="p-6">
                        <h3 class="font-bold text-xl text-white mb-2 truncate group-hover:text-accent-color transition-colors">${eventFields['Event Name']}</h3>
                        <p class="text-gray-400 text-sm">${eventDate.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })}</p>
                    </div>
                </a>
            `;
        }).join('') : '<div class="card-bg p-8 text-center text-gray-400 lg:col-span-3">No upcoming events scheduled at this time.</div>';

        const photo = fields['Photo'] && fields['Photo'].length > 0 ? fields['Photo'][0].url : 'https://placehold.co/1200x675/1a1a1a/f5efe6?text=Venue+Photo';
        const description = fields['Description'] ? fields['Description'].replace(/\n/g, '<br>') : 'No description available.';
        const address = fields['Address'] || 'Address not available';
        const website = fields['Website'];
        const instagram = fields['Instagram'];

        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${venueName} | Brum Out Loud</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Anton&family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
                <link rel="stylesheet" href="/css/main.css">
                <script src="/js/main.js" defer></script>
            </head>
            <body class="antialiased">
                <div id="header-placeholder"></div>
                <main class="container mx-auto px-8 py-16">
                    <!-- Breadcrumb Start -->
                    <nav class="flex mb-8" aria-label="Breadcrumb">
                        <ol role="list" class="flex items-center space-x-4">
                            <li>
                                <a href="/all-venues" class="text-sm font-medium text-gray-400 hover:text-white">All Venues</a>
                            </li>
                            <li>
                                <div class="flex items-center">
                                    <i class="fas fa-chevron-right fa-xs text-gray-500 flex-shrink-0" aria-hidden="true"></i>
                                    <span aria-current="page" class="ml-4 text-sm font-medium text-white">
                                        ${venueName}
                                    </span>
                                </div>
                            </li>
                        </ol>
                    </nav>
                    <!-- Breadcrumb End -->

                    <div class="grid lg:grid-cols-5 gap-12">
                        <div class="lg:col-span-3">
                            <img src="${photo}" alt="${venueName}" class="w-full aspect-video object-cover rounded-xl mb-8 shadow-lg">
                            <p class="font-semibold accent-color mb-2">ABOUT THE VENUE</p>
                            <h1 class="font-anton text-6xl lg:text-8xl heading-gradient leading-none mb-8">${venueName}</h1>
                            <div class="prose prose-invert prose-lg max-w-none text-gray-300">
                                ${description}
                            </div>
                        </div>
                        <div class="lg:col-span-2">
                             <div class="card-bg p-8 sticky top-8 space-y-6">
                                <div>
                                    <h3 class="font-bold text-lg accent-color-secondary mb-2">Address</h3>
                                    <p class="text-xl font-semibold">${address}</p>
                                    <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}" target="_blank" class="text-sm text-accent-color hover:underline">Get Directions</a>
                                </div>
                                <div class="flex flex-wrap gap-4 pt-4 border-t border-gray-700">
                                    ${website ? `<a href="${website}" target="_blank" class="bg-gray-700 text-white font-bold py-3 px-4 rounded-lg text-center hover:bg-gray-600 flex-grow"><i class="fas fa-globe mr-2"></i>Website</a>` : ''}
                                    ${instagram ? `<a href="${instagram}" target="_blank" class="bg-gray-700 text-white font-bold py-3 px-4 rounded-lg text-center hover:bg-gray-600 flex-grow"><i class="fab fa-instagram mr-2"></i>Instagram</a>` : ''}
                                </div>
                             </div>
                        </div>
                    </div>

                    <div class="mt-24">
                        <h2 class="font-anton text-5xl text-white mb-8">Upcoming Events at ${venueName}</h2>
                        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                            ${upcomingEventsHtml}
                        </div>
                    </div>
                </main>
                <div id="footer-placeholder"></div>
            </body>
            </html>
        `;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: html,
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: 'Server error fetching venue details.',
        };
    }
};
