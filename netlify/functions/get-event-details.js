const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  const slug = event.path.split("/").pop();
  if (!slug) { return { statusCode: 400, body: 'Error: Event slug not provided.' }; }

  try {
    const eventRecords = await base('Events').select({
        maxRecords: 1,
        filterByFormula: `{Slug} = "${slug}"`,
        fields: ['Event Name', 'Description', 'Date', 'Promo Image', 'Link', 'Recurring Info', 'Venue Name', 'Venue Slug', 'Parent Event Name', 'VenueText']
    }).firstPage();

    if (!eventRecords || eventRecords.length === 0) {
      return { statusCode: 404, body: `Event not found.` };
    }

    const eventRecord = eventRecords[0];
    const fields = eventRecord.fields;
    const eventName = fields['Event Name'];
    const parentEventName = fields['Parent Event Name'];
    const recurringInfo = fields['Recurring Info'];
    let allFutureInstances = [];

    let filterFormula;
    if (parentEventName) {
        const parentNameForQuery = parentEventName.replace(/"/g, '\\"');
        filterFormula = `AND({Parent Event Name} = "${parentNameForQuery}", IS_AFTER({Date}, DATEADD(TODAY(),-1,'days')))`
    } else if (recurringInfo) {
        const eventNameForQuery = eventName.replace(/"/g, '\\"');
        filterFormula = `AND({Event Name} = "${eventNameForQuery}", {Recurring Info}, IS_AFTER({Date}, DATEADD(TODAY(),-1,'days')))`
    }

    if (filterFormula) {
        const futureInstanceRecords = await base('Events').select({
            filterByFormula: filterFormula,
            sort: [{ field: 'Date', direction: 'asc' }]
        }).all();
        allFutureInstances = futureInstanceRecords.map(rec => rec.fields);
    }
    
    const eventDate = new Date(fields['Date']);
    const venueName = fields['Venue Name'] ? fields['Venue Name'][0] : (fields['VenueText'] || 'TBC');
    const venueSlug = fields['Venue Slug'] ? fields['Venue Slug'][0] : null;
    const description = fields['Description'] || 'No description provided.';
    const pageUrl = `https://brumoutloud.co.uk${event.path}`;
    const imageUrl = fields['Promo Image'] ? fields['Promo Image'][0].url : 'https://placehold.co/1200x675/1a1a1a/f5efe6?text=Brum+Out+Loud';

    const calendarData = {
        title: eventName,
        description: `${description.replace(/\n/g, '\\n')}\\n\\nFind out more: ${pageUrl}`,
        location: venueName,
        startTime: eventDate.toISOString(),
        endTime: new Date(eventDate.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        isRecurring: (parentEventName || recurringInfo) && allFutureInstances.length > 1,
        recurringDates: allFutureInstances.map(i => i.Date)
    };
    
    const otherInstancesToDisplay = allFutureInstances.filter(inst => inst.Date !== fields['Date']);

    const otherInstancesHTML = otherInstancesToDisplay.slice(0, 5).map(instance => {
        const d = new Date(instance.Date);
        const day = d.toLocaleDateString('en-GB', { day: 'numeric' });
        const month = d.toLocaleDateString('en-GB', { month: 'short' });
        return `<a href="/event/<span class="math-inline">\{instance\.Slug\}" class\="card\-bg p\-4 flex items\-center space\-x\-4 hover\:bg\-gray\-800 transition\-colors duration\-200 block"\>
<div class\="text\-center w\-20 flex\-shrink\-0"\>
<p class\="text\-2xl font\-bold text\-white"\></span>{day}</p>
                        <p class="text-lg text-gray-400"><span class="math-inline">\{month\}</p\>
</div\>
<div class\="flex\-grow"\>
<h4 class\="font\-bold text\-white text\-xl"\></span>{instance['Event Name']}</h4>
                        <p class="text-sm text-gray
