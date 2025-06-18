const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

// This function assumes you have configured Netlify's email integration.
exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { id, type, newStatus, name, contactEmail, reason } = JSON.parse(event.body);

        if (!id || !type || !newStatus) {
            return { statusCode: 400, body: 'Missing required parameters.' };
        }

        // 1. Update the status in Airtable
        const table = type === 'Event' ? base('Events') : base('Venues');
        const updatedRecords = await table.update([{
            id: id,
            fields: { "Status": newStatus }
        }]);

        // 2. If there's no contact email, we're done.
        if (!contactEmail) {
             return { statusCode: 200, body: JSON.stringify({ success: true, message: `Record ${id} updated to ${newStatus}. No notification sent.` })};
        }
        
        // 3. Prepare and send the correct email based on the new status
        let subject = '';
        let body = '';

        if (newStatus === 'Approved') {
            const recordSlug = updatedRecords[0].fields.Slug;
            const liveUrl = `https://brumoutloud.co.uk/${type.toLowerCase()}/${recordSlug}`;
            
            subject = `✅ Your submission is live! "${name}"`;
            body = `Hi there,\n\nGreat news! Your submission for "${name}" has been approved and is now live on BrumOutLoud.\n\nYou can view and share it here:\n${liveUrl}\n\nThanks,\nThe BrumOutLoud Team`;
        } else if (newStatus === 'Rejected') {
            if (!reason) return { statusCode: 400, body: 'Rejection reason is required.'};
            
            subject = `⚠️ Action required for your submission: "${name}"`;
            body = `Hi there,\n\nThanks for your submission for "${name}". It needs a little more information before we can approve it.\n\nReason provided: ${reason}\n\nPlease feel free to correct this and resubmit using our promoter tools:\nhttps://brumoutloud.co.uk/promoter-tool\n\nThanks,\nThe BrumOutLoud Team`;
        }

        if (subject && body) {
            const mail = { from: 'hello@brumoutloud.co.uk', to: contactEmail, subject: subject, text: body };
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
