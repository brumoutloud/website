const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    try {
        const { id, type, name, contactEmail, newStatus, reason } = JSON.parse(event.body);

        if (!id || !type || !name || !newStatus) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Missing required parameters.' }) };
        }

        const table = type === 'Event' ? base('Events') : base('Venues');
        const updatedRecords = await table.update([{
            id: id,
            fields: { "Status": newStatus }
        }]);

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
            const liveUrl = recordSlug ? `https://brumoutloud.co.uk/${type.toLowerCase()}/${recordSlug}` : `https://brumoutloud.co.uk`;
L42: Great news! Your submission for "${name}" has been approved and is now live on Brum Outloud.
L49: The Brum Outloud Team
L65: https://brumoutloud.co.uk/promoter-tool
L70: The Brum Outloud Team
L75: const mail = { from: 'hello@brumoutloud.co.uk', to: contactEmail, subject: subject, text: body, };
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
