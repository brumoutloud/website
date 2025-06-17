const Airtable = require('airtable');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

// --- CONFIGURATION ---
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');
const BASE_URL = 'https://brumoutloud.co.uk';

// **IMPORTANT**: These selectors must be updated to match the live site's HTML.
// To find the correct selector: Right-click on an event card on the live site -> Inspect -> Find the <a> tag that links to the event detail page.
const EVENT_LINK_SELECTOR = '.eventlist-event a'; 

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

async function scrapeAndUploadEvents() {
    console.log('--- Starting Event Scraping ---');
    const html = await getPageHtml(BASE_URL);
    if (!html) {
        return { success: false, message: 'Could not fetch the main events page.' };
    }

    const $ = cheerio.load(html);
    const eventLinks = [];
    
    // **FIX:** Using a more robust selector. This looks for an <a> tag *inside* an element with the class 'eventlist-event'.
    $(EVENT_LINK_SELECTOR).each((i, el) => {
        const href = $(el).attr('href');
        // Ensure we only get valid, unique event links
        if (href && href.startsWith('/event/') && !eventLinks.includes(href)) {
            eventLinks.push(href);
        }
    });
    
    console.log(`Found ${eventLinks.length} unique event links using selector "${EVENT_LINK_SELECTOR}".`);
    let newEvents = 0;

    for (const link of eventLinks) {
        const eventUrl = `${BASE_URL}${link}`;
        const eventHtml = await getPageHtml(eventUrl);
        if (eventHtml) {
            const $$ = cheerio.load(eventHtml);
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

