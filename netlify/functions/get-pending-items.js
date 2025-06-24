// netlify/functions/get-pending-items.js
const Airtable = require('airtable');

const AIRTABLE_PERSONAL_ACCESS_TOKEN = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const base = new Airtable({ apiKey: AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(AIRTABLE_BASE_ID);

async function fetchAllPendingRecords(tableName, fields) {
    console.log(`[${tableName}] Starting paginated fetch for records with status 'Pending Review'.`);
    const allRecords = [];
    let pageCount = 0;
    try {
        await base(tableName).select({
            filterByFormula: "{Status} = 'Pending Review'", // Using 'Pending Review' as per your existing code
            fields: fields
        }).eachPage((records, fetchNextPage) => {
            pageCount++;
            console.log(`[${tableName}] Fetched page ${pageCount} with ${records.length} records.`);
            records.forEach(record => allRecords.push(record));
            fetchNextPage();
        });
        console.log(`[${tableName}] Finished paginated fetch. Total pages: ${pageCount}. Total records found: ${allRecords.length}`);
        return allRecords;
    } catch (error) {
        console.error(`[${tableName}] Error during Airtable 'eachPage' call:`, error);
        throw error;
    }
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        let allPendingItems = [];

        // --- Fetch Pending Events (incorporating your existing fields and email remapping) ---
        const eventRecords = await fetchAllPendingRecords('Events', [
            'Event Name', 'Description', 'VenueText', 'Venue', 'Submitter Email', 'Date',
            'Link', 'Recurring Info', 'Category', 'Promo Image', 'Parent Event Name'
        ]);

        const formattedEvents = eventRecords.map(record => {
            const newFields = { ...record.fields };

            // Remap 'Submitter Email' to 'Contact Email' as expected by frontend
            if (newFields['Submitter Email']) {
                newFields['Contact Email'] = newFields['Submitter Email'];
                delete newFields['Submitter Email'];
            }
            
            // Add 'Type' field
            newFields.Type = 'Event'; // Crucial for frontend logic

            return {
                id: record.id,
                fields: newFields
            };
        });
        allPendingItems = allPendingItems.concat(formattedEvents);

        // --- Fetch Pending Venues ---
        // Corrected 'Photo' field as per your Airtable schema
        const venueRecords = await fetchAllPendingRecords('Venues', [
            'Name', 'Address', 'Website', 'Description', 'Photo', 'Listing Status', 'Contact Email' // Changed 'Logo' to 'Photo'
            // Add any other relevant Venue fields you want to display/edit
        ]);

        const formattedVenues = venueRecords.map(record => {
            const newFields = { ...record.fields };
            
            // Add 'Type' field
            newFields.Type = 'Venue'; // Crucial for frontend logic

            return {
                id: record.id,
                fields: newFields
            };
        });
        allPendingItems = allPendingItems.concat(formattedVenues);

        // Sort items by 'Date' for events and by 'Created Time' for venues if available,
        // or just by 'id' if no specific date/time field across both types for pending items.
        allPendingItems.sort((a, b) => {
            const dateA = a.fields['Created Time'] ? new Date(a.fields['Created Time']) : (a.fields['Date'] ? new Date(a.fields['Date']) : new Date(0));
            const dateB = b.fields['Created Time'] ? new Date(b.fields['Created Time']) : (b.fields['Date'] ? new Date(b.fields['Date']) : new Date(0));
            return dateA - dateB; // Sort oldest first
        });


        return {
            statusCode: 200,
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0',
                'Pragma': 'no-cache',
                'Expires': '0',
                'Content-Type': 'application/json' // Explicitly set content type
            },
            body: JSON.stringify(allPendingItems),
        };
    } catch (error) {
        console.error("Critical error in get-pending-items handler:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch pending items', details: error.toString() }),
        };
    }
};
