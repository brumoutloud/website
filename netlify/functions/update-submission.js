const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');
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
        // Note: Using lambda-multipart-parser for consistency with other functions
        const submission = await parser.parse(event);
        const { id, type } = submission;

        if (!id || !type) {
            return { statusCode: 400, body: 'Missing ID or submission type.' };
        }

        const table = base(type === 'Event' ? 'Events' : 'Venues');
        let fieldsToUpdate = {};

        if (type === 'Event') {
            let venueId = submission.venueId;
            if (venueId === '__CREATE_NEW__') {
                venueId = await createUnlistedVenue(submission['new-venue-name'], submission['new-venue-address']);
            }

            if (venueId && venueId.startsWith('rec')) {
                fieldsToUpdate['Venue'] = [venueId];
                fieldsToUpdate['VenueText'] = null; // Clear old text field
            } else {
                fieldsToUpdate['Venue'] = []; // Unlink venue
            }

            const combinedDateTime = new Date(`${submission.date}T${submission.time || '00:00'}`).toISOString();

            fieldsToUpdate['Event Name'] = submission['Event Name'];
            fieldsToUpdate['Date'] = combinedDateTime;
            fieldsToUpdate['Description'] = submission['Description'];
            fieldsToUpdate['Link'] = submission['Link'];
            fieldsToUpdate['Parent Event Name'] = submission['Parent Event Name'];
            
            if (submission.Category) {
                fieldsToUpdate['Category'] = Array.isArray(submission.Category) ? submission.Category : [submission.Category];
            } else {
                fieldsToUpdate['Category'] = [];
            }

        } else if (type === 'Venue') {
            // --- THIS SECTION IS NOW COMPLETE ---
            fieldsToUpdate = {
                'Name': submission.Name,
                'Address': submission.Address,
                'Description': submission.Description,
                'Opening Hours': submission['Opening Hours'],
                'Accessibility': submission.Accessibility,
                'Website': submission.Website,
                'Instagram': submission.Instagram,
                'Facebook': submission.Facebook,
                'TikTok': submission.TikTok,
                'X (Twitter)': submission['X (Twitter)'],
                'Contact Email': submission['Contact Email'],
                'Contact Phone': submission['Contact Phone'],
                'Parking Exception': submission['Parking Exception'],
                'Accessibility Rating': submission['Accessibility Rating'],
                 // Handle multi-selects, ensuring they are arrays
                'Vibe Tags': Array.isArray(submission['Vibe Tags']) ? submission['Vibe Tags'] : (submission['Vibe Tags'] ? [submission['Vibe Tags']] : []),
                'Venue Features': Array.isArray(submission['Venue Features']) ? submission['Venue Features'] : (submission['Venue Features'] ? [submission['Venue Features']] : []),
                'Accessibility Features': Array.isArray(submission['Accessibility Features']) ? submission['Accessibility Features'] : (submission['Accessibility Features'] ? [submission['Accessibility Features']] : []),
            };
        }

        // Remove undefined fields before updating to avoid clearing existing data
        Object.keys(fieldsToUpdate).forEach(key => {
            if (fieldsToUpdate[key] === undefined) {
                delete fieldsToUpdate[key];
            }
        });
        
        await table.update([{ "id": id, "fields": fieldsToUpdate }]);

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `${type} with ID ${id} updated successfully.` }),
        };

    } catch (error) {
        console.error("Error in update-submission:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
