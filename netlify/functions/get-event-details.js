const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  // More robust method to get the slug from the end of the path
  const slug = event.path.split("/").pop();

  if (!slug) {
    return { statusCode: 400, body: 'Error: Event slug could not be determined from the URL.' };
  }

  try {
    // Find the record in Airtable that matches the slug
    const records = await base('Events')
      .select({
        maxRecords: 1,
        filterByFormula: `{Slug} = "${slug}"`,
      })
      .firstPage();

    if (!records || records.length === 0) {
      return { statusCode: 404, body: `Event with slug "${slug}" not found.` };
    }

    const event = records[0];
    const eventName = event.get('Event Name');
    const eventDate = new Date(event.get('Date'));
    const formattedDate = eventDate.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'Europe/London'
    });
    const venue = event.get('Venue');
    const description = event.get('Description') || 'No description provided.';
    const imageUrl = event.get('Promo Image') ? event.get('Promo Image')[0].url : 'https://placehold.co/1200x630/1e1e1e/EAEAEA?text=Brum+Out+Loud';
    const ticketLink = event.get('Link');

    // Dynamically generate the full HTML for the page
    const html = `
      <!DOCTYPE html>
      <html lang="en" class="dark">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${eventName} | Brum Out Loud</title>
        <meta name="description" content="${description.substring(0, 155)}">
        <meta property="og:title" content="${eventName}">
        <meta property="og:description" content="${description.substring(0, 155)}">
        <meta property="og:image" content="${imageUrl}">
        <meta property="og:type" content="website">
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Poppins', sans-serif; background-color: #121212; color: #EAEAEA; }
        </style>
      </head>
      <body class="antialiased">
        <header class="bg-[#1e1e1e] shadow-md">
          <nav class="container mx-auto px-4 lg:px-0 py-4 flex justify-between items-center">
            <a href="/" class="text-3xl font-bold text-white">BrumOutLoud</a>
            <a href="/" class="bg-[#FADCD9] text-[#333333] px-5 py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity">Back to Events</a>
          </nav>
        </header>
        <main class="container mx-auto p-4 lg:p-8">
          <div class="max-w-4xl mx-auto">
            <img src="${imageUrl}" alt="${eventName}" class="w-full h-auto rounded-2xl mb-8 shadow-lg">
            <h1 class="text-4xl lg:text-5xl font-extrabold text-white mb-4">${eventName}</h1>
            <p class="font-semibold text-xl text-[#B564F7] mb-2">${formattedDate}</p>
            <p class="text-lg text-gray-300 mb-8">${venue}</p>
            <div class="prose prose-invert prose-lg max-w-none text-gray-300">
              ${description.replace(/\n/g, '<br>')}
            </div>
            ${ticketLink ? `<a href="${ticketLink}" target="_blank" rel="noopener noreferrer" class="inline-block bg-[#FADCD9] text-[#333333] px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity mt-8">Get Tickets</a>` : ''}
          </div>
        </main>
      </body>
      </html>
    `;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: html,
    };

  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: 'Server error while fetching event details.' };
  }
};
