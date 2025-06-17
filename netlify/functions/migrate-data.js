const Airtable = require('airtable');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

// --- CONFIGURATION ---
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');
const venuesTable = base('Venues');
const BASE_URL = 'https://brumoutloud.co.uk';

// --- Helper Functions ---
async function getPageHtml(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch page: ${url}. Status: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.error("Error fetching page:", error);
        return null;
    }
}

async function findVenueRecordId(venueName) {
    if (!venueName) return null;
    try {
        const records = await venuesTable.select({
            filterByFormula: `LOWER({Name}) = LOWER("${venueName.replace(/"/g, '\\"')}")`,
            maxRecords: 1
        }).firstPage();
        return records.length > 0 ? records[0].id : null;
    } catch (error) {
        console.error(`Error finding venue "${venueName}":`, error);
        return null;
    }
}

// --- Main Handler ---
exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        console.log("--- Starting Event Scraping ---");
        const html = await getPageHtml(BASE_URL);
        if (!html) throw new Error('Could not fetch the main events page.');

        const $ = cheerio.load(html);
        const eventsToProcess = [];

        $('.eventlist-event').each((i, el) => {
            const element = $(el);
            const titleLink = element.find('.eventlist-title-link');
            const eventName = titleLink.text().trim();
            const eventPath = titleLink.attr('href');

            if (eventName && eventPath) {
                eventsToProcess.push({ name: eventName, path: eventPath });
            }
        });

        console.log(`Found ${eventsToProcess.length} events to process.`);
        let newCount = 0;
        let skippedCount = 0;
        let unlinkedCount = 0;

        for (const event of eventsToProcess) {
            const existing = await eventsTable.select({ filterByFormula: `{Event Name} = "${event.name.replace(/"/g, '\\"')}"` }).firstPage();
            if (existing.length > 0) {
                skippedCount++;
                continue;
            }

            const eventHtml = await getPageHtml(`${BASE_URL}${event.path}`);
            if (eventHtml) {
                const $$ = cheerio.load(eventHtml);
                const description = $$('.eventitem-description p').text().trim() || '';
                const venueName = $$('.event-meta-item--location a').text().trim();
                const venueRecordId = await findVenueRecordId(venueName);

                const eventData = {
                    'Event Name': event.name,
                    'Description': description,
                    'VenueText': venueName,
                    'Status': 'Approved'
                };

                if (venueRecordId) {
                    eventData['Venue'] = [venueRecordId];
                } else {
                    unlinkedCount++;
                    console.log(`Could not find a venue match for "${venueName}". Event will be created without a link.`);
                }
                
                await eventsTable.create([{ fields: eventData }]);
                newCount++;
            }
        }
        
        const summary = `Migration complete. Added ${newCount} new events. Skipped ${skippedCount} duplicates. ${unlinkedCount} events created without a venue link.`;
        console.log(summary);
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
