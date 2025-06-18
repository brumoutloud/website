const Airtable = require('airtable');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');
const venuesTable = base('Venues'); // Keep this for linking

// Helper function to find a venue's Record ID
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

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { eventUrl } = JSON.parse(event.body);
        if (!eventUrl) return { statusCode: 400, body: JSON.stringify({ message: "eventUrl not provided." }) };

        const response = await fetch(eventUrl);
        if (!response.ok) {
             return { statusCode: 200, body: JSON.stringify({ success: false, status: 'fetch_failed', message: `Failed to fetch ${eventUrl}` }) };
        }
        const html = await response.text();
        const $ = cheerio.load(html);

        // Use more specific selectors based on the live site's structure
        const eventName = $('h1.eventitem-title').text().trim();

        if (eventName) {
            const existingRecords = await eventsTable.select({ filterByFormula: `{Event Name} = "${eventName.replace(/"/g, '\\"')}"` }).firstPage();
            if (existingRecords.length === 0) {
                 // **FIX:** Using more precise selectors for description and venue
                 const description = $('.eventitem-description .sqs-block-html .sqs-html-content').text().trim() || '';
                 const venueName = $('.event-meta-item--location a').text().trim();
                 const venueRecordId = await findVenueRecordId(venueName);

                 const eventData = {
                    'Event Name': eventName,
                    'Description': description,
                    'VenueText': venueName,
                    'Status': 'Approved'
                };
                
                if (venueRecordId) {
                    eventData['Venue'] = [venueRecordId];
                }

                await eventsTable.create([{ fields: eventData }]);
                return { statusCode: 200, body: JSON.stringify({ success: true, status: 'created', name: eventName }) };
            } else {
                return { statusCode: 200, body: JSON.stringify({ success: true, status: 'skipped', name: eventName }) };
            }
        }
        return { statusCode: 200, body: JSON.stringify({ success: false, status: 'no_name_found' }) };

    } catch (error) {
        console.error("Error processing single event:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
