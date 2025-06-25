const Airtable = require('airtable');
const fetch = require('node-fetch');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

// Helper function to create HTML for a list of tags in the sidebar
function createTagsHtml(tags, iconClass) {
    if (!tags || tags.length === 0) return '';
    const tagsHtml = tags.map(tag => `<span class="inline-flex items-center bg-gray-700/50 text-gray-300 text-sm font-semibold px-3 py-1 rounded-full"><i class="${iconClass} mr-2 opacity-60"></i>${tag}</span>`).join('');
    return `<div class="flex flex-wrap gap-2">${tagsHtml}</div>`;
}

// Helper function to create a generic section in the sidebar
function createSidebarSection(title, content, iconClass) {
    if (!content || (Array.isArray(content) && content.length === 0)) return '';
    return `
        <div class="border-t border-gray-700 pt-6">
            <h3 class="font-bold text-lg accent-color-secondary mb-3 flex items-center"><i class="${iconClass} mr-3 text-xl opacity-80"></i>${title}</h3>
            <div class="prose prose-invert prose-sm max-w-none text-gray-400">
                ${content}
            </div>
        </div>
    `;
}

// Helper function to generate star rating HTML
function generateStars(rating) {
    let stars = '';
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5;
    for (let i = 0; i < fullStars; i++) stars += '<i class="fas fa-star text-yellow-400"></i>';
    if (halfStar) stars += '<i class="fas fa-star-half-alt text-yellow-400"></i>';
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);
    for (let i = 0; i < emptyStars; i++) stars += '<i class="far fa-star text-yellow-400"></i>';
    return stars;
}


exports.handler = async function (event, context) {
    const slug = event.path.split("/").pop();
    if (!slug) { return { statusCode: 400, body: 'Venue slug not provided.' }; }
    
    const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

    try {
        const venueRecords = await base('Venues').select({
            maxRecords: 1,
            filterByFormula: `{Slug} = "${slug}"`,
            fields: [
                "Name", "Description", "Address", "Opening Hours", "Accessibility", "Website", "Instagram", "Facebook", "TikTok", 
                "Photo", "Google Place ID", "Vibe Tags", "Venue Features", "Accessibility Rating", "Accessibility Features", "Parking Exception"
            ]
        }).all();

        if (!venueRecords || venueRecords.length === 0) {
            return { statusCode: 404, body: 'Venue not found.' };
        }
        
        const venueRecord = venueRecords[0];
        const venue = venueRecord.fields;
        const venueRecordId = venueRecord.id;

        // --- GOOGLE PLACES API INTEGRATION ---
        let placeId = venue['Google Place ID'];
        let googleRatingHtml = '';
        let googleReviewsHtml = '';
        let googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.Name + ', ' + venue.Address)}`;


        if (GOOGLE_PLACES_API_KEY) {
            if (!placeId) {
                const findPlaceQuery = encodeURIComponent(`${venue.Name}, ${venue.Address}`);
                const findPlaceUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${findPlaceQuery}&inputtype=textquery&fields=place_id&key=${GOOGLE_PLACES_API_KEY}`;
                try {
                    const findPlaceResponse = await fetch(findPlaceUrl);
                    const findPlaceData = await findPlaceResponse.json();
                    if (findPlaceData.status === 'OK' && findPlaceData.candidates && findPlaceData.candidates.length > 0) {
                        placeId = findPlaceData.candidates[0].place_id;
                        await base('Venues').update([{ id: venueRecordId, fields: { "Google Place ID": placeId } }]);
                    }
                } catch (error) { console.error("Error finding place ID:", error); }
            }

            if (placeId) {
                const placeDetailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=rating,user_ratings_total,reviews,url&key=${GOOGLE_PLACES_API_KEY}`;
                try {
                    const placeDetailsResponse = await fetch(placeDetailsUrl);
                    const placeDetailsData = await placeDetailsResponse.json();
                    if (placeDetailsData.status === 'OK' && placeDetailsData.result) {
                        const { rating, user_ratings_total, reviews, url } = placeDetailsData.result;
                        if(url) googleMapsUrl = url; // Use the more precise URL from Google if available

                        if (rating) {
                            const stars = generateStars(rating);
                            googleRatingHtml = createSidebarSection(
                                'Google Rating',
                                `<div class="flex items-center space-x-2 text-xl"><div>${stars}</div><p class="text-white font-semibold">${rating} <span class="text-gray-400">(${user_ratings_total})</span></p></div>
                                 <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline text-sm mt-1 block">View on Google Maps</a>`,
                                'fab fa-google'
                            );
                        }

                        if (reviews && reviews.length > 0) {
                            googleReviewsHtml = `
                                <div class="mt-24">
                                    <h2 class="font-anton text-5xl text-white mb-8">Recent Reviews from Google</h2>
                                    <div class="space-y-4">
                                        ${reviews.slice(0, 3).map(review => {
                                            const reviewStars = generateStars(review.rating);
                                            let reviewText = review.text;
                                            let readMoreLink = '';
                                            if (reviewText.length > 280) {
                                                reviewText = reviewText.substring(0, 280) + '...';
                                                readMoreLink = `<a href="${googleMapsUrl}" target="_blank" class="text-blue-400 hover:underline text-xs">Read more on Google</a>`;
                                            }

                                            return `
                                            <div class="card-bg p-4 space-y-2">
                                                <div class="flex items-center justify-between">
                                                    <p class="font-semibold text-white">${review.author_name}</p>
                                                    <div class="text-xs">${reviewStars}</div>
                                                </div>
                                                <p class="text-gray-300 text-sm">${reviewText}</p>
                                                ${readMoreLink}
                                            </div>
                                        `}).join('')}
                                        <div class="mt-8 text-center">
                                            <img src="https://www.gstatic.com/marketing-cms/assets/images/c5/3a/200414104c669203c62270f7884f/google-wordmarks-2x.webp" alt="Powered by Google" style="max-width:120px; height: auto; margin: 0 auto;">
                                        </div>
                                    </div>
                                </div>
                            `;
                        }
                    }
                } catch (error) { console.error("Error fetching place details:", error); }
            }
        }
        
        const eventRecords = await base('Events').select({
            filterByFormula: `AND({Venue Name} = "${venue.Name.replace(/"/g, '\\"')}", IS_AFTER({Date}, TODAY()))`,
            sort: [{ field: 'Date', direction: 'asc' }],
            fields: ['Event Name', 'Date', 'Slug'] 
        }).all();

        const upcomingEventsHtml = eventRecords.length > 0 ? eventRecords.map(record => {
            const event = record.fields;
            const eventDate = new Date(event.Date);
            return `
                <a href="/event/${event.Slug}" class="card-bg p-4 flex items-center space-x-4 hover:bg-gray-800 transition-colors duration-200 block">
                    <div class="text-center w-20 flex-shrink-0">
                        <p class="text-2xl font-bold text-white">${eventDate.toLocaleDateString('en-GB', { day: 'numeric' })}</p>
                        <p class="text-lg text-gray-400">${eventDate.toLocaleDateString('en-GB', { month: 'short' })}</p>
                    </div>
                    <div class="flex-grow">
                        <h4 class="font-bold text-white text-xl">${event['Event Name']}</h4>
                        <p class="text-sm text-gray-400">${eventDate.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' })}</p>
                    </div>
                    <div class="text-accent-color"><i class="fas fa-arrow-right"></i></div>
                </a>
            `;
        }).join('') : '<p class="text-gray-400 text-lg">No upcoming events scheduled at this venue.</p>';

        const photos = venue['Photo'] || [];
        const mainPhoto = photos.length > 0 ? photos[0].url : 'https://placehold.co/1200x675/1a1a1a/f5efe6?text=Venue+Photo';
        
        const photoGalleryHtml = photos.length > 1 ? `
            <div class="mt-24"><h2 class="font-anton text-5xl text-white mb-8">Photo Gallery</h2><div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            ${photos.slice(1).map(p => `<a href="${p.url}" target="_blank"><img src="${p.thumbnails.large.url}" alt="${venue.Name} Photo" class="w-full h-full aspect-square object-cover rounded-lg shadow-md hover:opacity-80 transition-opacity"></a>`).join('')}
            </div></div>` : '';

        const vibeTagsHtml = createTagsHtml(venue['Vibe Tags'], 'fa-solid fa-martini-glass-citrus');
        const venueFeaturesHtml = createTagsHtml(venue['Venue Features'], 'fa-solid fa-star');
        const openingHoursContent = venue['Opening Hours'] ? venue['Opening Hours'].replace(/\n/g, '<br>') : 'Not Available';
        let accessibilityInfo = [];
        if (venue['Accessibility Rating']) accessibilityInfo.push(`<strong>Rating:</strong> ${venue['Accessibility Rating']}`);
        if (venue['Accessibility Features']) accessibilityInfo.push(`<strong>Features:</strong> ${venue['Accessibility Features'].join(', ')}`);
        if (venue['Accessibility']) accessibilityInfo.push(venue['Accessibility']);
        if (venue['Parking Exception']) accessibilityInfo.push(`<strong>Parking:</strong> ${venue['Parking Exception']}`);
        const accessibilityHtml = accessibilityInfo.length > 0 ? accessibilityInfo.join('<br><br>') : 'No specific accessibility information has been provided.';
        
        const html = `
            <!DOCTYPE html><html lang="en">
            <head>
                <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${venue.Name} | Brum Out Loud</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Anton&family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
                <link rel="stylesheet" href="/css/main.css"><script src="/js/main.js" defer></script>
            </head>
            <body class="antialiased">
                <div id="header-placeholder"></div>
                <main class="container mx-auto px-8 py-16">
                    <div class="relative rounded-2xl overflow-hidden mb-16 h-96 card-bg">
                        <img src="${mainPhoto}" alt="${venue.Name}" class="w-full h-full object-cover opacity-50">
                        <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                        <div class="absolute bottom-8 left-8"><h1 class="font-anton text-6xl lg:text-8xl heading-gradient leading-none">${venue.Name}</h1></div>
                    </div>
                    <div class="grid lg:grid-cols-3 gap-16">
                        <div class="lg:col-span-2">
                             <h2 class="font-anton text-4xl mb-8"><span class="accent-color">What's On</span> at ${venue.Name}</h2>
                             <div class="space-y-4">${upcomingEventsHtml}</div>
                             ${googleReviewsHtml}
                             ${photoGalleryHtml}
                        </div>
                        <div class="lg:col-span-1"><div class="card-bg p-8 sticky top-8 space-y-6">
                            <div>
                                <h3 class="font-bold text-lg accent-color-secondary mb-2">The Vibe</h3>
                                <p class="text-gray-300 text-base">${venue.Description || 'Info coming soon.'}</p>
                            </div>
                            ${createSidebarSection('Address', `${venue.Address}<br><a href="${googleMapsUrl}" target="_blank" class="text-sm text-accent-color hover:underline">Get Directions</a>`, 'fa-solid fa-map-location-dot')}
                            ${createSidebarSection('Opening Hours', openingHoursContent, 'fa-solid fa-clock')}
                            ${createSidebarSection('Venue Features', venueFeaturesHtml, 'fa-solid fa-star')}
                            ${createSidebarSection('Accessibility', accessibilityHtml, 'fa-solid fa-universal-access')}
                            ${googleRatingHtml}
                            <div class="border-t border-gray-700 pt-6 flex flex-wrap gap-4">
                                ${venue.Website ? `<a href="${venue.Website}" target="_blank" class="social-button flex-grow"><i class="fas fa-globe mr-2"></i>Website</a>` : ''}
                                ${venue.Instagram ? `<a href="${venue.Instagram}" target="_blank" class="social-button flex-grow"><i class="fab fa-instagram mr-2"></i>Instagram</a>` : ''}
                            </div>
                            <div class="pt-4 text-center"><a href="mailto:feedback@brumoutloud.co.uk?subject=Issue with ${encodeURIComponent(venue.Name)} page" class="text-xs text-gray-500 hover:text-accent-color">Something wrong? Let us know</a></div>
                        </div></div>
                    </div>
                </main>
                <div id="footer-placeholder"></div>
            </body></html>`;
        return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: html };
    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: 'Server error building venue page.' };
    }
};
