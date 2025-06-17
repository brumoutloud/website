const Airtable = require('airtable');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

// --- CONFIGURATION ---
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
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

// NEW: Function to scrape and upload events
async function scrapeAndUploadEvents() {
    console.log('--- Starting Event Scraping ---');
    // Events are on the homepage of the live site
    const html = await getPageHtml(BASE_URL);
    if (!html) {
        return { success: false, message: 'Could not fetch the main events page.' };
    }

    const $ = cheerio.load(html);
    const eventLinks = [];
    
    // **FIX:** Using a precise selector based on the classes you provided.
    // This looks for any element with the class 'eventlist-event' that is also a link (<a> tag).
    $('a.eventlist-event').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.startsWith('/event/')) {
            eventLinks.push(href);
        }
    });
    
    console.log(`Found ${eventLinks.length} event links.`);
    let newEvents = 0;

    for (const link of eventLinks) {
        const eventUrl = `${BASE_URL}${link}`;
        const eventHtml = await getPageHtml(eventUrl);
        if (eventHtml) {
            const $$ = cheerio.load(eventHtml);
            // Assuming the event detail page has a clear H1 for the title
            const eventName = $$('h1').text().trim();

            if (eventName) {
                const existingRecords = await eventsTable.select({ filterByFormula: `{Event Name} = "${eventName}"` }).firstPage();
                if (existingRecords.length === 0) {
                     const eventData = {
                        'Event Name': eventName,
                        'Description': $$('meta[name=description]').attr('content') || '',
                        'Status': 'Approved',
                    };
                    await eventsTable.create([{ fields: eventData }]);
                    newEvents++;
                    console.log(`Inserted new event: ${eventName}`);
                } else {
                    console.log(`Skipping existing event: ${eventName}`);
                }
            }
        }
    }
    return { success: true, newRecords: newEvents, type: 'Events' };
}


// --- Main Handler ---
exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // Focusing only on events as requested.
        const eventResult = await scrapeAndUploadEvents();
        
        const summary = `Migration complete. Added ${eventResult.newRecords} new events.`;

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
