const Airtable = require('airtable');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

// --- CONFIGURATION ---
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');
const BASE_URL = 'https://brumoutloud.co.uk';

// This function uses a scraper API to get the fully rendered HTML of a page.
async function getRenderedHtml(url) {
    const scraperApiKey = process.env.SCRAPER_API_KEY;
    if (!scraperApiKey) throw new Error("SCRAPER_API_KEY environment variable not set.");
    
    // Using a headless browser is necessary because the events are loaded with JavaScript.
    const scraperUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(url)}&render=true`;
    console.log("Fetching rendered HTML...");
    const response = await fetch(scraperUrl, { timeout: 25000 }); // Increased timeout
    if (!response.ok) throw new Error(`Scraper API failed with status ${response.status}`);
    console.log("Rendered HTML fetched successfully.");
    return await response.text();
}


exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const html = await getRenderedHtml(BASE_URL);
        const $ = cheerio.load(html);

        const eventsToCreate = [];
        let skippedCount = 0;

        // Using the precise selector based on the HTML you provided
        $('.eventlist-event').each((i, el) => {
            const element = $(el);
            const eventName = element.find('.eventlist-title-link').text().trim();
            const eventDateStr = element.find('time.event-date').attr('datetime');
            const eventTimeStr = element.find('time.event-time-localized-start').text().trim();

            if (eventName && eventDateStr && eventTimeStr) {
                const eventData = {
                    'Event Name': eventName,
                    'Date': `${eventDateStr}T${eventTimeStr}:00.000Z`,
                    'Description': element.find('.eventlist-description').text().trim() || `Details for ${eventName}`,
                    'VenueText': element.find('.eventlist-meta-address').clone().children().remove().end().text().trim(),
                    'Category': [element.find('.eventlist-cats a').text().trim()],
                    'Status': 'Approved'
                };
                eventsToCreate.push(eventData);
            }
        });
        
        console.log(`Scraped ${eventsToCreate.length} events from the page.`);
        let newEventsCount = 0;

        // Check for duplicates and prepare records for insertion
        const recordsToInsert = [];
        for(const eventData of eventsToCreate) {
             const existingRecords = await eventsTable.select({ filterByFormula: `{Event Name} = "${eventData['Event Name'].replace(/"/g, '\\"')}"` }).firstPage();
             if(existingRecords.length === 0) {
                recordsToInsert.push({ fields: eventData });
             } else {
                skippedCount++;
             }
        }
        
        console.log(`Found ${recordsToInsert.length} new events to add. Skipped ${skippedCount} existing events.`);

        // Airtable's API can only create 10 records at a time, so we process in chunks
        const chunkSize = 10;
        for (let i = 0; i < recordsToInsert.length; i += chunkSize) {
            const chunk = recordsToInsert.slice(i, i + chunkSize);
            await eventsTable.create(chunk);
            newEventsCount += chunk.length;
        }

        const summary = `Migration complete. Added ${newEventsCount} new events. Skipped ${skippedCount} duplicates.`;
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
