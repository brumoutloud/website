const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    try {
        let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

        const baseUrl = process.env.URL || 'https://www.brumoutloud.co.uk'; // Use Netlify URL or fallback

        // Add static pages
        const staticPages = [
            '/',
            '/all-venues.html',
            '/events.html',
            '/community.html',
            '/contact.html',
            '/promoter-tool.html',
            '/promoter-submit.html',
            '/get-listed.html'
        ];

        staticPages.forEach(page => {
            sitemap += `  <url>\n    <loc>${baseUrl}${page}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
        });

        // Add dynamic event pages
        const eventRecords = await base('Events').select({
            filterByFormula: "{Status} = 'Approved'",
            fields: ['Slug', 'Date']
        }).all();

        eventRecords.forEach(record => {
            const slug = record.fields.Slug;
            const lastMod = new Date(record.fields.Date).toISOString().split('T')[0]; // Use event date as lastmod
            sitemap += `  <url>\n    <loc>${baseUrl}/event/${slug}</loc>\n    <lastmod>${lastMod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.0</priority>\n  </url>\n`;
        });

        // Add dynamic venue pages
        const venueRecords = await base('Venues').select({
            filterByFormula: "{Listing Status} = 'Listed'",
            fields: ['Slug']
        }).all();

        venueRecords.forEach(record => {
            const slug = record.fields.Slug;
            sitemap += `  <url>\n    <loc>${baseUrl}/venue/${slug}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
        });

        sitemap += `</urlset>`;

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/xml',
            },
            body: sitemap,
        };
    } catch (error) {
        console.error('Error generating sitemap:', error);
        return {
            statusCode: 500,
            body: 'Error generating sitemap.',
        };
    }
};
