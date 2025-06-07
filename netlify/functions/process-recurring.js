const Airtable = require('airtable');

// Initialize Airtable client
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function (event, context) {
  // 1. We only expect this function to be called via a POST request from our webhook
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // 2. Get the record ID sent by the Airtable webhook
    const { recordId } = JSON.parse(event.body);
    if (!recordId) {
        throw new Error("Record ID was not provided in the webhook body.");
    }
    
    console.log(`Processing recurring event for Record ID: ${recordId}`);

    const eventsTable = base.getTable("Events");

    // 3. Fetch the full trigger record to get all its details
    const originalRecord = await eventsTable.selectRecordsAsync({
        recordIds: [recordId],
        fields: eventsTable.fields // Fetch all fields
    });

    if (originalRecord.records.length === 0) {
        throw new Error(`Could not find the trigger record with ID: ${recordId}`);
    }

    const eventData = originalRecord.records[0];
    const generatedDatesText = eventData.getCellValue("AI Generated Dates");

    if (!generatedDatesText) {
        console.log("AI Generated Dates field is empty. Nothing to process.");
        return { statusCode: 200, body: "No recurring dates to process." };
    }

    // 4. Parse the comma-separated list of dates from the AI field
    const datesArray = generatedDatesText.split(',').map(dateStr => dateStr.trim());

    if (datesArray.length <= 1) {
        console.log("No new recurring dates to create.");
        return { statusCode: 200, body: "Only one date found; no recurring events to create." };
    }

    // 5. Prepare a template for the new records
    const recordTemplate = {};
    for (let field of eventsTable.fields) {
        if (!field.isComputed && !field.isPrimaryField) {
            recordTemplate[field.name] = eventData.getCellValue(field.name);
        }
    }

    // 6. Loop through all dates AFTER the first one and create records
    const newRecords = [];
    for (let i = 1; i < datesArray.length; i++) {
        const newDate = datesArray[i];
        
        const newRecordData = { ...recordTemplate };
        newRecordData.Date = newDate;
        newRecordData["Recurring Info"] = null; // Prevent re-triggering automation
        newRecordData["AI Generated Dates"] = null; // Clear the AI field

        newRecords.push({ fields: newRecordData });
    }

    console.log(`Preparing to create ${newRecords.length} new recurring events.`);

    // 7. Create the new records in Airtable
    if(newRecords.length > 0) {
        await eventsTable.createRecordsAsync(newRecords);
        console.log("Successfully created new recurring events.");
    }

    // 8. Update the original record to mark it as processed
    await eventsTable.updateRecordAsync(recordId, {
        "Recurring Info": `Processed: ${eventData.getCellValue("Recurring Info")}`
    });

    return {
        statusCode: 200,
        body: "Recurring events created successfully."
    };

  } catch (error) {
    console.error("An error occurred:", error);
    return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message })
    };
  }
};
