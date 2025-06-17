const fetch = require('node-fetch');

// This function uses a scraper API to get the fully rendered HTML of a page.
// You can use a service like ScraperAPI or Browserless for this.
async function getRenderedHtml(url) {
    const scraperApiKey = process.env.SCRAPER_API_KEY;
    if (!scraperApiKey) throw new Error("SCRAPER_API_KEY environment variable not set.");
    
    const scraperUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(url)}&render=true`;
    const response = await fetch(scraperUrl, { timeout: 25000 });
    if (!response.ok) throw new Error(`Scraper API failed with status ${response.status}`);
    return await response.text();
}


async function parseUrlsFromHtmlWithAI(html) {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) throw new Error("GEMINI_API_KEY environment variable not set.");

    const prompt = `From the following HTML, extract the href attribute from every link that points to an event detail page. Return the data as a JSON array of strings. For example: ["/event/slug-1", "/event/slug-2"]. HTML: ${html}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Gemini API request failed with status ${response.status}`);
    const result = await response.json();
    const textResponse = result.candidates[0].content.parts[0].text;
    const jsonString = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonString);
}


exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const renderedHtml = await getRenderedHtml('https://brumoutloud.co.uk');
        const eventUrls = await parseUrlsFromHtmlWithAI(renderedHtml);
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
