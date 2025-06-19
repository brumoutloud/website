const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    try {
        const { id, type, name, contactEmail, newStatus, reason } = JSON.parse(event.body);

        // **FIX**: Only the core fields are required for the function to run. 
        // contactEmail is optional for the notification part.
        if (!id || !type || !name || !newStatus) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Missing required parameters.' }) };
        }

        const table = type === 'Event' ? base('Events') : base('Venues');
        const updatedRecords = await table.update([{
            id: id,
            fields: { "Status": newStatus }
        }]);

        // **FIX**: If there's no email, just log it and move on. Don't crash.
        if (!contactEmail) {
            console.log(`No contactEmail provided for ${type} '${name}'. Skipping notification.`);
            return {
                statusCode: 200,
                body: JSON.stringify({ success: true, message: `Submission status set to ${newStatus}. No notification sent.` }),
            };
        }
        
        let subject = '';
        let body = '';

        if (newStatus === 'Approved') {
            const recordSlug = updatedRecords[0].fields.Slug;
            const liveUrl = `https://brumoutloud.co.uk/${type.toLowerCase()}/${recordSlug}`;
            
            subject = `✅ Your submission is live! "${name}"`;
            body = `Hi there,\n\nGreat news! Your submission for "${name}" has been approved and is now live on BrumOutLoud.\n\nYou can view it here: ${liveUrl}\n\nThanks for contributing!\n\nThe BrumOutLoud Team`;
        } else if (newStatus === 'Rejected') {
             if (!reason) {
                // **FIX**: Return a proper JSON error.
                return { statusCode: 400, body: JSON.stringify({ message: 'Rejection reason is required.'})};
             }
            
            subject = `⚠️ Action required for your submission: "${name}"`;
            body = `Hi there,\n\nThanks for your submission for "${name}". It needs a little more info before we can approve it.\n\nReason provided: ${reason}\n\nPlease feel free to correct this and resubmit.\n\nThanks,\nThe BrumOutLoud Team`;
        }

        if (subject && body) {
            // This is where you would integrate with a mail service like Netlify's built-in email.
            // For now, it logs to the console.
            const mail = { from: 'hello@brumoutloud.co.uk', to: contactEmail, subject, text: body };
            console.log('--- EMAIL TO BE SENT ---');
            console.log(JSON.stringify(mail, null, 2));
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `Submission status set to ${newStatus} and notification logged.` }),
        };

    } catch (error) {
        console.error("Error processing submission update:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};
