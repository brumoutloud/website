const Airtable = require('airtable');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

// --- CONFIGURATION ---
// **FIX:** Changed AIRTABLE_API_KEY to AIRTABLE_PERSONAL_ACCESS_TOKEN to match your other working functions.
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const venuesTable = base('Venues');
const eventsTable = base('Events');

const BASE_URL = 'https://brumoutloud.co.uk';

// --- Helper Functions ---
async function getPageHtml(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Error fetching ${url}: ${response.statusText}`);
            return null;
        }
        return await response.text();
    } catch (error) {
        console.error(`Error fetching ${url}:`, error);
        return null;
    }
}

async function scrapeAndUploadVenues() {
    console.log('--- Starting Venue Scraping ---');
    // This assumes the main listing page has links to individual venue pages
    // You will need to update the selector below to match the live site's HTML
    const html = await getPageHtml(`${BASE_URL}/venues`); 
    if (!html) {
        return { success: false, message: 'Could not fetch main venues page.' };
    }

    const $ = cheerio.load(html);
    const venueLinks = [];
    // **IMPORTANT**: This selector MUST be updated to match the links on the live brumoutloud.co.uk/venues page
    $('a.venue-card-selector').each((i, el) => { // Example selector
        venueLinks.push($(el).attr('href'));
    });

    let newVenues = 0;
    for (const link of venueLinks) {
        const venueUrl = `${BASE_URL}${link}`;
        const venueHtml = await getPageHtml(venueUrl);
        if (venueHtml) {
            const $$ = cheerio.load(venueHtml);
            const venueName = $$('h1').text().trim();

            if (venueName) {
                const existingRecords = await venuesTable.select({
                    filterByFormula: `{Name} = "${venueName}"`
                }).firstPage();

                if (existingRecords.length === 0) {
                    const venueData = {
                        'Name': venueName,
                        // **IMPORTANT**: These selectors must be updated to match the live site's detail page HTML
                        'Description': $$('.description-class').text().trim(), 
                        'Address': $$('.address-class').text().trim(), 
                    };
                    await venuesTable.create([{ fields: venueData }]);
                    newVenues++;
                    console.log(`Inserted new venue: ${venueName}`);
                } else {
                    console.log(`Skipping existing venue: ${venueName}`);
                }
            }
        }
    }
    return { success: true, message: `Venue migration complete. Added ${newVenues} new venues.` };
}


// --- Main Handler ---
exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const result = await scrapeAndUploadVenues();
        return {
            statusCode: 200,
            body: JSON.stringify(result),
        };
    } catch (error) {
        console.error("Migration Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
