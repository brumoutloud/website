const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  const slug = event.path.split("/").pop();

  if (!slug) {
    return { statusCode: 400, body: 'Error: Event slug not provided.' };
  }

  try {
    const eventRecords = await base('Events').select({ maxRecords: 1, filterByFormula: `{Slug} = "${slug}"` }).firstPage();

    if (!eventRecords || eventRecords.length === 0) {
      return { statusCode: 404, body: `Event not found.` };
    }

    const eventRecord = eventRecords[0].fields;
    const venueName = eventRecord['Venue Name'] ? eventRecord['Venue Name'][0] : 'TBC';
    const venueSlug = eventRecord['Venue Slug'] ? eventRecord['Venue Slug'][0] : null;
    const eventName = eventRecord['Event Name'];
    const eventDate = new Date(eventRecord['Date']);
    const formattedDate = eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const formattedTime = eventDate.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' });
    const description = eventRecord['Description'] || 'No description provided.';
    const imageUrl = eventRecord['Promo Image'] ? eventRecord['Promo Image'][0].url : 'https://placehold.co/1200x675/1a1a1a/f5efe6?text=Brum+Out+Loud';
    const ticketLink = eventRecord['Link'];
    
    // NEW: Define variables for social sharing
    const pageUrl = `https://brumoutloud.co.uk${event.path}`; // Use your actual domain
    const shareText = encodeURIComponent(`Check out this event: ${eventName}`);
    const twitterUrl = `https://twitter.com/intent/tweet?url=${pageUrl}&text=${shareText}`;
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${pageUrl}`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${shareText}%20${pageUrl}`;
    
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${eventName} | Brum Out Loud</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Anton&family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
        <link rel="stylesheet" href="/css/main.css">
      </head>
      <body class="antialiased">
        <header class="p-8">
            <nav class="container mx-auto flex justify-between items-center">
                <a href="/" class="font-anton text-2xl tracking-widest text-white">BRUM OUT LOUD</a>
                <a href="/events.html" class="nav-cta">BACK TO EVENTS</a>
            </nav>
        </header>
        <main class="container mx-auto px-8 py-16">
            <div class="grid lg:grid-cols-3 gap-16">
                <div class="lg:col-span-2">
                    <img src="${imageUrl}" alt="${eventName}" class="w-full h-auto rounded-2xl mb-8 shadow-2xl object-cover aspect-video">
                    <p class="font-semibold accent-color mb-2">EVENT DETAILS</p>
                    <h1 class="font-anton text-6xl lg:text-8xl heading-gradient leading-none mb-8">${eventName}</h1>
                    <div class="prose prose-invert prose-lg max-w-none text-gray-300">
                        ${description.replace(/\n/g, '<br>')}
                    </div>
                </div>
                <div class="lg:col-span-1">
                    <div class="card-bg p-8 sticky top-8 space-y-6">
                        <div>
                            <h3 class="font-bold text-lg accent-color-secondary mb-2">Date & Time</h3>
                            <p class="text-2xl font-semibold">${formattedDate}</p>
                            <p class="text-xl text-gray-400">${formattedTime}</p>
                        </div>
                         <div>
                            <h3 class="font-bold text-lg accent-color-secondary mb-2">Location</h3>
                            ${venueSlug 
                                ? `<a href="/venue/${venueSlug}" class="text-2xl font-semibold hover:text-white underline">${venueName}</a>` 
                                : `<p class="text-2xl font-semibold">${venueName}</p>`
                            }
                        </div>
                        ${ticketLink ? `<a href="${ticketLink}" target="_blank" rel="noopener noreferrer" class="block w-full text-center bg-accent-color text-white font-bold py-4 px-6 rounded-lg hover:opacity-90 transition-opacity text-xl">GET TICKETS</a>` : ''}

                        <!-- NEW: Social Sharing Section -->
                        <div class="border-t border-gray-700 pt-6">
                            <h3 class="font-bold text-lg accent-color-secondary mb-4 text-center">Share This Event</h3>
                            <div class="flex justify-center space-x-6 text-2xl text-gray-400">
                                <a href="${whatsappUrl}" target="_blank" class="hover:text-white" title="Share on WhatsApp"><i class="fab fa-whatsapp"></i></a>
                                <a href="${twitterUrl}" target="_blank" class="hover:text-white" title="Share on Twitter"><i class="fab fa-twitter"></i></a>
                                <a href="${facebookUrl}" target="_blank" class="hover:text-white" title="Share on Facebook"><i class="fab fa-facebook"></i></a>
                                <button onclick="copyLink()" class="hover:text-white" title="Copy Link"><i class="fas fa-link"></i></button>
                            </div>
                            <p id="copy-success" class="text-sm text-center text-green-400 mt-3 hidden">Link copied!</p>
                        </div>
                    </div>
                </div>
            </div>
        </main>
        <script>
            function copyLink() {
                const dummy = document.createElement('input');
                const text = window.location.href;
                document.body.appendChild(dummy);
                dummy.value = text;
                dummy.select();
                document.execCommand('copy');
                document.body.removeChild(dummy);
                
                const successMsg = document.getElementById('copy-success');
                successMsg.classList.remove('hidden');
                setTimeout(() => { successMsg.classList.add('hidden'); }, 2000);
            }
        </script>
      </body>
      </html>
    `;

    return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: html };

  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: 'Server error fetching event details.' };
  }
};
