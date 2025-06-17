<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Data Migration Tool</title>
    <link rel="stylesheet" href="/css/main.css">
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="antialiased">
    <main class="container mx-auto px-8 py-16 text-center max-w-2xl">
        <h1 class="font-anton text-5xl text-white mb-4">Data Migration Tool</h1>
        <p class="text-gray-400 mb-8">Use this tool to scrape content from the live brumoutloud.co.uk site and import it into the Airtable database. This process can take several minutes. Do not close this page while it's running.</p>
        
        <div class="card-bg p-8">
            <button id="start-migration-btn" class="nav-cta w-full text-lg">
                Start Venue Migration
            </button>
            <div id="status-message" class="mt-6 text-gray-300"></div>
        </div>
    </main>

    <script>
        const startBtn = document.getElementById('start-migration-btn');
        const statusMessage = document.getElementById('status-message');

        startBtn.addEventListener('click', async () => {
            // Disable button and show loading state
            startBtn.disabled = true;
            startBtn.innerHTML = '<span class="loader inline-block w-6 h-6 border-2 border-t-transparent"></span><span class="ml-2">Migration in Progress...</span>';
            statusMessage.textContent = 'This may take a few minutes. Please wait...';

            try {
                const response = await fetch('/.netlify/functions/migrate-data', {
                    method: 'POST'
                });
                
                const result = await response.json();

                if (response.ok && result.success) {
                    statusMessage.textContent = `Success! ${result.message}`;
                    startBtn.style.backgroundColor = '#10B981'; // Green
                    startBtn.innerHTML = 'Migration Complete!';
                } else {
                    throw new Error(result.message || 'An unknown error occurred.');
                }

            } catch (error) {
                statusMessage.textContent = `Error: ${error.message}`;
                startBtn.disabled = false;
                startBtn.style.backgroundColor = '#EF4444'; // Red
                startBtn.innerHTML = 'Migration Failed - Try Again';
            }
        });
    </script>
</body>
</html>
