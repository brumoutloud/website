const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const eventsTable = base('Events');

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        console.log("Starting description cleanup...");
        const recordsToUpdate = [];
        
        // Fetch all event records that might contain the bad text
        const records = await eventsTable.select({
            fields: ["Description"] // Only fetch the field we need to check
        }).all();

        records.forEach(record => {
            const description = record.get("Description");
            // Check if the description contains the known footer text
            if (description && description.includes("hello@brumoutloud.co.uk")) {
                // Remove the footer text and any trailing whitespace
                const cleanedDescription = description.split("hello@brumoutloud.co.uk")[0].trim();
                recordsToUpdate.push({
                    id: record.id,
                    fields: {
                        "Description": cleanedDescription
                    }
                });
            }
        });
        
        console.log(`Found ${recordsToUpdate.length} records to clean.`);

        // Airtable's update API can only handle 10 records at a time
        const chunkSize = 10;
        for (let i = 0; i < recordsToUpdate.length; i += chunkSize) {
            const chunk = recordsToUpdate.slice(i, i + chunkSize);
            await eventsTable.update(chunk);
        }

        const summary = `Cleanup complete. Updated ${recordsToUpdate.length} event descriptions.`;
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: summary }),
        };

    } catch (error) {
        console.error("Cleanup Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
