const Airtable = require('airtable');
const parser = require('lambda-multipart-parser');
const cloudinary = require('cloudinary').v2;
const fetch = require('node-fetch');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
        });
    }
} catch (error) {
    console.error("Firebase Admin Initialization Error:", error);
}

const db = admin.firestore();

// Helper to get Gemini model name from Firestore
async function getGeminiModelName() {
    try {
        const doc = await db.collection('settings').doc('gemini').get();
        if (doc.exists && doc.data().modelName) {
            console.log(`Using Gemini model from Firestore: ${doc.data().modelName}`);
            return doc.data().modelName;
        }
    } catch (error) {
        console.error("Error fetching Gemini model from Firestore:", error);
    }
    const fallbackModel = 'gemini-2.5-flash';
    console.log(`Using fallback Gemini model: ${fallbackModel}`);
    return fallbackModel;
}

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function getDatesFromAI(startDate, recurringInfo, modelName) {
    if (!GEMINI_API_KEY) return [startDate];
    const prompt = `Based on a start date of ${startDate} and the recurrence rule "${recurringInfo}", provide a comma-separated list of all dates for the next 3 months in format YYYY-MM-DD. IMPORTANT: Only return the comma-separated list of dates and nothing else.`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
    try {
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json();
        const textResponse = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        const dateRegex = /\d{4}-\d{2}-\d{2}/g;
        const dates = textResponse.match(dateRegex);
        return dates && dates.length > 0 ? dates : [startDate];
    } catch (error) {
        console.error("Error calling AI for dates:", error);
        return [startDate];
    }
}

// ... the rest of the file (uploadImage, exports.handler, etc.) ...
// Remember to call getGeminiModelName() in your handler like this:
// exports.handler = async function(event, context) {
//   const geminiModel = await getGeminiModelName();
//   ... and then pass geminiModel to any function that needs it ...
//   const datesToCreate = await getDatesFromAI(result.date, recurringInfo, geminiModel);
//   ...
// }
