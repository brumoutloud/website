const Airtable = require('airtable');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');
const BASE_URL = 'https://brumoutloud.co.uk';


exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { eventUrl } = JSON.parse(event.body);
        if (!eventUrl) return { statusCode: 400, body: JSON.stringify({ message: "eventUrl not provided." }) };

        // For individual pages, we don't need the headless browser, just the HTML.
        const response = await fetch(eventUrl);
        const html = await response.text();
        const $ = cheerio.load(html);

        const eventName = $('h1').first().text().trim();
        const description = $('meta[name=description]').attr('content') || '';

        if (eventName) {
            const existingRecords = await eventsTable.select({ filterByFormula: `{Event Name} = "${eventName.replace(/"/g, '\\"')}"` }).firstPage();
            if (existingRecords.length === 0) {
                await eventsTable.create([{
                    fields: {
                        'Event Name': eventName,
                        'Description': description,
                        'Status': 'Approved'
                    }
                }]);
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
