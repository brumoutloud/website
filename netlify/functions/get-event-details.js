// v9.1 - Provides the full HTML for the event page template.
const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  const slug = event.path.split("/").pop();

  if (!slug) {
    return { statusCode: 400, body: 'Error: Event slug could not be determined from the URL.' };
  }

  try {
    // --- Step 1: Fetch the Event Details ---
    const eventRecords = await base('Events')
      .select({
        maxRecords: 1,
        filterByFormula: `{Slug} = "${slug}"`,
        // Specify all the fields we need from the Events table
        fields: ['Event Name', 'Description', 'Date', 'Promo Image', 'Link', 'Recurring Info', 'Venue Name', 'Venue Slug']
      })
      .firstPage();

    if (!eventRecords || eventRecords.length === 0) {
      return { statusCode: 404, body: `Event with slug "${slug}" not found.` };
    }

    const eventRecord = eventRecords[0];
    // Use the Venue Name from the lookup field in the Events table
    const venueName = eventRecord.get('Venue Name') ? eventRecord.get('Venue Name')[0] : 'TBC';
    // Use the Venue Slug from the lookup field in the Events table
    const venueSlug = eventRecord.get('Venue Slug') ? eventRecord.get('Venue Slug')[0] : null;

    // --- Step 2: Prepare all data for the HTML template ---
    const eventName = eventRecord.get('Event Name');
    const eventDate = new Date(eventRecord.get('Date'));
    const formattedDate = eventDate.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'Europe/London'
    });
    const description = eventRecord.get('Description') || 'No description provided.';
    const imageUrl = eventRecord.get('Promo Image') ? eventRecord.get('Promo Image')[0].url : 'https://placehold.co/1200x630/1e1e1e/EAEAEA?text=Brum+Out+Loud';
    const ticketLink = eventRecord.get('Link');
    const recurringInfo = eventRecord.get('Recurring Info');
    const pageUrl = `https://bolwebsite.netlify.app${event.path}`; // Replace with your actual domain if different

    const eventDataForClient = {
        title: eventName,
        description: `${description.replace(/\n/g, '\\n')}\\n\\nFind out more: ${pageUrl}`,
        startTime: eventDate.toISOString(),
        endTime: new Date(eventDate.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        location: venueName
    };
    
    // --- Step 3: Generate the Full HTML Page ---
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
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css" xintegrity="sha512-z3gLpd7yknf1YoNbCzqRKc4qyor8gaKU1qmn+CShxbuBusANI9QpRohGBreCFkKxLhei6S9CQXFEbbKuqLg0DA==" crossorigin="anonymous" referrerpolicy="no-referrer" />
        <style> body { font-family: 'Poppins', sans-serif; background-color: #121212; color: #EAEAEA; } </style>
      </head>
      <body class="antialiased">
        <header class="bg-[#1e1e1e] shadow-md">
          <nav class="container mx-auto px-4 lg:px-0 py-4 flex justify-between items-center">
            <a href="/" class="text-3xl font-bold text-white">BrumOutLoud</a>
            <a href="/" class="bg-[#FADCD9] text-[#333333] px-5 py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity">Back to Events</a>
          </nav>
        </header>
        <main class="container mx-auto p-4 lg:p-8">
          <div class="max-w-7xl mx-auto lg:grid lg:grid-cols-3 lg:gap-12">
            
            <div class="lg:col-span-2">
              <img src="${imageUrl}" alt="${eventName}" class="w-full h-auto rounded-2xl mb-8 shadow-lg object-cover aspect-video">
              <h1 class="text-4xl lg:text-5xl font-extrabold text-white mb-4">${eventName}</h1>
              <div class="prose prose-invert prose-lg max-w-none text-gray-300">
                ${description.replace(/\n/g, '<br>')}
              </div>
              ${eventRecord.get('Promo Image') ? `<div class="mt-12"><h2 class="text-3xl font-bold text-white mb-4">Event Flyer</h2><img src="${imageUrl}" alt="Full flyer for ${eventName}" class="w-full h-auto rounded-lg shadow-md"></div>` : ''}
            </div>

            <div class="lg:col-span-1 mt-8 lg:mt-0">
                <div class="bg-[#1e1e1e] rounded-2xl p-6 sticky top-24">
                    <div class="flex flex-col space-y-4">
                        <div class="flex items-start space-x-4">
                            <i class="fas fa-calendar-alt text-[#B564F7] mt-1 fa-lg"></i>
                            <div>
                                <h3 class="font-bold text-white">Date and Time</h3>
                                <p class="text-gray-300">${formattedDate}</p>
                                ${recurringInfo ? `<span class="mt-2 inline-block bg-teal-400/10 text-teal-300 text-xs font-semibold px-2 py-1 rounded-full">${recurringInfo}</span>` : ''}
                            </div>
                        </div>
                        <div class="flex items-start space-x-4">
                             <i class="fas fa-map-marker-alt text-[#B564F7] mt-1 fa-lg"></i>
                            <div>
                                <h3 class="font-bold text-white">Location</h3>
                                ${venueSlug 
                                    ? `<a href="/venue/${venueSlug}" class="text-gray-300 hover:text-white hover:underline">${venueName}</a>` 
                                    : `<p class="text-gray-300">${venueName}</p>`
                                }
                            </div>
                        </div>
                        ${ticketLink ? `<a href="${ticketLink}" target="_blank" rel="noopener noreferrer" class="w-full text-center bg-[#FADCD9] text-[#333333] px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity">Get Tickets</a>` : ''}
                        <div>
                            <h3 class="font-bold text-white mb-2">Add to Your Calendar</h3>
                            <div class="grid grid-cols-2 gap-2">
                                <a id="google-calendar-btn" href="#" target="_blank" class="w-full text-center bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-500 transition-opacity text-sm">Google Calendar</a>
                                <a id="add-to-calendar-btn" href="#" class="w-full text-center bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-500 transition-opacity text-sm">Apple/Outlook</a>
                            </div>
                        </div>
                        <div class="border-t border-gray-700 my-4"></div>
                        <h3 class="font-bold text-white text-center">Invite your mates?</h3>
                        <div class="flex justify-center space-x-4">
                            <a href="https://wa.me/?text=${encodeURIComponent('Check out this event: ' + eventName + ' - ' + pageUrl)}" target="_blank" class="text-gray-400 hover:text-white"><i class="fab fa-whatsapp fa-2x"></i></a>
                             <button onclick="copyLink()" class="text-gray-400 hover:text-white"><i class="fas fa-link fa-2x"></i></button>
                        </div>
                        <span id="copy-success" class="text-center text-sm text-green-400 hidden">Link Copied!</span>
                    </div>
                </div>
            </div>
          </div>
        </main>
        <script>
            const eventData = ${JSON.stringify(eventDataForClient)};
            const pageUrl = "${pageUrl}";
            function toICSDate(isoDate) { return new Date(isoDate).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'; }
            function generateICSFile() { const icsContent = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//BrumOutLoud//EN','BEGIN:VEVENT','UID:' + new Date().getTime() + '@brumoutloud.co.uk','DTSTAMP:' + toICSDate(new Date()),'DTSTART:' + toICSDate(eventData.startTime),'DTEND:' + toICSDate(eventData.endTime),'SUMMARY:' + eventData.title,'DESCRIPTION:' + eventData.description,'LOCATION:' + eventData.location,'END:VEVENT','END:VCALENDAR'].join('\\r\\n'); return 'data:text/calendar;charset=utf8,' + encodeURIComponent(icsContent); }
            function generateGoogleCalendarLink() { const baseUrl = 'https://www.google.com/calendar/render?action=TEMPLATE'; const params = new URLSearchParams({ text: eventData.title, dates: \`\${toICSDate(eventData.startTime)}/\${toICSDate(eventData.endTime)}\`, details: eventData.description, location: eventData.location }); return \`\${baseUrl}&\${params.toString()}\`; }
            function copyLink() { const dummy = document.createElement('input'); document.body.appendChild(dummy); dummy.value = pageUrl; dummy.select(); document.execCommand('copy'); document.body.removeChild(dummy); const successMsg = document.getElementById('copy-success'); successMsg.classList.remove('hidden'); setTimeout(() => successMsg.classList.add('hidden'), 2000); }
            document.addEventListener('DOMContentLoaded', () => { document.getElementById('add-to-calendar-btn').href = generateICSFile(); document.getElementById('add-to-calendar-btn').download = \`\${eventData.title.replace(/ /g, '_')}.ics\`; document.getElementById('google-calendar-btn').href = generateGoogleCalendarLink(); });
        </script>
      </body>
      </html>
    `;

    return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: html };

  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: 'Server error while fetching event details.' };
  }
};
