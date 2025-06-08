// v4 - Redesigns the event page with a two-column layout and "Add to Calendar" button.
const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  const slug = event.path.split("/").pop();

  if (!slug) {
    return { statusCode: 400, body: 'Error: Event slug could not be determined from the URL.' };
  }

  try {
    const records = await base('Events')
      .select({
        maxRecords: 1,
        filterByFormula: `{Slug} = "${slug}"`,
      })
      .firstPage();

    if (!records || records.length === 0) {
      return { statusCode: 404, body: `Event with slug "${slug}" not found.` };
    }

    const eventRecord = records[0];
    const eventName = eventRecord.get('Event Name');
    const eventDate = new Date(eventRecord.get('Date'));
    const venue = eventRecord.get('Venue');
    const description = eventRecord.get('Description') || 'No description provided.';
    const imageUrl = eventRecord.get('Promo Image') ? eventRecord.get('Promo Image')[0].url : 'https://placehold.co/1200x630/1e1e1e/EAEAEA?text=Brum+Out+Loud';
    const ticketLink = eventRecord.get('Link');
    const recurringInfo = eventRecord.get('Recurring Info');
    const pageUrl = `https://bolwebsite.netlify.app${event.path}`; // Use your actual domain

    // Prepare data for the Add to Calendar function
    const eventDataForClient = {
        title: eventName,
        description: description.replace(/\n/g, '\\n'), // Escape newlines for ICS
        startTime: eventDate.toISOString(),
        // Let's assume a 2-hour duration for now
        endTime: new Date(eventDate.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        location: venue
    };
    
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
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css" xintegrity="sha512-z3gLpd7yknf1YoNbCzqRKc4qyor8gaKU1qmn+CShxbuBusANI9QpRohGBreCFkKxLhei6S9CQXFEbbKuqLg0DA==" crossorigin="anonymous" referrerpolicy="no-referrer" />
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
          <div class="max-w-7xl mx-auto lg:grid lg:grid-cols-3 lg:gap-12">
            
            <!-- Main Content Column -->
            <div class="lg:col-span-2">
              <img src="${imageUrl}" alt="${eventName}" class="w-full h-auto rounded-2xl mb-8 shadow-lg object-cover aspect-video">
              <h1 class="text-4xl lg:text-5xl font-extrabold text-white mb-4">${eventName}</h1>
              <div class="prose prose-invert prose-lg max-w-none text-gray-300">
                ${description.replace(/\n/g, '<br>')}
              </div>
            </div>

            <!-- Sidebar Column -->
            <div class="lg:col-span-1 mt-8 lg:mt-0">
                <div class="bg-[#1e1e1e] rounded-2xl p-6 sticky top-24">
                    <div class="flex flex-col space-y-4">
                        <div class="flex items-start space-x-4">
                            <i class="fas fa-calendar-alt text-[#B564F7] mt-1 fa-lg"></i>
                            <div>
                                <h3 class="font-bold text-white">Date and Time</h3>
                                <p class="text-gray-300">${eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                <p class="text-gray-300">${eventDate.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' })}</p>
                                ${recurringInfo ? `<span class="mt-2 inline-block bg-teal-400/10 text-teal-300 text-xs font-semibold px-2 py-1 rounded-full">${recurringInfo}</span>` : ''}
                            </div>
                        </div>

                        <div class="flex items-start space-x-4">
                             <i class="fas fa-map-marker-alt text-[#B564F7] mt-1 fa-lg"></i>
                            <div>
                                <h3 class="font-bold text-white">Location</h3>
                                <p class="text-gray-300">${venue}</p>
                            </div>
                        </div>
                        
                        <a id="add-to-calendar-btn" href="#" class="w-full text-center bg-[#FADCD9] text-[#333333] px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity">Add to Calendar</a>
                        ${ticketLink ? `<a href="${ticketLink}" target="_blank" rel="noopener noreferrer" class="w-full text-center bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-500 transition-opacity">Get Tickets</a>` : ''}

                        <div class="border-t border-gray-700 my-4"></div>
                        
                        <h3 class="font-bold text-white text-center">Share This Event</h3>
                        <div class="flex justify-center space-x-4">
                            <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(eventName)}&url=${encodeURIComponent(pageUrl)}" target="_blank" class="text-gray-400 hover:text-white"><i class="fab fa-twitter fa-2x"></i></a>
                            <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}" target="_blank" class="text-gray-400 hover:text-white"><i class="fab fa-facebook fa-2x"></i></a>
                        </div>
                    </div>
                </div>
            </div>

          </div>
        </main>
        
        <script>
            // Data for the client-side script
            const eventData = ${JSON.stringify(eventDataForClient)};

            function generateICSFile() {
                // Format dates to be ICS compliant (YYYYMMDDTHHMMSSZ)
                const toICSDate = (isoDate) => new Date(isoDate).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
                
                const icsContent = [
                    'BEGIN:VCALENDAR',
                    'VERSION:2.0',
                    'PRODID:-//BrumOutLoud//Event Calendar//EN',
                    'BEGIN:VEVENT',
                    'UID:' + new Date().getTime() + '@brumoutloud.co.uk',
                    'DTSTAMP:' + toICSDate(new Date()),
                    'DTSTART:' + toICSDate(eventData.startTime),
                    'DTEND:' + toICSDate(eventData.endTime),
                    'SUMMARY:' + eventData.title,
                    'DESCRIPTION:' + eventData.description,
                    'LOCATION:' + eventData.location,
                    'END:VEVENT',
                    'END:VCALENDAR'
                ].join('\\r\\n');

                return 'data:text/calendar;charset=utf8,' + encodeURIComponent(icsContent);
            }

            document.addEventListener('DOMContentLoaded', () => {
                const calendarBtn = document.getElementById('add-to-calendar-btn');
                calendarBtn.href = generateICSFile();
                // Set a suggested filename for the download
                calendarBtn.download = \`\${eventData.title.replace(/ /g, '_')}.ics\`;
            });
        </script>
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
