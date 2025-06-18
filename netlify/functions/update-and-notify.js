const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

// This function assumes you have configured Netlify's email integration.
// You will need to add your verified 'from' email address to your Netlify site settings.
exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // Now accepts a 'newStatus' of either 'Approved' or 'Rejected'
        const { id, type, name, contactEmail, newStatus, reason } = JSON.parse(event.body);

        if (!id || !type || !name || !contactEmail || !newStatus) {
            return { statusCode: 400, body: 'Missing required parameters.' };
        }

        // 1. Update the status in Airtable
        const table = type === 'Event' ? base('Events') : base('Venues');
        const updatedRecords = await table.update([{
            id: id,
            fields: { "Status": newStatus }
        }]);

        // 2. Prepare the correct email based on the new status
        let subject = '';
        let body = '';

        if (newStatus === 'Approved') {
            const recordSlug = updatedRecords[0].fields.Slug;
            const liveUrl = `https://brumoutloud.co.uk/${type.toLowerCase()}/${recordSlug}`;
            
            subject = `✅ Your submission is live! "${name}"`;
            body = `
                Hi there,

                Great news! Your submission for "${name}" has been approved and is now live on BrumOutLoud.

                You can view and share it here:
                ${liveUrl}

                Thanks for contributing to the scene!

                The BrumOutLoud Team
            `;
        } else if (newStatus === 'Rejected') {
             if (!reason) return { statusCode: 400, body: 'Rejection reason is required.'};
            
            subject = `⚠️ Action required for your submission: "${name}"`;
            body = `
                Hi there,

                Thanks for your submission for "${name}". It needs a little more information before we can approve it.

                Reason provided: ${reason}

                Please feel free to correct this and resubmit using our promoter tools:
                https://brumoutloud.co.uk/promoter-tool

                If you have any questions, please feel free to reply to this email.

                Thanks,
                The BrumOutLoud Team
            `;
        }

        // 3. Send the email (or log it for now)
        if (subject && body) {
            const mail = {
                from: 'hello@brumoutloud.co.uk',
                to: contactEmail,
                subject: subject,
                text: body,
            };
            
            console.log('--- EMAIL TO BE SENT ---');
            console.log(JSON.stringify(mail, null, 2));
            console.log('------------------------');
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
