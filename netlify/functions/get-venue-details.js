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

/**
 * Parses opening hours text to determine current status.
 * Handles single time slots, multiple (comma-separated) slots, day ranges, and overnight hours.
 * @param {string} openingHoursText - The multi-line text from Airtable.
 * @returns {{html: string}} - The HTML for the status badge.
 */
function getOpeningStatus(openingHoursText) {
    if (!openingHoursText || openingHoursText === 'Not Available') {
        return { html: '' }; // No hours, no status
    }

    const schedule = {}; // { 0: [{opens: 1020, closes: 1380, ...}], 1: [{isClosed: true}], ... }
    const dayIndexes = { "Sun": 0, "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6 };

    const toMinutes = (timeStr, period) => {
        let [hour, minute] = timeStr.split(':').map(Number);
        minute = minute || 0;
        if (period.toLowerCase() === 'pm' && hour !== 12) hour += 12;
        if (period.toLowerCase() === 'am' && hour === 12) hour = 0;
        return hour * 60 + minute;
    };
    
    // 1. Parse the text and build a detailed schedule object
    const lines = openingHoursText.split('<br>');
    for (const line of lines) {
        const parts = line.split(':');
        if (parts.length < 2) continue;
        const dayPart = parts[0].trim();
        const timePart = parts[1].trim();

        const daysToApply = [];
        if (dayPart.includes('-')) {
            const [startDay, endDay] = dayPart.split('-').map(d => d.trim());
            let current = dayIndexes[startDay], end = dayIndexes[endDay];
            if (current === undefined || end === undefined) continue;
            while (true) { daysToApply.push(current); if (current === end) break; current = (current + 1) % 7; }
        } else {
            const dayIndex = dayIndexes[dayPart];
            if (dayIndex !== undefined) daysToApply.push(dayIndex);
        }

        daysToApply.forEach(dayIndex => { if (!schedule[dayIndex]) schedule[dayIndex] = []; });

        if (timePart.toLowerCase() === 'closed') {
            daysToApply.forEach(dayIndex => schedule[dayIndex].push({ isClosed: true }));
            continue;
        }

        const timeSlots = timePart.split(',');
        for (const slot of timeSlots) {
            const timeMatches = slot.trim().match(/(\d{1,2}(?::\d{2})?)(am|pm)\s*-\s*(\d{1,2}(?::\d{2})?)(am|pm)/i);
            if (!timeMatches) continue;
            
            let [, openTimeStr, openPeriod, closeTimeStr, closePeriod] = timeMatches;
            daysToApply.forEach(dayIndex => {
                schedule[dayIndex].push({
                    isClosed: false,
                    opens: toMinutes(openTimeStr, openPeriod),
                    closes: toMinutes(closeTimeStr, closePeriod),
                    openDisplay: `${openTimeStr}${openPeriod}`,
                    closeDisplay: `${closeTimeStr}${closePeriod}`
                });
            });
        }
    }
    
    // 2. Determine the current status based on the schedule
    const now = new Date();
    const londonTimeOpts = { timeZone: 'Europe/London' };
    const currentDayIndex = now.getDay();
    const prevDayIndex = (currentDayIndex + 6) % 7;
    const hour = parseInt(now.toLocaleString('en-GB', { ...londonTimeOpts, hour: '2-digit', hour12: false }), 10);
    const minute = parseInt(now.toLocaleString('en-GB', { ...londonTimeOpts, minute: '2-digit' }), 10);
    const currentTimeInMinutes = hour * 60 + minute;

    let status = 'Closed', message = 'Currently Closed', color = 'red';

    const checkStatus = () => {
        // Check if still open from yesterday's overnight slots
        for (const slot of (schedule[prevDayIndex] || [])) {
            if (!slot.isClosed && slot.closes < slot.opens) { // This identifies an overnight slot
                if (currentTimeInMinutes < slot.closes) {
                    return { status: 'Open', message: `Open until ${slot.closeDisplay} (from yesterday)`, color: 'green' };
                }
            }
        }
        // Check today's slots
        for (const slot of (schedule[currentDayIndex] || [])) {
            if (slot.isClosed) continue;

            let isOpenNow;
            if (slot.closes > slot.opens) { // Standard slot: starts and ends on the same day
                isOpenNow = (currentTimeInMinutes >= slot.opens && currentTimeInMinutes < slot.closes);
            } else { // Overnight slot: starts today, ends tomorrow (THIS IS THE FIX)
                isOpenNow = (currentTimeInMinutes >= slot.opens || currentTimeInMinutes < slot.closes);
            }

            if (isOpenNow) {
                return { status: 'Open', message: `Open until ${slot.closeDisplay}`, color: 'green' };
            }
        }
        return null; // Not currently open
    };
    
    const currentStatus = checkStatus();
    
    if (currentStatus) {
        ({ status, message, color } = currentStatus);
    } else { // If closed, check if it opens soon
        for (const slot of (schedule[currentDayIndex] || [])) {
             if (!slot.isClosed && currentTimeInMinutes < slot.opens && (slot.opens - currentTimeInMinutes <= 60)) {
                 status = 'Opens Soon';
                 message = `Opens at ${slot.openDisplay}`;
                 color = 'orange';
                 break; 
             }
        }
    }
    
    // 3. Generate HTML
    const colorClasses = { red: 'bg-red-500/10 text-red-400 border-red-500/30', green: 'bg-green-500/10 text-green-400 border-green-500/30', orange: 'bg-orange-500/10 text-orange-400 border-orange-500/30' };
    return { html: `<div class="p-3 rounded-lg border text-center ${colorClasses[color]} mb-6"><p class="font-bold text-lg">${status}</p><p class="text-sm">${message}</p></div>` };
}


exports.handler = async function (event, context) {
    const slug = event.path.split("/").pop();
    if (!slug) { return { statusCode: 400, body: 'Venue slug not provided.' }; }
    
    const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

    try {
        const venueRecords = await base('Venues').select({
            maxRecords: 1,
            filterByFormula: `{Slug} = "${slug}"`,
            fields: [ "Name", "Description", "Address", "Opening Hours", "Accessibility", "Website", "Instagram", "Facebook", "TikTok", "Photo", "Google Place ID", "Vibe Tags", "Venue Features", "Accessibility Rating", "Accessibility Features", "Parking Exception" ]
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
        // Corrected googleMapsUrl interpolation (THIS IS A NECESSARY FIX)
        let googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.Name + ', ' + venue.Address)}${placeId ? `&query_place_id=${placeId}` : ''}`;


        if (GOOGLE_PLACES_API_KEY) {
            // Logic to fetch Google Place ID and details (unchanged)
            if (!placeId) {
                const findPlaceQuery = encodeURIComponent(`${venue.Name}, ${venue.Address}`);
                const findPlaceUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${findPlaceQuery}&inputtype=textquery&fields=place_id&key=${GOOGLE_PLACES_API_KEY}`;
                try {
                    const findPlaceResponse = await fetch(findPlaceUrl);
                    const findPlaceData = await findPlaceResponse.json();
                    if (findPlaceData.status === 'OK' && findPlaceData.candidates.length > 0) {
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
                        if(url) googleMapsUrl = url;

                        if (rating) {
                            const stars = generateStars(rating);
                            googleRatingHtml = createSidebarSection( 'Google Rating', `<div class="flex items-center space-x-2 text-xl"><div>${stars}</div><p class="text-white font-semibold">${rating} <span class="text-gray-400">(${user_ratings_total})</span></p></div> <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline text-sm mt-1 block">View on Google Maps</a>`, 'fab fa-google' );
                        }

                        if (reviews && reviews.length > 0) {
                            googleReviewsHtml = `<div class="mt-24"><h2 class="font-anton text-5xl text-white mb-8">Recent Reviews from Google</h2><div class="space-y-4">${reviews.slice(0, 3).map(review => { const reviewStars = generateStars(review.rating); let reviewText = review.text; let readMoreLink = ''; if (reviewText.length > 280) { reviewText = reviewText.substring(0, 280) + '...'; readMoreLink = `<a href="${googleMapsUrl}" target="_blank" class="text-blue-400 hover:underline text-xs">Read more on Google</a>`; } return `<div class="card-bg p-4 space-y-2"><div class="flex items-center justify-between"><p class="font-semibold text-white">${review.author_name}</p><div class="text-xs">${reviewStars}</div></div><p class="text-gray-300 text-sm">${reviewText}</p>${readMoreLink}</div>` }).join('')}<div class="mt-8 text-center"><img src="https://www.gstatic.com/marketing-cms/assets/images/c5/3a/200414104c669203c62270f7884f/google-wordmarks-2x.webp" alt="Powered by Google" style="max-width:120px; height: auto; margin: 0 auto;"></div></div></div>`;
                        }
                    }
                } catch (error) { console.error("Error fetching place details:", error); }
            }
        }
        
        // --- Refactored: Venue details HTML generation ---
        // This section now correctly uses 'venue' data and structure.
        const mainPhoto = venue['Photo'] && venue['Photo'].length > 0 ? venue['Photo'][0].url : 'https://placehold.co/1200x675/1a1a1a/f5efe6?text=Venue+Photo';
        const description = venue['Description'] || 'No description provided.';
        const openingHoursText = venue['Opening Hours'] ? venue['Opening Hours'].replace(/\n/g, '<br>') : 'Not Available';
        const openingStatus = getOpeningStatus(openingHoursText); // Call the fixed function
        const openingHoursContent = openingHoursText; // Raw text for full hours list
        const vibeTagsHtml = createTagsHtml(venue['Vibe Tags'], 'fa-solid fa-martini-glass-citrus');
        const venueFeaturesHtml = createTagsHtml(venue['Venue Features'], 'fa-solid fa-star');
        let accessibilityInfo = [];
        if (venue['Accessibility Rating']) accessibilityInfo.push(`<strong>Rating:</strong> ${venue['Accessibility Rating']}`);
        if (venue['Accessibility Features']) accessibilityInfo.push(`<strong>Features:</strong> ${venue['Accessibility Features'].join(', ')}`);
        if (venue['Accessibility']) accessibilityInfo.push(venue['Accessibility']);
        if (venue['Parking Exception']) accessibilityInfo.push(`<strong>Parking:</strong> ${venue['Parking Exception']}`);
        const accessibilityHtml = accessibilityInfo.length > 0 ? accessibilityInfo.join('<br><br>') : 'No specific accessibility information has been provided.';

        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${venue.Name} | Brum Out Loud</title><script src="https://cdn.tailwindcss.com"></script><link href="https://fonts.googleapis.com/css2?family=Anton&family=Poppins:wght@400;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"><link rel="stylesheet" href="/css/main.css"><script src="/js/main.js" defer></script><style>.hero-image-container { position: relative; width: 100%; aspect-ratio: 16 / 9; background-color: #1e1e1e; overflow: hidden; border-radius: 1.25rem; box-shadow: 0 10px 30px rgba(0,0,0,0.3); } .hero-image-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; filter: blur(24px) brightness(0.5); transform: scale(1.1); transition: opacity 0.4s ease; } .hero-image-container:hover .hero-image-bg { opacity: 1; } .hero-image-fg { position: relative; width: 100%; height: 100%; object-fit: cover; z-index: 10; transition: all 0.4s ease; } .hero-image-container:hover .hero-image-fg { object-fit: contain; transform: scale(0.9); } .suggested-card { border-radius: 1.25rem; box-shadow: 0 10px 30px rgba(0,0,0,0.3); background-color: #1e1e1e; transition: transform 0.3s ease, box-shadow 0.3s ease; } .suggested-card:hover { transform: translateY(-5px); box-shadow: 0 15px 40px rgba(0,0,0,0.5); } .suggested-carousel { scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; overflow-x: auto; padding-bottom: 1rem; scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.3) rgba(0, 0, 0, 0.1); } .suggested-carousel::-webkit-scrollbar { height: 4px; } .suggested-carousel::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.1); border-radius: 2px; } .suggested-carousel::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.3); border-radius: 2px; }</style></head><body class="antialiased"><div id="header-placeholder"></div><main class="container mx-auto px-8 py-16"><div class="grid lg:grid-cols-3 gap-16"><div class="lg:col-span-2"><div class="hero-image-container mb-8"><img src="${mainPhoto}" alt="" class="hero-image-bg" aria-hidden="true"><img src="${mainPhoto}" alt="${venue.Name}" class="hero-image-fg"></div><p class="font-semibold accent-color mb-2">VENUE DETAILS</p><h1 class="font-anton text-6xl lg:text-8xl heading-gradient leading-none mb-8">${venue.Name}</h1><div class="prose prose-invert prose-lg max-w-none text-gray-300">${description.replace(/\n/g, '<br>')}</div></div><div class="lg:col-span-1"><div class="card-bg p-8 sticky top-8 space-y-6"><div><h3 class="font-bold text-lg accent-color-secondary mb-2">Current Status</h3>${openingStatus.html}</div><div><h3 class="font-bold text-lg accent-color-secondary mb-2">Location</h3><p class="text-2xl font-semibold">${venue.Address}</p><a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="text-sm text-accent-color hover:underline">Get Directions</a></div>${createSidebarSection('Opening Hours', openingHoursContent, 'fa-solid fa-clock')}${createSidebarSection('The Vibe', vibeTagsHtml, 'fa-solid fa-martini-glass-citrus')}${createSidebarSection('Venue Features', venueFeaturesHtml, 'fa-solid fa-star')}${createSidebarSection('Accessibility', accessibilityHtml, 'fa-solid fa-universal-access')}${googleRatingHtml}<div class="border-t border-gray-700 pt-6"><h3 class="font-bold text-lg accent-color-secondary mb-4 text-center">Contact & Social</h3><div class="grid grid-cols-1 gap-2">${venue.Website ? `<a href="${venue.Website}" target="_blank" class="social-button flex-grow"><i class="fas fa-globe mr-2"></i>Website</a>` : ''}${venue.Instagram ? `<a href="${venue.Instagram}" target="_blank" class="social-button flex-grow"><i class="fab fa-instagram mr-2"></i>Instagram</a>` : ''}${venue.Facebook ? `<a href="${venue.Facebook}" target="_blank" rel="noopener noreferrer" class="block w-full text-center bg-gray-700 text-white font-bold py-3 px-4 rounded-lg hover:bg-gray-600">Facebook</a>` : ''}${venue.TikTok ? `<a href="${venue.TikTok}" target="_blank" rel="noopener noreferrer" class="block w-full text-center bg-gray-700 text-white font-bold py-3 px-4 rounded-lg hover:bg-gray-600">TikTok</a>` : ''}</div></div></div></div></div>${googleReviewsHtml}</main><div id="footer-placeholder"></div></body></html>`;

        return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: html };

    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: 'Server error building venue page.' };
    }
};
