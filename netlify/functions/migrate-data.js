const Airtable = require('airtable');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

// --- CONFIGURATION ---
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');
const venuesTable = base('Venues');
const BASE_URL = 'https://brumoutloud.co.uk';

const EVENT_LINK_SELECTOR = '.eventlist-event a.eventlist-title-link'; 

// --- Helper Functions ---
async function getPageHtml(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch page. Status: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.error("Error fetching page:", error);
        return null;
    }
}

// **NEW**: This function finds an existing venue in Airtable and returns its Record ID
async function findVenueRecordId(venueName) {
    if (!venueName) return null;
    try {
        const records = await venuesTable.select({
            filterByFormula: `LOWER({Name}) = LOWER("${venueName.replace(/"/g, '\\"')}")`,
            maxRecords: 1
        }).firstPage();
        
        if (records.length > 0) {
            return records[0].id;
        }
        return null;
    } catch (error) {
        console.error(`Error finding venue "${venueName}":`, error);
        return null;
    }
}


async function scrapeAndUploadEvents() {
    console.log('--- Starting Event Scraping ---');
    const html = await getPageHtml(BASE_URL);
    if (!html) throw new Error('Could not fetch the main events page.');

    const $ = cheerio.load(html);
    const eventsToProcess = [];

    $(EVENT_LINK_SELECTOR).each((i, el) => {
        const eventPath = $(el).attr('href');
        if (eventPath && eventPath.startsWith('/')) {
            eventsToProcess.push({ path: eventPath });
        }
    });

    console.log(`Found ${eventsToProcess.length} event links to process.`);
    let newEventsCount = 0;
    let skippedCount = 0;

    for (const event of eventsToProcess) {
        const eventUrl = `${BASE_URL}${event.path}`;
        const eventHtml = await getPageHtml(eventUrl);
        if (eventHtml) {
            const $$ = cheerio.load(eventHtml);
            const eventName = $$('h1.eventitem-title').text().trim();
            
            if (eventName) {
                const existing = await eventsTable.select({ filterByFormula: `{Event Name} = "${eventName.replace(/"/g, '\\"')}"` }).firstPage();
                if (existing.length === 0) {
                    const venueName = $$('.eventlist-meta-address').clone().children().remove().end().text().trim();
                    const venueRecordId = await findVenueRecordId(venueName);

                    const eventData = {
                        'Event Name': eventName,
                        'Description': $$('.eventitem-description').text().trim() || '',
                        'Status': 'Approved',
                        'VenueText': venueName, // Keep the original text for reference
                    };

                    // **FIX**: If we found a matching venue, link it.
                    if (venueRecordId) {
                        eventData['Venue'] = [venueRecordId]; // Link to the venue record
                    }

                    await eventsTable.create([{ fields: eventData }]);
                    newEventsCount++;
                } else {
                    skippedCount++;
                }
            }
        }
    }
    console.log(`Finished events. Added: ${newEventsCount}, Skipped: ${skippedCount}`);
    return { added: newEventsCount, skipped: skippedCount };
}


// --- Main Handler ---
exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const eventResults = await scrapeAndUploadEvents();
        // Removed venue scraping as requested
        const summary = `Migration complete. Added ${eventResults.added} new events. Skipped ${eventResults.skipped} duplicates.`;
        
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: summary }),
        };

    } catch (error) {
        console.error("Migration Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
