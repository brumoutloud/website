const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const venuesTable = base('Venues');

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { venueName, address } = JSON.parse(event.body);

        if (!venueName || !address) {
            return { 
                statusCode: 400, 
                body: JSON.stringify({ success: false, message: 'Venue Name and Address are required.' }) 
            };
        }

        const newRecords = await venuesTable.create([{ 
            fields: {
                "Name": venueName,
                "Address": address,
                "Status": "Approved", // It's an approved venue, just not listed publicly
                "Listing Status": "Unlisted" // Explicitly set the listing status
            }
        }]);

        if (!newRecords || newRecords.length === 0) {
            throw new Error("Airtable did not return the created record.");
        }

        const newVenueId = newRecords[0].id;

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, id: newVenueId }),
        };

    } catch (error) {
        console.error("Error creating unlisted venue:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
