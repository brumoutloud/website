const fetch = require('node-fetch');
const cheerio = require('cheerio');

const BASE_URL = 'https://brumoutloud.co.uk';

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const response = await fetch(BASE_URL);
        if (!response.ok) throw new Error(`Failed to fetch page. Status: ${response.status}`);
        
        const html = await response.text();
        const $ = cheerio.load(html);
        const eventUrls = [];

        $('.eventlist-event .eventlist-title-link').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.startsWith('/')) {
                eventUrls.push(href);
            }
        });

        console.log(`Found ${eventUrls.length} event URLs.`);
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, urls: eventUrls }),
        };
    } catch (error) {
        console.error("Error getting event URLs:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
