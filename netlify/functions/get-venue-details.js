// v10 - Adds social media links to the venue detail page.
const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

async function fetchRecords(tableName, options) {
    return await base(tableName).select(options).all();
}

exports.handler = async function (event, context) {
    const slug = event.path.split("/").pop();

    if (!slug) {
        return { statusCode: 400, body: 'Venue slug not provided.' };
    }

    try {
        // --- Get the Venue's Details ---
        const venueRecords = await fetchRecords('Venues', {
            maxRecords: 1,
            filterByFormula: `{Slug} = "${slug}"`,
        });

        if (!venueRecords || venueRecords.length === 0) {
            return { statusCode: 404, body: 'Venue not found.' };
        }
        const venue = venueRecords[0].fields;
        
        // --- Get All Upcoming Events for this Venue ---
        const eventRecords = await fetchRecords('Events', {
            filterByFormula: `AND({Venue Name} = "${venue.Name}", IS_AFTER({Date}, TODAY()))`,
            sort: [{ field: 'Date', direction: 'asc' }],
        });

        const sortedEvents = eventRecords.map(rec => rec.fields).sort((a, b) => {
            const aIsRecurring = a['Recurring Info'] ? 0 : 1;
            const bIsRecurring = b['Recurring Info'] ? 0 : 1;
            if (aIsRecurring !== bIsRecurring) return aIsRecurring - bIsRecurring;
            return new Date(a.Date) - new Date(b.Date);
        });
        
        // --- Generate the HTML Page ---
        const html = `
            <!DOCTYPE html>
            <html lang="en" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${venue.Name} | Brum Out Loud</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&family=Roboto+Mono:wght@400&display=swap" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css" xintegrity="sha512-z3gLpd7yknf1YoNbCzqRKc4qyor8gaKU1qmn+CShxbuBusANI9QpRohGBreCFkKxLhei6S9CQXFEbbKuqLg0DA==" crossorigin="anonymous" referrerpolicy="no-referrer" />
                <style> body { font-family: 'Poppins', sans-serif; background-color: #121212; color: #EAEAEA; } </style>
            </head>
            <body class="antialiased">
                <header class="bg-[#1e1e1e] shadow-md">
                  <nav class="container mx-auto px-4 lg:px-0 py-4 flex justify-between items-center">
                    <a href="/" class="text-3xl font-bold text-white">BrumOutLoud</a>
                    <a href="/" class="bg-[#FADCD9] text-[#333333] px-5 py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity">Back to Events</a>
                  </nav>
                </header>
                <main class="container mx-auto p-4 lg:p-8">
                    <!-- Hero Section -->
                    <div class="relative rounded-2xl overflow-hidden mb-8">
                        <img src="${venue.Photo ? venue.Photo[0].url : 'https://placehold.co/1600x600/1e1e1e/EAEAEA?text=Venue'}" alt="${venue.Name}" class="w-full h-96 object-cover">
                        <div class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                        <h1 class="absolute bottom-8 left-8 text-5xl lg:text-7xl font-extrabold text-white">${venue.Name}</h1>
                    </div>

                    <!-- Details & Events Grid -->
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <!-- Left Column: Details -->
                        <div class="lg:col-span-1 space-y-6">
                            <div>
                                <h3 class="font-bold text-[#B564F7] text-lg mb-2">The Vibe</h3>
                                <p class="text-gray-300">${venue.Description || 'Info coming soon.'}</p>
                            </div>
                            <div>
                                <h3 class="font-bold text-[#B564F7] text-lg mb-2">Opening Hours</h3>
                                <p class="text-gray-300 whitespace-pre-line">${venue['Opening Hours'] || 'Check website for details.'}</p>
                            </div>
                            <div>
                                <h3 class="font-bold text-[#B564F7] text-lg mb-2">Address</h3>
                                <p class="text-gray-300">${venue.Address || 'N/A'}</p>
                            </div>
                             <div>
                                <h3 class="font-bold text-[#B564F7] text-lg mb-2">Accessibility</h3>
                                <p class="text-gray-300 whitespace-pre-line">${venue.Accessibility || 'Info not provided.'}</p>
                            </div>
                             ${venue.Website ? `<a href="${venue.Website}" target="_blank" class="block w-full text-center bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-500 transition-opacity">Visit Website</a>` : ''}
                        
                            <!-- Social Links Section -->
                            <div class="border-t border-gray-700 pt-6">
                                <h3 class="font-bold text-[#B564F7] text-lg mb-4 text-center">Follow Them</h3>
                                <div class="flex justify-center space-x-6">
                                    ${venue.Instagram ? `<a href="${venue.Instagram}" target="_blank" class="text-gray-400 hover:text-white"><i class="fab fa-instagram fa-2x"></i></a>` : ''}
                                    ${venue.Facebook ? `<a href="${venue.Facebook}" target="_blank" class="text-gray-400 hover:text-white"><i class="fab fa-facebook fa-2x"></i></a>` : ''}
                                    ${venue.TikTok ? `<a href="${venue.TikTok}" target="_blank" class="text-gray-400 hover:text-white"><i class="fab fa-tiktok fa-2x"></i></a>` : ''}
                                    ${venue['X (Twitter)'] ? `<a href="${venue['X (Twitter)']}" target="_blank" class="text-gray-400 hover:text-white"><i class="fab fa-twitter fa-2x"></i></a>` : ''}
                                </div>
                            </div>
                        </div>

                        <!-- Right Column: Upcoming Events -->
                        <div class="lg:col-span-2">
                             <h2 class="text-3xl font-bold text-white mb-4">What's On at ${venue.Name}</h2>
                             <div class="space-y-4">
                                ${sortedEvents.length > 0 ? sortedEvents.map(event => `
                                    <div class="bg-[#1e1e1e] p-4 rounded-lg flex items-center space-x-4">
                                        <div class="text-center w-20 flex-shrink-0">
                                            <p class="text-xl font-bold text-white">${new Date(event.Date).toLocaleDateString('en-GB', { day: 'numeric' })}</p>
                                            <p class="text-md text-gray-400">${new Date(event.Date).toLocaleDateString('en-GB', { month: 'short' })}</p>
                                        </div>
                                        <div class="flex-grow">
                                            <h4 class="font-bold text-white">${event['Event Name']}</h4>
                                            <p class="text-sm text-gray-400">${new Date(event.Date).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' })}</p>
                                            ${event['Recurring Info'] ? `<span class="mt-1 inline-block bg-teal-400/10 text-teal-300 text-xs font-semibold px-2 py-1 rounded-full">${event['Recurring Info']}</span>` : ''}
                                        </div>
                                        <a href="/event/${event.Slug}" class="bg-[#FADCD9] text-[#333333] px-4 py-2 rounded-lg font-semibold text-sm">View</a>
                                    </div>
                                `).join('') : '<p class="text-gray-400">No upcoming events scheduled.</p>'}
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
        return { statusCode: 500, body: 'Server error while building venue page.' };
    }
};
