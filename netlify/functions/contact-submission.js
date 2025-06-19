const parser = require('lambda-multipart-parser');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const result = await parser.parse(event);
        
        // In a real application, you would send this data as an email
        // or save it to a database. For now, we'll just log it to your function logs.
        console.log('--- NEW CONTACT FORM SUBMISSION ---');
        console.log(`From: ${result.name} <${result.email}>`);
        console.log(`Subject: ${result.subject}`);
        console.log(`Message: ${result.message}`);
        console.log('------------------------------------');

        // Return a success page to the user
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: `<!DOCTYPE html><html><head><title>Success</title><link href="https://fonts.googleapis.com/css2?family=Anton&family=Poppins&display=swap" rel="stylesheet"><link rel="stylesheet" href="/css/main.css"></head><body class="antialiased" style="text-align: center; padding-top: 50px;"><div class="max-w-xl mx-auto"><h1 class="font-anton text-7xl heading-gradient">Thank You!</h1><p class="mt-4 text-xl text-gray-300">Your message has been sent. We'll get back to you as soon as possible.</p><a href="/" style="display:inline-block; margin-top: 2rem;" class="nav-cta">BACK TO SITE</a></div></body></html>`
        };
    } catch (error) {
        console.error("Error parsing contact form data:", error);
        return {
            statusCode: 500,
            body: `An error occurred while processing your message.`
        };
    }
};
