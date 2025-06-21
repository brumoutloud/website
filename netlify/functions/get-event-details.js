const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    const { id } = event.queryStringParameters;
    if (!id) {
        return { statusCode: 400, body: 'Event ID is required' };
    }

    try {
        const eventRecord = await base('Events').find(id);
        const event = { id: eventRecord.id, ...eventRecord.fields };

        // Fetch linked venue details, including the 'Listing Status'
        let venueName = event['Venue Name (from Venue)'][0] || 'Venue details not found';
        let venueDisplayHtml = `<p class="text-2xl text-gray-200">${venueName}</p>`; // Default to plain text
        const venueId = event['Venue'] ? event['Venue'][0] : null;

        if (venueId) {
            const venueRecord = await base('Venues').find(venueId);
            venueName = venueRecord.get('Name');
            const listingStatus = venueRecord.get('Listing Status');

            // Correctly implement the venue display logic
            if (listingStatus === 'Listed') {
                venueDisplayHtml = `<a href="/venues.html?id=${venueId}" class="text-2xl text-gray-200 hover:text-accent-color transition-colors">${venueName}</a>`;
            } else {
                venueDisplayHtml = `<p class="text-2xl text-gray-200">${venueName}</p>`;
            }
        }
        
        const eventDate = new Date(event['Date']).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        const eventTime = event['Start Time'];
        const promoImageUrl = event['Promo Image'] ? event['Promo Image'][0].url : 'https://placehold.co/800x600/1a202c/FFF?text=Brum+Out+Loud';

        // Generate and return a full HTML document
        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${event['Event Name']} | Brum Out Loud</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Anton&family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
                <link rel="stylesheet" href="/css/main.css">
            </head>
            <body class="antialiased">
                <header class="p-8">
                    <nav class="container mx-auto flex justify-between items-center">
                        <a href="/" class="font-anton text-2xl tracking-widest text-white">BRUM OUT LOUD</a>
                         <div class="hidden md:flex items-center space-x-8">
                            <a href="/events.html" class="nav-link active">EVENTS</a>
                            <a href="/all-venues.html" class="nav-link">VENUES</a>
                            <a href="/community.html" class="nav-link">COMMUNITY</a>
                            <a href="/get-listed.html" class="nav-link">GET LISTED</a>
                        </div>
                    </nav>
                </header>
                <main class="container mx-auto px-8 py-16">
                    <section class="max-w-5xl mx-auto">
                        <div class="grid md:grid-cols-3 gap-12">
                            <div class="md:col-span-2">
                                <h1 class="font-anton text-7xl md:text-8xl leading-none tracking-wider heading-gradient">${event['Event Name']}</h1>
                                <div class="mt-6 flex items-center space-x-6">
                                    <div class="flex items-center text-2xl text-gray-200"><i class="fa-solid fa-calendar-day fa-fw mr-3 accent-color-secondary"></i><span>${eventDate}</span></div>
                                    <div class="flex items-center text-2xl text-gray-200"><i class="fa-solid fa-clock fa-fw mr-3 accent-color-secondary"></i><span>${eventTime}</span></div>
                                </div>
                                <div class="mt-4 flex items-center">
                                    <i class="fa-solid fa-location-dot fa-fw mr-3 accent-color-secondary text-2xl"></i>
                                    ${venueDisplayHtml}
                                </div>
                                <div class="mt-8 prose prose-lg prose-invert max-w-none">
                                    <p>${event['Description'] || 'No description provided.'}</p>
                                </div>
                            </div>
                            <div>
                                <img src="${promoImageUrl}" alt="Promo image for ${event['Event Name']}" class="rounded-lg w-full">
                                ${event['Ticket Link'] ? `<a href="${event['Ticket Link']}" target="_blank" rel="noopener noreferrer" class="block w-full text-center mt-6 bg-accent-color text-white font-bold py-4 px-8 rounded-lg hover:opacity-90 transition-opacity text-xl">Get Tickets</a>` : ''}
                            </div>
                        </div>
                    </section>
                </main>
            </body>
            </html>
        `;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: html,
        };

    } catch (error) {
        console.error("Error generating event page:", error);
        return { statusCode: 500, body: '<h1>Error</h1><p>Could not generate event page.</p>' };
    }
};
