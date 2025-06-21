const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');
const cloudinary = require('cloudinary').v2;
const fetch = require('node-fetch');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK for Firestore access (e.g., to get Gemini model name)
try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle newline characters in private key
            }),
        });
    }
} catch (error) {
    console.error("Firebase Admin Initialization Error:", error);
}
const db = admin.firestore();

/**
 * Fetches the Gemini model name from Firestore settings.
 * @returns {string} The Gemini model name or a default.
 */
async function getGeminiModelName() {
    try {
        const doc = await db.collection('settings').doc('gemini').get();
        if (doc.exists && doc.data().modelName) {
            return doc.data().modelName;
        }
    } catch (error) {
        console.error("Error fetching Gemini model from Firestore:", error);
    }
    return 'gemini-2.5-flash'; // Default model if not found or error
}

// Initialize Airtable base
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Uses a generative AI model (Gemini) to predict recurring dates based on a start date and recurrence info.
 * @param {string} startDate - The start date in YYYY-MM-DD format.
 * @param {string} recurringInfo - Natural language description of recurrence (e.g., "every Monday", "first Sunday of month").
 * @param {string} modelName - The name of the Gemini model to use.
 * @returns {Array<string>} A list of predicted dates in YYYY-MM-DD format.
 */
async function getDatesFromAI(startDate, recurringInfo, modelName) {
    console.log(`[getDatesFromAI] INPUT - startDate: "${startDate}", recurringInfo: "${recurringInfo}"`);
    
    if (!GEMINI_API_KEY) {
        console.warn("[getDatesFromAI] GEMINI_API_KEY is not set. Returning only the start date.");
        return [startDate];
    }
    const prompt = `Based on a start date of ${startDate} and the recurrence rule "${recurringInfo}", provide a comma-separated list of all dates for the next 3 months in format YYYY-MM-DD. IMPORTANT: Only return the comma-separated list of dates and nothing else.`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
    
    try {
        const response = await fetch(apiUrl, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        if (!response.ok) {
            console.error(`[getDatesFromAI] AI request failed with status: ${response.status} - ${response.statusText}`);
            const errorBody = await response.text();
            console.error(`[getDatesFromAI] AI Error Body: ${errorBody}`);
            return [startDate]; // Fallback to start date on API error
        }
        const result = await response.json();
        const textResponse = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        console.log(`[getDatesFromAI] RAW AI RESPONSE: "${textResponse}"`);
        
        if (!textResponse) {
            console.log("[getDatesFromAI] AI returned no text response. Falling back to start date.");
            return [startDate];
        }

        // Use a more robust regex to capture dates
        const dateRegex = /\d{4}-\d{2}-\d{2}/g;
        const dates = textResponse.match(dateRegex);

        const finalDates = dates && dates.length > 0 ? dates : [startDate];
        console.log(`[getDatesFromAI] PARSED DATES:`, finalDates);

        return finalDates;
    } catch (error) {
        console.error("[getDatesFromAI] Error calling AI for dates:", error);
        return [startDate]; // Fallback to start date on network/parsing error
    }
}

/**
 * Uploads an image file to Cloudinary.
 * @param {object} file - The file object from lambda-multipart-parser.
 * @param {string} folder - The Cloudinary folder to upload to.
 * @returns {object} The Cloudinary upload result.
 */
async function uploadImage(file, folder) {
    if (!file || file.content.length === 0) {
        console.log(`No file content provided for upload in folder: ${folder}`);
        return null;
    }
    try {
        const base64String = file.content.toString('base64');
        const dataUri = `data:${file.contentType};base64,${base64String}`;
        console.log(`Uploading image to Cloudinary folder: ${folder}`);
        const result = await cloudinary.uploader.upload(dataUri, {
            folder: folder,
            // Eager transformations for venues to create different sized versions
            eager: folder === 'brumoutloud_venues' ? [
                { width: 800, height: 600, crop: 'fill', gravity: 'auto', fetch_format: 'auto', quality: 'auto' }, // Medium
                { width: 400, height: 400, crop: 'fill', gravity: 'auto', fetch_format: 'auto', quality: 'auto' }  // Thumbnail
            ] : []
        });
        console.log(`Cloudinary upload successful. Public ID: ${result.public_id}`);
        return result;
    } catch (error) {
        console.error("!!! Cloudinary Upload Error:", error);
        throw error;
    }
}

/**
 * Helper to ensure a value is always an array, suitable for Airtable multi-select fields.
 * @param {*} value - The input value.
 * @returns {Array} An array version of the value.
 */
const toArray = (value) => {
    if (value === undefined || value === null || value === '') return []; // Treat empty string as empty array
    return Array.isArray(value) ? value : [value];
};


exports.handler = async function (event, context) {
    // Get Gemini model name from Firestore settings
    const geminiModel = await getGeminiModelName();

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    try {
        // Parse multipart form data (handles files and fields)
        const result = await parser.parse(event);
        const { id, type, 'Recurring Info': recurringInfo } = result;

        // Basic validation for ID and Type
        if (!id || !type) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Missing required ID or Type.' }) };
        }

        // Determine the Airtable table based on the 'type'
        const table = type === 'Event' ? base('Events') : base('Venues');
        console.log(`Processing update for type: ${type}, ID: ${id}`);

        // --- Logic for Recurring Events ---
        if (type === 'Event' && recurringInfo && recurringInfo.trim() !== '') {
            console.log(`Regenerating recurring series for event ID: ${id}`);
            const originalRecord = await table.find(id);
            // Combine original record fields with new form data
            const combinedData = { ...originalRecord.fields, ...result };
            
            // Handle promo image upload for recurring events
            const imageFile = result.files.find(f => f.fieldname === 'promoImage');
            if (imageFile && imageFile.content.length > 0) {
                const uploadedImage = await uploadImage(imageFile, 'brumoutloud_events');
                combinedData['Promo Image'] = [{ url: uploadedImage.secure_url }];
            } else if (originalRecord.fields['Promo Image'] && originalRecord.fields['Promo Image'].length > 0) {
                // If no new image, but existing image, retain the existing one
                combinedData['Promo Image'] = originalRecord.fields['Promo Image'];
            } else {
                delete combinedData['Promo Image']; // No image present or provided
            }

            // Get all recurring dates from AI
            const datesToCreate = await getDatesFromAI(result.date, recurringInfo, geminiModel);
            
            // Prepare records for creation (new series)
            const recordsToCreate = datesToCreate.map((date, index) => {
                let fields = { ...combinedData };
                // Format date correctly for Airtable datetime field
                fields.Date = `${date}T${result.time || '00:00'}:00.000Z`;
                // Only the first event in the series keeps the recurring info
                fields['Recurring Info'] = index === 0 ? recurringInfo : '';
                fields.Status = 'Approved'; // New recurring events are approved
                
                // Ensure Category is an array
                if (result.Category) {
                    fields.Category = toArray(result.Category);
                }

                // Remove fields that should not be directly copied or are handled separately
                const autoGeneratedFields = ['id', 'Slug', 'Created', 'Venue Name', 'Venue Slug', 'files', 'date', 'time', 'Contact Email', 'promoImage', 'photo', 'type'];
                autoGeneratedFields.forEach(f => delete fields[f]);

                return { fields };
            });
            
            // Archive the original recurring event record
            await table.update(id, { "Status": "Archived", "Recurring Info": "" }); // Clear recurring info on archived record

            // Create new records in chunks (Airtable API limit)
            const chunkSize = 10;
            for (let i = 0; i < recordsToCreate.length; i += chunkSize) {
                await table.create(recordsToCreate.slice(i, i + chunkSize));
            }
            return { statusCode: 200, body: JSON.stringify({ success: true, message: `Successfully regenerated recurring series for ${combinedData['Event Name']}. The original event has been archived.` }) };

        } 
        // --- Logic for Venue Updates ---
        else if (type === 'Venue') {
            console.log(`Processing venue update for ID: ${id}`);
            const fieldsToUpdate = {};
            // Define allowed text fields for venues
            const allowedTextFields = ['Name', 'Description', 'Address', 'Opening Hours', 'Accessibility', 'Website', 'Instagram', 'Facebook', 'TikTok', 'Contact Email', 'Contact Phone', 'Parking Exception'];
            
            // Populate text fields from form submission
            allowedTextFields.forEach(field => {
                if (result[field] !== undefined) {
                    fieldsToUpdate[field] = result[field];
                }
            });

            // Handle checkbox/array fields, ensuring they are always arrays
            fieldsToUpdate['Vibe Tags'] = toArray(result['Vibe Tags']);
            fieldsToUpdate['Venue Features'] = toArray(result['Venue Features']);
            fieldsToUpdate['Accessibility Features'] = toArray(result['Accessibility Features']);
            
            // Handle select field for Accessibility Rating
            if (result['Accessibility Rating'] !== undefined) {
                fieldsToUpdate['Accessibility Rating'] = result['Accessibility Rating'];
            }

            // Handle photo upload for venues
            const photoFile = result.files.find(f => f.fieldname === 'photo');
            if (photoFile && photoFile.content.length > 0) {
                console.log("New photo file detected for venue. Uploading to Cloudinary...");
                const uploadedImage = await uploadImage(photoFile, 'brumoutloud_venues');
                // Update specific URL fields for easy access
                fieldsToUpdate['Photo URL'] = uploadedImage.secure_url;
                fieldsToUpdate['Photo Medium URL'] = uploadedImage.eager[0]?.secure_url; // Use optional chaining
                fieldsToUpdate['Photo Thumbnail URL'] = uploadedImage.eager[1]?.secure_url; // Use optional chaining
                // Update the Airtable attachment field
                fieldsToUpdate['Photo'] = [{ url: uploadedImage.secure_url }]; 
            } else {
                console.log("No new photo file provided for venue. Retaining existing photo if any.");
                // If no new photo is submitted, we do NOT change the existing 'Photo' field.
                // We assume the frontend did not send the 'photo' field if no new photo was selected.
                // If the user explicitly wants to *remove* a photo, a separate mechanism would be needed.
            }

            console.log("Attempting to update Airtable Venue with these fields:", JSON.stringify(fieldsToUpdate, null, 2));
            await table.update(id, fieldsToUpdate); // Update the Airtable record
            return { statusCode: 200, body: JSON.stringify({ success: true, message: `Record ${id} updated successfully.` }) };

        } 
        // --- Existing Logic for Single Event Update (non-recurring) ---
        else { 
            console.log(`Processing single event update for ID: ${id}`);
            const fieldsToUpdate = {};
            // Allowed text fields for events (simplified, can be expanded as needed)
            const allowedTextFields = [ 'Event Name', 'VenueText', 'Description', 'Link', 'Parent Event Name', 'Recurring Info', 'Name', 'Address', 'Opening Hours', 'Accessibility', 'Website', 'Instagram', 'Facebook', 'TikTok', 'Contact Email', 'Contact Phone', 'Parking Exception' ]; // Added venue-related fields for consistency, though 'type' dictates which table is used.
            allowedTextFields.forEach(field => {
                if (result[field] !== undefined) {
                    fieldsToUpdate[field] = result[field];
                }
            });

            // Handle image upload for events or venues (old logic, retained for event compatibility)
            const imageFile = result.files.find(f => f.fieldname === 'promoImage' || f.fieldname === 'photo');
            if (imageFile && imageFile.content.length > 0) {
                 if (type === 'Event') {
                    console.log("New promo image detected for event. Uploading to Cloudinary...");
                    const uploadedImage = await uploadImage(imageFile, 'brumoutloud_events');
                    fieldsToUpdate['Promo Image'] = [{ url: uploadedImage.secure_url }];
                } else if (type === 'Venue') { // This case should now be handled by the 'Venue' block above, but keeping for robustness
                    console.log("New photo detected for venue (via old logic path). Uploading to Cloudinary...");
                    const uploadedImage = await uploadImage(imageFile, 'brumoutloud_venues');
                    fieldsToUpdate['Photo'] = [{ url: uploadedImage.secure_url }];
                    fieldsToUpdate['Photo URL'] = uploadedImage.secure_url;
                    fieldsToUpdate['Photo Medium URL'] = uploadedImage.eager[0]?.secure_url;
                    fieldsToUpdate['Photo Thumbnail URL'] = uploadedImage.eager[1]?.secure_url;
                }
            }

            // Handle date and category for events
            if (type === 'Event') {
                if (result.date) {
                    fieldsToUpdate['Date'] = `${result.date}T${result.time || '00:00'}:00.000Z`;
                }
                if (result.Category) {
                    fieldsToUpdate.Category = toArray(result.Category);
                }
            }
            
            console.log("Attempting to update Airtable with these fields:", JSON.stringify(fieldsToUpdate, null, 2));
            await table.update(id, fieldsToUpdate);
            return { statusCode: 200, body: JSON.stringify({ success: true, message: `Record ${id} updated successfully.` }) };
        }
    } catch (error) {
        console.error("Error updating submission:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
