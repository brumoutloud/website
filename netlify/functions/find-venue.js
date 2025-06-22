const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    const { name } = event.queryStringParameters;

    if (!name) {
        return { statusCode: 400, body: "Venue name is required." };
    }

    try {
        const existingVenues = await base('Venues').select({
            maxRecords: 1,
            filterByFormula: `LOWER({Name}) = LOWER("${name.replace(/"/g, '\\"')}")`
        }).firstPage();

        let redirectUrl;
        if (existingVenues.length > 0) {
            // Venue found, redirect with its ID
            const venueId = existingVenues[0].id;
            redirectUrl = `/event-details-form.html?venueId=${venueId}`;
        } else {
            // Venue not found, redirect with the new name
            redirectUrl = `/event-details-form.html?newVenueName=${encodeURIComponent(name)}`;
        }
        
        return {
            statusCode: 302, // 302 is the code for a temporary redirect
            headers: {
                'Location': redirectUrl
            }
        };

    } catch (error) {
        console.error("Error in find-venue function:", error);
        return { statusCode: 500, body: "Server error." };
    }
};
