const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

// Helper function to create HTML for a list of tags
function createTagsHtml(tags, iconClass) {
    if (!tags || tags.length === 0) return '';
    const tagsHtml = tags.map(tag => `<span class="inline-flex items-center bg-gray-700/50 text-gray-300 text-sm font-semibold px-3 py-1 rounded-full"><i class="${iconClass} mr-2 opacity-60"></i>${tag}</span>`).join('');
    return `<div class="flex flex-wrap gap-3">${tagsHtml}</div>`;
}

// Helper function to create an info section if data exists
function createInfoSection(title, content, iconClass) {
    if (!content || (Array.isArray(content) && content.length === 0)) return '';
    return `
        <div>
            <h3 class="font-bold text-lg accent-color-secondary mb-3 flex items-center"><i class="${iconClass} mr-3 text-xl opacity-80"></i>${title}</h3>
            <div class="prose prose-invert prose-md max-w-none text-gray-400 pl-8">
                ${Array.isArray(content) ? `<ul>${content.map(item => `<li>${item}</li>`).join('')}</ul>` : content.replace(/\n/g, '<br>')}
            </div>
        </div>
    `;
}

exports.handler = async function (event, context) {
    const slug = event.path.split("/").pop();
    if (!slug) { return { statusCode: 400, body: 'Error: Venue slug not provided.' }; }

    try {
        const venueRecords = await base('Venues').select({
            maxRecords: 1,
            filterByFormula: `{Slug} = "${slug}"`,
            // Fetch all the new rich data fields
            fields: [
                'Name', 'Description', 'Address', 'Photo', 'Instagram', 'Website', 'Facebook', 'TikTok',
                'Opening Hours', 'Accessibility', 'Vibe Tags', 'Venue Features', 'Accessibility Rating', 
                'Accessibility Features', 'Parking Exception'
            ]
        }).firstPage();

        if (!venueRecords || !venueRecords.length) {
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
                    <div class="relative aspect-[4/3] bg-gray-900/50">
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

        const photos = fields['Photo'] || [];
        const mainPhoto = photos.length > 0 ? photos[0].url : 'https://placehold.co/1200x675/1a1a1a/f5efe6?text=Venue+Photo';
        
        const photoGalleryHtml = photos.length > 1 ? `
            <div class="mt-24">
                <h2 class="font-anton text-5xl text-white mb-8">Photo Gallery</h2>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    ${photos.slice(1).map(p => `<a href="${p.url}" target="_blank"><img src="${p.thumbnails.large.url}" alt="${venueName} Photo" class="w-full h-full aspect-square object-cover rounded-lg shadow-md hover:opacity-80 transition-opacity"></a>`).join('')}
                </div>
            </div>` : '';

        const description = fields['Description'] ? fields['Description'].replace(/\n/g, '<br>') : 'No description available.';
        const address = fields['Address'] || 'Address not available';
        
        // Social links
        const website = fields['Website'];
        const instagram = fields['Instagram'];
        const facebook = fields['Facebook'];
        const tiktok = fields['TikTok'];

        // Rich data fields
        const vibeTagsHtml = createTagsHtml(fields['Vibe Tags'], 'fa-solid fa-martini-glass-citrus');
        const venueFeaturesHtml = createTagsHtml(fields['Venue Features'], 'fa-solid fa-star');
        const openingHoursContent = fields['Opening Hours'] || 'Not Available';
        
        // Build Accessibility Section
        let accessibilityInfo = [];
        if (fields['Accessibility Rating']) {
            accessibilityInfo.push(`<strong>Rating:</strong> ${fields['Accessibility Rating']}`);
        }
        if (fields['Accessibility Features'] && fields['Accessibility Features'].length > 0) {
            accessibilityInfo.push(`<strong>Features:</strong> ${fields['Accessibility Features'].join(', ')}`);
        }
        if (fields['Accessibility']) { // General text field
             accessibilityInfo.push(fields['Accessibility']);
        }
        if (fields['Parking Exception']) {
            accessibilityInfo.push(`<strong>Parking:</strong> ${fields['Parking Exception']}`);
        }
        const accessibilityHtml = accessibilityInfo.length > 0 ? accessibilityInfo.join('<br>') : 'No specific accessibility information has been provided.';
        
        const mailtoLink = `mailto:feedback@brumoutloud.co.uk?subject=Issue with ${encodeURIComponent(venueName)} page`;

        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${venueName} | Brum Out Loud</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Anton&family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
                <link rel="stylesheet" href="/css/main.css">
                <script src="/js/main.js" defer></script>
            </head>
            <body class="antialiased">
                <div id="header-placeholder"></div>
                <main class="container mx-auto px-8 py-16">
                    <nav class="flex mb-8" aria-label="Breadcrumb">
                        <ol role="list" class="flex items-center space-x-4">
                            <li><a href="/all-venues" class="text-sm font-medium text-gray-400 hover:text-white">All Venues</a></li>
                            <li><div class="flex items-center"><i class="fas fa-chevron-right fa-xs text-gray-500 flex-shrink-0"></i><span aria-current="page" class="ml-4 text-sm font-medium text-white">${venueName}</span></div></li>
                        </ol>
                    </nav>

                    <div class="grid lg:grid-cols-5 gap-x-12 gap-y-8">
                        <div class="lg:col-span-3">
                            <img src="${mainPhoto}" alt="${venueName}" class="w-full aspect-video object-cover rounded-xl mb-8 shadow-lg">
                            <p class="font-semibold accent-color mb-2">ABOUT THE VENUE</p>
                            <h1 class="font-anton text-6xl lg:text-8xl heading-gradient leading-none mb-8">${venueName}</h1>
                            <div class="prose prose-invert prose-lg max-w-none text-gray-300 mb-12">
                                ${description}
                            </div>
                            
                            <div class="space-y-8">
                                ${vibeTagsHtml ? `<div><h3 class="font-anton text-3xl text-white mb-4">The Vibe</h3>${vibeTagsHtml}</div>` : ''}
                                ${venueFeaturesHtml ? `<div><h3 class="font-anton text-3xl text-white mb-4">Venue Features</h3>${venueFeaturesHtml}</div>` : ''}
                                <div class="border-t border-gray-800 pt-8">
                                     <h3 class="font-anton text-3xl text-white mb-4">Accessibility</h3>
                                     <div class="prose prose-invert max-w-none text-gray-300">${accessibilityHtml}</div>
                                </div>
                            </div>

                        </div>
                        <div class="lg:col-span-2">
                             <div class="card-bg p-8 sticky top-8 space-y-6">
                                ${createInfoSection('Address', address, 'fa-solid fa-map-location-dot')}
                                
                                ${createInfoSection('Opening Hours', openingHoursContent, 'fa-solid fa-clock')}

                                <div class="flex flex-wrap gap-4 pt-4 border-t border-gray-700">
                                    ${website ? `<a href="${website}" target="_blank" class="social-button"><i class="fas fa-globe mr-2"></i>Website</a>` : ''}
                                    ${instagram ? `<a href="${instagram}" target="_blank" class="social-button"><i class="fab fa-instagram mr-2"></i>Instagram</a>` : ''}
                                    ${facebook ? `<a href="${facebook}" target="_blank" class="social-button"><i class="fab fa-facebook mr-2"></i>Facebook</a>` : ''}
                                    ${tiktok ? `<a href="${tiktok}" target="_blank" class="social-button"><i class="fab fa-tiktok mr-2"></i>TikTok</a>` : ''}
                                </div>
                                <div class="pt-4 text-center">
                                    <a href="${mailtoLink}" class="text-xs text-gray-500 hover:text-accent-color transition-colors">Something wrong? Let us know</a>
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
                    
                    ${photoGalleryHtml}
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
