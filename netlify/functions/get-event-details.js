const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');

exports.handler = async function (event, context) {
    const { id } = event.queryStringParameters;

    if (!id) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Event ID is required' }) };
    }

    try {
        const record = await eventsTable.find(id);
        
        // This will fetch the linked venue record and include its fields
        const venueId = record.get('Venue') ? record.get('Venue')[0] : null;
        let venueData = {
            venueName: record.get('Venue Name (from Venue)'),
            venueId: venueId,
            venueListingStatus: 'Unlisted' // Default to Unlisted
        };

        if (venueId) {
            const venueRecord = await base('Venues').find(venueId);
            venueData.venueName = venueRecord.get('Name');
            // Ensure we fetch and return the Listing Status
            venueData.venueListingStatus = venueRecord.get('Listing Status') || 'Unlisted'; 
        }

        const eventDetails = {
            id: record.id,
            name: record.get('Event Name'),
            date: record.get('Date'),
            startTime: record.get('Start Time'),
            description: record.get('Description'),
            ticketLink: record.get('Ticket Link'),
            recurringInfo: record.get('Recurring Info'),
            imageUrl: record.get('Promo Image') ? record.get('Promo Image')[0].url : null,
            ...venueData
        };

        return {
            statusCode: 200,
            body: JSON.stringify(eventDetails),
        };
    } catch (error) {
        console.error("Error fetching event details:", error);
        if (error.statusCode === 404) {
             return { statusCode: 404, body: JSON.stringify({ error: 'Event not found' }) };
        }
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch event details' }),
        };
    }
};
