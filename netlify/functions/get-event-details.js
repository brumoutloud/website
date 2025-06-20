const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  // ... (all existing data fetching logic remains the same) ...
  
  // The full HTML string that generates the page
  const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        // ... (head content remains the same) ...
      </head>
      <body class="antialiased">
        <header class="p-8">
            // ... (header content remains the same) ...
        </header>
        <main class="container mx-auto px-8 py-16">
            // ... (main content remains the same) ...
        </main>

        <div id="footer-placeholder"></div>

        <script>
            // ... (calendar script remains the same) ...
        </script>
        <script>
            document.addEventListener("DOMContentLoaded", function() {
                fetch('/global/footer.html')
                    .then(response => response.ok ? response.text() : Promise.reject('Footer not found.'))
                    .then(data => { document.getElementById('footer-placeholder').innerHTML = data; })
                    .catch(error => console.error('Error loading footer:', error));
            });
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
