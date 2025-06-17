const Airtable = require('airtable');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

// --- CONFIGURATION ---
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');
const BASE_URL = 'https://brumoutloud.co.uk';

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        console.log("Fetching HTML from", BASE_URL);
        // Using a simple, fast fetch since the data is in the initial HTML
        const response = await fetch(BASE_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch page. Status: ${response.status}`);
        }
        const html = await response.text();
        const $ = cheerio.load(html);

        const eventsToCreate = [];
        let skippedCount = 0;

        // Using the precise selector based on the HTML you provided
        $('.eventlist-event').each((i, el) => {
            const element = $(el);
            const titleLink = element.find('.eventlist-title-link');
            
            const eventName = titleLink.text().trim();
            const eventUrl = BASE_URL + titleLink.attr('href');
            
            // Extracting other details
            const eventDateStr = element.find('time.event-date').attr('datetime');
            const eventTimeStr = element.find('time.event-time-localized-start').text().trim();
            const venueName = element.find('.eventlist-meta-address').clone().children().remove().end().text().trim();
            const category = element.find('.eventlist-cats a').text().trim();
            const imageUrl = element.find('.eventlist-column-thumbnail img').attr('data-src');

            if (eventName && eventDateStr && eventTimeStr) {
                const eventData = {
                    'Event Name': eventName,
                    'Date': `${eventDateStr}T${eventTimeStr}:00.000Z`,
                    'Description': `Imported from old site. See: ${eventUrl}`,
                    'VenueText': venueName,
                    'Category': category ? [category] : [],
                    'Status': 'Approved'
                };
                if(imageUrl) {
                    eventData['Promo Image'] = [{ url: imageUrl }];
                }
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

        // Airtable's API can only create 10 records at a time
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
