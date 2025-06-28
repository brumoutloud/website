const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

// Helper to get the current time in 'Europe/London' timezone
const getBritishTime = () => {
    const now = new Date();
    return new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
};

// Helper to convert 12-hour time (e.g., "5pm", "12am") to 24-hour format (e.g., 17, 0)
const convertTo24Hour = (time12h) => {
    const [time, modifier] = time12h.match(/(\d+)(am|pm)/i).slice(1);
    let [hours, minutes] = time.split(':').map(Number);

    if (hours === 12) {
        hours = 0;
    }
    if (modifier.toLowerCase() === 'pm') {
        hours += 12;
    }
    return { hours, minutes: minutes || 0 };
};

// Parses the "Opening Hours" text field from Airtable
const parseOpeningHours = (openingHoursText) => {
    if (!openingHoursText) return null;
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const hours = {};
    const lines = openingHoursText.split('\n');
    lines.forEach(line => {
        const parts = line.split(': ');
        if (parts.length !== 2) return;
        const dayPart = parts[0];
        const timePart = parts[1];
        if (timePart.toLowerCase() === 'closed') {
            days.forEach(day => {
                if (dayPart.includes(day)) {
                    hours[day] = { closed: true };
                }
            });
        } else {
            const [start, end] = timePart.split(' - ');
            if (!start || !end) return;
            days.forEach(day => {
                if (dayPart.includes(day)) {
                    hours[day] = { start, end };
                }
            });
        }
    });
    return hours;
};

// Determines if a venue is open based on parsed opening hours
const getVenueStatus = (openingHours) => {
    if (!openingHours) return { isOpen: false, message: 'Opening times not available' };

    const now = getBritishTime();
    const dayOfWeek = now.getDay(); // Sunday - 0, Monday - 1, etc.
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDayStr = days[dayOfWeek];

    console.log(`[getVenueStatus] Current time (British): ${now.toLocaleTimeString()}, Day: ${currentDayStr}`);

    const todayHours = openingHours[currentDayStr];

    if (!todayHours || todayHours.closed) {
        console.log(`[getVenueStatus] Venue is closed today or no hours defined for ${currentDayStr}.`);
        // Check next open day
        for (let i = 1; i <= 7; i++) {
            const nextDayStr = days[(dayOfWeek + i) % 7];
            if (openingHours[nextDayStr] && !openingHours[nextDayStr].closed) {
                return { isOpen: false, message: `Opens ${nextDayStr} at ${openingHours[nextDayStr].start}` };
            }
        }
        return { isOpen: false, message: 'Closed' };
    }

    const { hours: startHour, minutes: startMinute } = convertTo24Hour(todayHours.start);
    const { hours: endHour, minutes: endMinute } = convertTo24Hour(todayHours.end);

    let startTime = new Date(now);
    startTime.setHours(startHour, startMinute, 0, 0);

    let endTime = new Date(now);
    endTime.setHours(endHour, endMinute, 0, 0);

    console.log(`[getVenueStatus] Today's hours: Start: ${todayHours.start}, End: ${todayHours.end}`);
    console.log(`[getVenueStatus] Converted times: startHour: ${startHour}, startMinute: ${startMinute}, endHour: ${endHour}, endMinute: ${endMinute}`);
    console.log(`[getVenueStatus] Calculated times: startTime: ${startTime.toLocaleTimeString()}, endTime: ${endTime.toLocaleTimeString()}`);

    // Handle overnight closing times (e.g., opens 10pm, closes 2am)
    if (endTime <= startTime) {
        // If current time is past midnight but before closing time (e.g., 1 AM, closes 2 AM)
        if (now < endTime) {
            startTime.setDate(startTime.getDate() - 1); // Start time was yesterday
            console.log(`[getVenueStatus] Overnight (now < endTime): Adjusted startTime to ${startTime.toLocaleTimeString()}`);
        } else {
            // If current time is after opening time but before midnight (e.g., 10 PM, closes 2 AM next day)
            endTime.setDate(endTime.getDate() + 1); // End time is tomorrow
            console.log(`[getVenueStatus] Overnight (now >= startTime): Adjusted endTime to ${endTime.toLocaleTimeString()}`);
        }
    }
    
    console.log(`[getVenueStatus] Final comparison: now (${now.toLocaleTimeString()}) vs startTime (${startTime.toLocaleTimeString()}) and endTime (${endTime.toLocaleTimeString()})`);

    if (now >= startTime && now <= endTime) {
        return { isOpen: true, message: `Closes at ${todayHours.end}` };
    } else if (now < startTime) {
        return { isOpen: false, message: `Opens at ${todayHours.start}` };
    } else {
        // It's past the closing time for today, find next opening day
        console.log(`[getVenueStatus] Past closing time for today.`);
        for (let i = 1; i <= 7; i++) {
            const nextDayStr = days[(dayOfWeek + i) % 7];
            if (openingHours[nextDayStr] && !openingHours[nextDayStr].closed) {
                const nextDayName = (i === 1) ? 'Tomorrow' : nextDayStr;
                return { isOpen: false, message: `Opens ${nextDayName} at ${openingHours[nextDayStr].start}` };
            }
        }
        return { isOpen: false, message: 'Closed' };
    }
};


exports.handler = async function (event, context) {
    try {
        const records = await base('Venues')
            .select({
                filterByFormula: "AND({Status} = 'Approved', {Listing Status} = 'Listed')",
                fields: [
                    'Name',
                    'Description',
                    'Slug',
                    'Photo URL',
                    'Photo Medium URL',
                    'Photo Thumbnail URL',
                    'Address',
                    'Opening Hours',
                    'Accessibility',
                    'Website',
                    'Instagram',
                    'Facebook',
                    'TikTok',
                    'Contact Email',
                    'Contact Phone',
                    'Accessibility Rating',
                    'Parking Exception',
                    'Vibe Tags',
                    'Venue Features',
                    'Google Rating',
                    'Number of Reviews'
                ],
                maxRecords: 100,
            })
            .all();

        const venues = records.map((record) => {
            const openingHoursText = record.get('Opening Hours');
            const venueName = record.get('Name');
            console.log(`Processing venue: ${venueName}, Opening Hours Text: ${openingHoursText}`);
            
            let openingHours = null;
            try {
                openingHours = parseOpeningHours(openingHoursText);
                console.log(`Parsed Opening Hours for ${venueName}: ${JSON.stringify(openingHours)}`);
            } catch (e) {
                console.error(`Error parsing opening hours for ${venueName}: ${e.message}`);
            }
            
            let openStatus = { isOpen: false, message: 'Error determining status' };
            try {
                openStatus = getVenueStatus(openingHours);
                console.log(`Open Status for ${venueName}: ${JSON.stringify(openStatus)}`);
            } catch (e) {
                console.error(`Error getting venue status for ${venueName}: ${e.message}`);
            }

            const photoData = {
                original: record.get('Photo URL') || null,
                medium: record.get('Photo Medium URL') || null,
                thumbnail: record.get('Photo Thumbnail URL') || null,
            };
            console.log(`Photo data for ${venueName}: ${JSON.stringify(photoData)}`);
            
            return {
                id: record.id,
                name: venueName,
                description: record.get('Description'),
                slug: record.get('Slug') || '',
                photo: photoData,
                address: record.get('Address') || '',
                openingHours: record.get('Opening Hours') || '',
                accessibility: record.get('Accessibility') || '',
                website: record.get('Website') || '',
                instagram: record.get('Instagram') || '',
                facebook: record.get('Facebook') || '',
                tiktok: record.get('TikTok') || '',
                contactEmail: record.get('Contact Email') || '',
                contactPhone: record.get('Contact Phone') || '',
                accessibilityRating: record.get('Accessibility Rating') || '',
                parkingException: record.get('Parking Exception') || '',
                vibeTags: record.get('Vibe Tags') || [],
                venueFeatures: record.get('Venue Features') || [],
                accessibilityFeatures: record.get('Accessibility Features') || [],
                googleRating: record.get('Google Rating') || 0,
                numberOfReviews: record.get('Number of Reviews') || 0,
                openStatus: openStatus // Add the open status object
            };
        });

        return {
            statusCode: 200,
            body: JSON.stringify(venues),
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
        };
    } catch (error) {
        console.error('Error fetching venues within handler:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch venues' }),
        };
    }
};