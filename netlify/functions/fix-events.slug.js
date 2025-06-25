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
  console.log("Starting slug cleanup process...");

  try {
    const allEvents = await base('Events').select({
      fields: ['Event Name', 'Parent Event Name', 'Recurring Info', 'Date', 'Slug'],
      sort: [{field: 'Date', direction: 'asc'}]
    }).all();

    console.log(`Fetched ${allEvents.length} total events.`);

    const updates = [];
    const parentSlugs = {}; // To store the base slug for each parent event

    // First pass: Identify parent events and their base slugs
    allEvents.forEach(record => {
      const fields = record.fields;
      if (fields['Recurring Info'] && !fields['Parent Event Name']) {
        const baseSlug = slugify(fields['Event Name']);
        parentSlugs[fields['Event Name']] = baseSlug;

        // Add the parent event itself to the update list if its slug is incorrect
        if (fields.Slug !== baseSlug) {
            updates.push({
                id: record.id,
                fields: { 'Slug': baseSlug }
            });
        }
      }
    });

    console.log(`Identified ${Object.keys(parentSlugs).length} parent events.`);

    // Second pass: Update slugs for all child instances
    allEvents.forEach(record => {
        const fields = record.fields;
        const parentName = fields['Parent Event Name'];

        if (parentName && parentSlugs[parentName]) {
            const baseSlug = parentSlugs[parentName];
            const eventDate = new Date(fields.Date);
            // Format date as YYYY-MM-DD
            const dateString = eventDate.toISOString().split('T')[0];
            const newSlug = `${baseSlug}-${dateString}`;

            // Only add to updates if the slug needs changing
            if (fields.Slug !== newSlug) {
                 updates.push({
                    id: record.id,
                    fields: { 'Slug': newSlug }
                });
            }
        }
    });

    console.log(`Found ${updates.length} records that need a slug update.`);

    if (updates.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "All event slugs are already correct. No updates needed." }),
      };
    }

    // Update records in batches of 10 (Airtable API limit)
    let updatedCount = 0;
    for (let i = 0; i < updates.length; i += 10) {
      const batch = updates.slice(i, i + 10);
      await base('Events').update(batch);
      updatedCount += batch.length;
      console.log(`Updated batch ${i/10 + 1}. Total updated: ${updatedCount}`);
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
