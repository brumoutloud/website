// netlify/functions/get-venues.js
const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    try {
        const records = await base('Venues')
            .select({
                filterByFormula: "AND({Status} = 'Approved', {Listing Status} = 'Listed')",
                fields: [
                    'Name',
                    'Description',
                    'Slug',
                    'Photo URL',
                    'Photo Medium URL',
                    'Photo Thumbnail URL',
                    'Address',
                    'Opening Hours',
                    'Accessibility',
                    'Website',
                    'Instagram',
                    'Facebook',
                    'TikTok',
                    'Contact Email',
                    'Contact Phone',
                    'Accessibility Rating',
                    'Accessibility Features',
                    'Parking Exception',
                    'Vibe Tags',
                    'Venue Features',
                    'Google Rating' // NEW: Fetch Google Rating
                ],
                maxRecords: 100,
            })
            .all();

        const venues = records.map((record) => {
            return {
                id: record.id,
                name: record.get('Name'),
                description: record.get('Description'),
                slug: record.get('Slug') || '',
                photo: {
                    original: record.get('Photo URL') || null,
                    medium: record.get('Photo Medium URL') || null,
                    thumbnail: record.get('Photo Thumbnail URL') || null,
                },
                address: record.get('Address') || '',
                openingHours: record.get('Opening Hours') || '',
                accessibility: record.get('Accessibility') || '',
                website: record.get('Website') || '',
                instagram: record.get('Instagram') || '',
                facebook: record.get('Facebook') || '',
                tiktok: record.get('TikTok') || '',
                contactEmail: record.get('Contact Email') || '',
                contactPhone: record.get('Contact Phone') || '',
                accessibilityRating: record.get('Accessibility Rating') || '',
                parkingException: record.get('Parking Exception') || '',
                vibeTags: record.get('Vibe Tags') || [],
                venueFeatures: record.get('Venue Features') || [],
                accessibilityFeatures: record.get('Accessibility Features') || [],
                googleRating: record.get('Google Rating') || 0, // NEW: Include Google Rating, default to 0
            };
        });

        return {
            statusCode: 200,
            body: JSON.stringify(venues),
        };
    } catch (error) {
        console.error('Error fetching venues within handler:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch venues' }),
        };
    }
};
