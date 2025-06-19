const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');
const cloudinary = require('cloudinary').v2;

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper function to upload an image to Cloudinary
async function uploadImage(file, folder) {
    if (!file) return null;
    try {
        const base64String = file.content.toString('base64');
        const dataUri = `data:${file.contentType};base64,${base64String}`;
        
        const result = await cloudinary.uploader.upload(dataUri, {
            folder: folder,
            // Eager transformations for venues
            eager: folder === 'brumoutloud_venues' ? [
                { width: 800, height: 600, crop: 'fill', gravity: 'auto', fetch_format: 'auto', quality: 'auto' },
                { width: 400, height: 400, crop: 'fill', gravity: 'auto', fetch_format: 'auto', quality: 'auto' }
            ] : []
        });
        
        return result;
    } catch (error) {
        console.error("!!! Cloudinary Upload Error:", error);
        throw error;
    }
}

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    try {
        const result = await parser.parse(event);
        const { id, type } = result;

        if (!id || !type) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Missing required ID or Type.' }) };
        }

        const table = type === 'Event' ? base('Events') : base('Venues');
        let fieldsToUpdate = { ...result };
        
        // Remove non-Airtable fields from the update object
        delete fieldsToUpdate.id;
        delete fieldsToUpdate.type;
        delete fieldsToUpdate.files;

        // Handle file upload if a new file is present
        const imageFile = result.files.length > 0 ? result.files[0] : null;
        if (imageFile && imageFile.content.length > 0) {
            if (type === 'Event') {
                const uploadedImage = await uploadImage(imageFile, 'brumoutloud_events');
                fieldsToUpdate['Promo Image'] = [{ url: uploadedImage.secure_url }];
            } else { // Venue
                const uploadedImage = await uploadImage(imageFile, 'brumoutloud_venues');
                fieldsToUpdate['Photo'] = [{ url: uploadedImage.secure_url }];
                fieldsToUpdate['Photo URL'] = uploadedImage.secure_url;
                fieldsToUpdate['Photo Medium URL'] = uploadedImage.eager[0].secure_url;
                fieldsToUpdate['Photo Thumbnail URL'] = uploadedImage.eager[1].secure_url;
            }
        }
        
        // Handle Event-specific field transformations
        if (type === 'Event') {
            // Combine date and time into a single Airtable datetime field
            if (fieldsToUpdate.date) {
                fieldsToUpdate['Date'] = `${fieldsToUpdate.date}T${fieldsToUpdate.time || '00:00'}:00.000Z`;
                delete fieldsToUpdate.date;
                delete fieldsToUpdate.time;
            }
            // Convert comma-separated categories string into an array
            if (typeof fieldsToUpdate.Category === 'string') {
                fieldsToUpdate.Category = fieldsToUpdate.Category.split(',').map(s => s.trim()).filter(Boolean);
            }
        }
        
        await table.update(id, fieldsToUpdate);

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `Record ${id} updated successfully.` }),
        };

    } catch (error) {
        console.error("Error updating submission:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
