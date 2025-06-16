const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    const slug = event.path.split("/").pop();

    if (!slug) {
        return { statusCode: 400, body: 'Venue slug not provided.' };
    }

    try {
        // **FIX:** Requesting all the new fields from Airtable.
        const venueRecords = await base('Venues').select({
            maxRecords: 1,
            filterByFormula: `{Slug} = "${slug}"`,
            fields: ["Name", "Description", "Address", "Opening Hours", "Accessibility", "Website", "Instagram", "Facebook", "TikTok", "Photo URL"]
        }).all();

        if (!venueRecords || venueRecords.length === 0) {
            return { statusCode: 404, body: 'Venue not found.' };
        }
        const venue = venueRecords[0].fields;
        
        const eventRecords = await base('Events').select({
            filterByFormula: `AND({Venue Name} = "${venue.Name}", IS_AFTER({Date}, TODAY()))`,
            sort: [{ field: 'Date', direction: 'asc' }],
        }).all();

        const sortedEvents = eventRecords.map(rec => rec.fields);

        // **FIX:** Using the 'Photo URL' field we now save from our form.
        const imageUrl = venue['Photo URL'] || 'https://placehold.co/1600x600/1e1e1e/EAEAEA?text=Venue';
        
        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${venue.Name} | Brum Out Loud</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Anton&family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
                <link rel="stylesheet" href="/css/main.css">
            </head>
            <body class="antialiased">
                <header class="p-8">
                    <nav class="container mx-auto flex justify-between items-center">
                        <a href="/" class="font-anton text-2xl tracking-widest text-white">BRUM OUT LOUD</a>
                        <a href="/" class="bg-accent-color-secondary text-gray-800 font-bold py-3 px-6 rounded-lg hover:opacity-90 transition-opacity">BACK TO SITE</a>
                    </nav>
                </header>
                <main class="container mx-auto px-8 py-16">
                    <div class="relative rounded-2xl overflow-hidden mb-16 h-96 card-bg">
                        <img src="${imageUrl}" alt="${venue.Name}" class="w-full h-full object-cover opacity-50">
                        <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                        <div class="absolute bottom-8 left-8">
                            <h1 class="font-anton text-6xl lg:text-8xl heading-gradient leading-none">${venue.Name}</h1>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-16">
                        <div class="lg:col-span-1 space-y-8">
                            <div>
                                <h3 class="font-bold text-lg accent-color-secondary mb-2">The Vibe</h3>
                                <p class="text-gray-300 text-lg">${venue.Description || 'Info coming soon.'}</p>
                            </div>
                            <div>
                                <h3 class="font-bold text-lg accent-color-secondary mb-2">Address</h3>
                                <p class="text-gray-300 text-lg">${venue.Address || 'N/A'}</p>
                            </div>
                            <!-- **FIX:** Added sections to display new info -->
                            ${venue['Opening Hours'] ? `<div><h3 class="font-bold text-lg accent-color-secondary mb-2">Opening Hours</h3><p class="text-gray-300 text-lg whitespace-pre-line">${venue['Opening Hours']}</p></div>` : ''}
                            ${venue.Accessibility ? `<div><h3 class="font-bold text-lg accent-color-secondary mb-2">Accessibility</h3><p class="text-gray-300 text-lg whitespace-pre-line">${venue.Accessibility}</p></div>` : ''}
                            <div>
                                <h3 class="font-bold text-lg accent-color-secondary mb-2">Follow Them</h3>
                                <div class="flex space-x-6 text-2xl text-gray-400">
                                    ${venue.Website ? `<a href="${venue.Website}" target="_blank" class="hover:text-white" title="Website"><i class="fas fa-globe"></i></a>` : ''}
                                    ${venue.Instagram ? `<a href="${venue.Instagram}" target="_blank" class="hover:text-white" title="Instagram"><i class="fab fa-instagram"></i></a>` : ''}
                                    ${venue.Facebook ? `<a href="${venue.Facebook}" target="_blank" class="hover:text-white" title="Facebook"><i class="fab fa-facebook"></i></a>` : ''}
                                    ${venue.TikTok ? `<a href="${venue.TikTok}" target="_blank" class="hover:text-white" title="TikTok"><i class="fab fa-tiktok"></i></a>` : ''}
                                </div>
                            </div>
                        </div>

                        <div class="lg:col-span-2">
                             <h2 class="font-anton text-4xl mb-8"><span class="accent-color">What's On</span> at ${venue.Name}</h2>
                             <div class="space-y-4">
                                ${sortedEvents.length > 0 ? sortedEvents.map(event => `
                                    <a href="/event/${event.Slug}" class="card-bg p-4 flex items-center space-x-4 hover:bg-gray-800 transition-colors duration-200 block">
                                        <div class="text-center w-20 flex-shrink-0">
                                            <p class="text-2xl font-bold text-white">${new Date(event.Date).toLocaleDateString('en-GB', { day: 'numeric' })}</p>
                                            <p class="text-lg text-gray-400">${new Date(event.Date).toLocaleDateString('en-GB', { month: 'short' })}</p>
                                        </div>
                                        <div class="flex-grow">
                                            <h4 class="font-bold text-white text-xl">${event['Event Name']}</h4>
                                            <p class="text-sm text-gray-400">${new Date(event.Date).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' })}</p>
                                        </div>
                                        <div class="text-accent-color"><i class="fas fa-arrow-right"></i></div>
                                    </a>
                                `).join('') : '<p class="text-gray-400 text-lg">No upcoming events scheduled at this venue.</p>'}
                             </div>
                        </div>
                    </div>
                </main>
            </body>
            </html>
        `;
        return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: html };
    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: 'Server error building venue page.' };
    }
};
