const Airtable = require('airtable');
const fetch = require('node-fetch'); // Ensure fetch is imported

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    const slug = event.path.split("/").pop();
    if (!slug) { return { statusCode: 400, body: 'Venue slug not provided.' }; }

    // Google Places API Key
    const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

    try {
        const venueRecords = await base('Venues').select({
            maxRecords: 1,
            filterByFormula: `{Slug} = "${slug}"`,
            // Add Google Place ID to the fields
            fields: ["Name", "Description", "Address", "Opening Hours", "Accessibility", "Website", "Instagram", "Facebook", "TikTok", "Photo URL", "Google Place ID"]
        }).all();

        if (!venueRecords || venueRecords.length === 0) {
            return { statusCode: 404, body: 'Venue not found.' };
        }
        const venue = venueRecords[0].fields;
        const venueRecordId = venueRecords[0].id; // Get the record ID for updates

        let placeId = venue['Google Place ID'];
        let googleRatingHtml = '';
        let googleReviewsHtml = '';
        let googleAttributionHtml = '';

        if (GOOGLE_PLACES_API_KEY) {
            // Part 1: Find and Store the Google Place ID
            if (!placeId) {
                const findPlaceQuery = encodeURIComponent(`${venue.Name}, ${venue.Address}`);
                const findPlaceUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${findPlaceQuery}&inputtype=textquery&fields=place_id&key=${GOOGLE_PLACES_API_KEY}`;
                
                try {
                    const findPlaceResponse = await fetch(findPlaceUrl);
                    const findPlaceData = await findPlaceResponse.json();
                    if (findPlaceData.status === 'OK' && findPlaceData.candidates && findPlaceData.candidates.length > 0) {
                        placeId = findPlaceData.candidates[0].place_id;
                        // Update Airtable with the new place_id
                        await base('Venues').update([
                            {
                                id: venueRecordId,
                                fields: { "Google Place ID": placeId }
                            }
                        ]);
                        console.log(`Updated venue ${venue.Name} with Place ID: ${placeId}`);
                    } else {
                        console.warn(`Could not find Place ID for ${venue.Name}. Status: ${findPlaceData.status}`);
                    }
                } catch (error) {
                    console.error("Error finding place ID:", error);
                }
            }

            // Part 2: Fetch Google Reviews and Rating
            if (placeId) {
                const placeDetailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=rating,user_ratings_total,reviews,url&key=${GOOGLE_PLACES_API_KEY}`;
                
                try {
                    const placeDetailsResponse = await fetch(placeDetailsUrl);
                    const placeDetailsData = await placeDetailsResponse.json();

                    if (placeDetailsData.status === 'OK' && placeDetailsData.result) {
                        const { rating, user_ratings_total, reviews, url: googleMapsUrl } = placeDetailsData.result;

                        // Generate star rating HTML
                        if (rating) {
                            let stars = '';
                            const fullStars = Math.floor(rating);
                            const halfStar = rating % 1 >= 0.5;
                            for (let i = 0; i < fullStars; i++) {
                                stars += '<i class="fas fa-star text-yellow-400"></i>';
                            }
                            if (halfStar) {
                                stars += '<i class="fas fa-star-half-alt text-yellow-400"></i>';
                            }
                            const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);
                            for (let i = 0; i < emptyStars; i++) {
                                stars += '<i class="far fa-star text-yellow-400"></i>';
                            }
                            googleRatingHtml = `
                                <div class="mt-4 pt-4 border-t border-gray-700">
                                    <h3 class="font-bold text-lg accent-color-secondary mb-2">Google Rating</h3>
                                    <div class="flex items-center space-x-2 text-xl">
                                        <div>${stars}</div>
                                        <p class="text-white font-semibold">${rating} <span class="text-gray-400">(${user_ratings_total} reviews)</span></p>
                                    </div>
                                    ${googleMapsUrl ? `<a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline text-sm mt-1 block">View on Google Maps</a>` : ''}
                                </div>
                            `;
                        }

                        // Generate reviews HTML
                        if (reviews && reviews.length > 0) {
                            const selectedReviews = reviews.slice(0, 3); // Get first 3 reviews
                            let reviewsCardsHtml = '';
                            selectedReviews.forEach(review => {
                                let reviewStars = '';
                                for (let i = 0; i < review.rating; i++) {
                                    reviewStars += '<i class="fas fa-star text-yellow-400 text-sm"></i>';
                                }
                                for (let i = 0; i < (5 - review.rating); i++) {
                                    reviewStars += '<i class="far fa-star text-yellow-400 text-sm"></i>';
                                }

                                reviewsCardsHtml += `
                                    <div class="card-bg p-4 space-y-2">
                                        <div class="flex items-center justify-between">
                                            <p class="font-semibold text-white">${review.author_name}</p>
                                            <div>${reviewStars}</div>
                                        </div>
                                        <p class="text-gray-300 text-sm">${review.text}</p>
                                    </div>
                                `;
                            });

                            googleReviewsHtml = `
                                <div class="mt-8">
                                    <h2 class="font-anton text-4xl mb-6">Recent Reviews <span class="accent-color">from Google</span></h2>
                                    <div class="space-y-4">
                                        ${reviewsCardsHtml}
                                    </div>
                                </div>
                            `;
                        }
                    } else {
                        console.warn(`Could not fetch Place Details for Place ID ${placeId}. Status: ${placeDetailsData.status}`);
                    }
                } catch (error) {
                    console.error("Error fetching place details:", error);
                }
            }
            // Attribution for Google Places API
            googleAttributionHtml = `
                <div class="mt-8 text-center">
                    <img src="https://maps.gstatic.com/help/attribution_image_uk-2x.png" alt="Powered by Google" style="width:120px; margin: 0 auto;">
                </div>
            `;
        }


        const eventRecords = await base('Events').select({
            filterByFormula: `AND({Venue Name} = "${venue.Name}", IS_AFTER({Date}, TODAY()))`,
            sort: [{ field: 'Date', direction: 'asc' }],
        }).all();

        const sortedEvents = eventRecords.map(rec => rec.fields);
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
                <script src="/js/main.js" defer></script>
            </head>
            <body class="antialiased">
                <div id="header-placeholder"></div>
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
                            ${venue['Opening Hours'] ? `<div><h3 class="font-bold text-lg accent-color-secondary mb-2">Opening Hours</h3><p class="text-gray-300 text-lg whitespace-pre-line">${venue['Opening Hours']}</p></div>` : ''}
                            ${venue.Accessibility ? `<div><h3 class="font-bold text-lg accent-color-secondary mb-2">Accessibility</h3><p class="text-gray-300 text-lg whitespace-pre-line">${venue.Accessibility}</p></div>` : ''}
                            ${googleRatingHtml} <div>
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
                             ${googleReviewsHtml} ${googleAttributionHtml} </div>
                    </div>
                </main>
                <div id="footer-placeholder"></div>
            </body>
            </html>
        `;
        return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: html };
    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: 'Server error building venue page.' };
    }
};
