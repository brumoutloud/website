const Airtable = require('airtable');

exports.handler = async (event, context) => {
    try {
        const { AIRTABLE_PERSONAL_ACCESS_TOKEN, AIRTABLE_BASE_ID } = process.env;
        const base = new Airtable({ apiKey: AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(AIRTABLE_BASE_ID);
        const { view, offset, category, venue, day } = event.queryStringParameters;

        let selectOptions = {};

        if (view === 'admin') {
            // Admin view: Fetch all approved events, sorted by date descending
            selectOptions = {
                view: "Approved Events",
                sort: [{ field: 'Date', direction: 'desc' }],
                offset: offset,
            };
        } else {
            // Public view: Check if specific filters are applied
            if (category || venue || day) {
                // If filters exist, build a dynamic formula
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayISO = today.toISOString();

                let filterParts = [
                    "Status = 'Approved'",
                    `OR(
                        AND({End Date}, IS_AFTER({End Date}, '${todayISO}')),
                        AND(NOT({End Date}), IS_AFTER(Date, '${todayISO}')),
                        IS_SAME(Date, '${todayISO}', 'day'),
                        IS_SAME({End Date}, '${todayISO}', 'day')
                    )`
                ];

                if (category) filterParts.push(`FIND('${category}', ARRAYJOIN(Category))`);
                if (venue) filterParts.push(`{VenueRecID} = '${venue}'`);
                if (day) {
                    const targetDate = new Date(day);
                    const targetDateStart = new Date(targetDate.setHours(0,0,0,0)).toISOString();
                    const targetDateEnd = new Date(targetDate.setHours(23,59,59,999)).toISOString();
                    filterParts.push(
                        `OR(
                            AND(Date >= '${targetDateStart}', Date <= '${targetDateEnd}'),
                            AND({End Date}, Date <= '${targetDateStart}', {End Date} >= '${targetDateStart}')
                        )`
                    );
                }

                selectOptions = {
                    filterByFormula: `AND(${filterParts.join(', ')})`,
                    sort: [{ field: 'Date', direction: 'asc' }],
                    offset: offset,
                };

            } else {
                // **MODIFICATION**: Using the correct view name provided.
                selectOptions = {
                    view: "Approved Upcoming",
                    sort: [{ field: 'Date', direction: 'asc' }],
                    offset: offset,
                };
            }
        }

        const allRecords = await base('Events').select(selectOptions).all();

        const records = allRecords.map(record => ({
            id: record.id,
            fields: record.fields
        }));

        const response = {
            events: records,
            offset: allRecords.offset
        };

        return {
            statusCode: 200,
            body: JSON.stringify(response),
            headers: { 'Content-Type': 'application/json' },
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ details: "Failed to fetch events." }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
};
