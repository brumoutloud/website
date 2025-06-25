const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

// Helper function to create a URL-friendly slug from a string
const slugify = (text) => {
  if (!text) return '';
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
};

exports.handler = async function (event, context) {
  console.log("Starting FINAL slug cleanup process...");

  try {
    const allEvents = await base('Events').select({
      fields: ['Event Name', 'Parent Event Name', 'Recurring Info', 'Date', 'Slug'],
    }).all();

    console.log(`Fetched ${allEvents.length} total events.`);

    const updates = [];
    const eventSeries = new Map();

    // Group events by their 'Parent Event Name'
    allEvents.forEach(record => {
      const fields = record.fields;
      const parentName = fields['Parent Event Name'];

      // Only process records that are part of a series (i.e., have a Parent Event Name)
      if (parentName) {
        if (!eventSeries.has(parentName)) {
          eventSeries.set(parentName, []);
        }
        eventSeries.get(parentName).push(record);
      }
    });

    console.log(`Found ${eventSeries.size} event series based on 'Parent Event Name'.`);

    // Iterate over the grouped series
    for (const [parentName, records] of eventSeries.entries()) {
      // Generate the base slug from the parent name text itself
      const baseSlug = slugify(parentName);

      records.forEach(record => {
        const fields = record.fields;
        const eventDate = new Date(fields.Date);
        
        if (isNaN(eventDate.getTime())) {
            console.warn(`Skipping record with invalid date: ID ${record.id}, Name: ${fields['Event Name']}`);
            return; // Skip this record if the date is invalid
        }

        // Format date as YYYY-MM-DD
        const dateString = eventDate.toISOString().split('T')[0];
        const newSlug = `${baseSlug}-${dateString}`;

        // If the current slug is not the new, unique slug, schedule an update.
        if (fields.Slug !== newSlug) {
          updates.push({
            id: record.id,
            fields: { 'Slug': newSlug }
          });
        }
      });
    }

    console.log(`Found ${updates.length} records that need a slug update.`);

    if (updates.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "All recurring event slugs appear to be correct. No updates needed." }),
      };
    }

    // Update records in batches of 10 (Airtable API limit)
    let updatedCount = 0;
    for (let i = 0; i < updates.length; i += 10) {
      const batch = updates.slice(i, i + 10);
      await base('Events').update(batch);
      updatedCount += batch.length;
      console.log(`Updated batch ${Math.floor(i/10) + 1}. Total updated: ${updatedCount}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Slug cleanup complete. Successfully updated ${updatedCount} event records.`,
      }),
    };

  } catch (error) {
    console.error("Error during slug cleanup:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "An error occurred during the cleanup process.", details: error.message }),
    };
  }
};
