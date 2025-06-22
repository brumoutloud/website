const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');
const fetch = require('node-fetch');
const cloudinary = require('cloudinary').v2;

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function createUnlistedVenue(name, address) {
    const newRecords = await base('Venues').create([{ 
        fields: {
            "Name": name,
            "Address": address,
            "Status": "Approved",
            "Listing Status": "Unlisted",
            "Vibe Tags": [],
            "Venue Features": [],
            "Accessibility Features": []
        }
    }]);
    if (!newRecords || newRecords.length === 0) {
        throw new Error("Airtable did not return the created record for the new venue.");
    }
    return newRecords[0].id;
}


exports.handler = async function (event, context) {
    try {
        const submission = await parser.parse(event);
        
        let venueId = submission.venueId;
        if (venueId === '__CREATE_NEW__') {
            venueId = await createUnlistedVenue(submission['new-venue-name'], submission['new-venue-address']);
        }

        const combinedDateTime = new Date(`${submission.date}T${submission.time || '00:00'}`).toISOString();

        const fields = {
            'Event Name': submission['Event Name'],
            'Description': submission.Description,
            'Date': combinedDateTime,
            'Status': 'Approved',
            'Link': submission.Link
        };

        if (venueId && venueId.startsWith('rec')) {
            fields['Venue'] = [venueId];
        }

        const categories = submission.Category;
        if (categories) {
            fields['Category'] = Array.isArray(categories) ? categories : [categories];
        }
        
        // This function does not handle image uploads when adding from admin
        // It's a simple add form for now.

        await base('Events').create([{ fields }]);
        
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `Successfully created event.` }),
        };

    } catch (error) {
        console.error("Error creating approved event:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
