const Airtable = require('airtable');
const multipart = require('parse-multipart');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

exports.handler = async (event, context) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: 'Method Not Allowed',
      };
    }

    const contentType = event.headers['content-type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return {
        statusCode: 400,
        body: 'Invalid Content-Type. Must be multipart/form-data',
      };
    }

    const boundary = multipart.getBoundary(contentType);
    const parts = multipart.parse(Buffer.from(event.body, 'base64'), boundary);

    const result = {};
    const files = {};

    parts.forEach(part => {
      if (part.filename) {
        files[part.name] = {
          filename: part.filename,
          type: part.type,
          data: part.data,
        };
      } else {
        // Handle array values like categories by pushing to an array if key already exists
        if (result[part.name] && !Array.isArray(result[part.name])) {
            result[part.name] = [result[part.name]]; // Convert to array if it's a single value already
        }
        if (Array.isArray(result[part.name])) {
            result[part.name].push(part.data.toString('utf8'));
        } else {
            result[part.name] = part.data.toString('utf8');
        }
      }
    });

    const { type, id } = result;

    if (!type || !id) {
      return {
        statusCode: 400,
        body: 'Missing type or id',
      };
    }

    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
      process.env.AIRTABLE_BASE_ID
    );

    const uploadImage = async (file, folder) => {
      return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({
          folder: folder,
          eager: [
            { width: 1200, quality: "auto:good", fetch_format: "auto" },
            { width: 400, height: 400, crop: "fill", quality: "auto:good", fetch_format: "auto" }
          ]
        }, (error, uploadResult) => {
          if (error) {
            console.error("Cloudinary upload error:", error);
            return reject(error);
          }
          resolve({
            original: uploadResult.secure_url,
            medium: uploadResult.eager[0].secure_url,
            thumbnail: uploadResult.eager[1].secure_url
          });
        }).end(file.data);
      });
    };

    // This helper now assumes multipart.parse already handled multi-value fields into arrays
    const toArray = (value) => {
        if (value === undefined || value === null || value === '') return [];
        if (Array.isArray(value)) {
            return value;
        }
        // Fallback for single strings that should be arrays (e.g., if a single checkbox was selected)
        return [value];
    };


    let table;
    let fieldsToUpdate = {};

    if (type === 'Event') {
      table = base('Events'); 

      // NEW HYBRID VENUE LOGIC
      const linkedVenueId = result.linkedVenueId; 
      const venueNameText = result.venueNameText; 

      if (linkedVenueId && linkedVenueId !== '') {
          fieldsToUpdate['Venue'] = [linkedVenueId]; 
          fieldsToUpdate['VenueText'] = null; 
      } else {
          fieldsToUpdate['VenueText'] = venueNameText || ''; 
          fieldsToUpdate['Venue'] = null; 
      }

      fieldsToUpdate = {
        ...fieldsToUpdate, 
        'Event Name': result['Event Name'], 
        'Date': result.date,
        'Time': result.time,
        'Description': result.Description, 
        'Link': result.Link, 
        'Parent Event Name': result['Parent Event Name'],
        'Recurring Info': result['Recurring Info'], 
        'Category': toArray(result.Category), 
      };

      const promoImageFile = files.promoImage; 
      if (promoImageFile && promoImageFile.data.length > 0) {
        const { original, medium, thumbnail } = await uploadImage(promoImageFile, 'brumoutloud_events');
        fieldsToUpdate['Promo Image'] = [{ url: original, filename: promoImageFile.filename }];
      }
      
    } else if (type === 'Venue') {
      table = base('Venues'); 

      fieldsToUpdate = {
        'Name': result.name,
        'Address': result.address,
        'Description': result.description,
        'Opening Hours': result.opening_hours,
        'Accessibility': result.accessibility,
        'Vibe Tags': toArray(result['vibe-tags']),
        'Venue Features': toArray(result['venue-features']),
        'Accessibility Rating': result['accessibility-rating'],
        'Accessibility Features': toArray(result['accessibility-features']),
        'Parking Exception': result['parking-exception'],
        'Contact Email': result['contact-email'],
        'Contact Phone': result['contact_phone'], 
        'Website': result.website,
        'Instagram': result.instagram,
        'Facebook': result.facebook,
        'TikTok': result.tiktok,
      };

      const photoFile = files.photo;
      if (photoFile && photoFile.data.length > 0) {
        const { original, medium, thumbnail } = await uploadImage(photoFile, 'brumoutloud_venues');
        fieldsToUpdate['Photo'] = [{ url: original, filename: photoFile.filename }];
        fieldsToUpdate['Photo URL'] = original;
        fieldsToUpdate['Photo Medium URL'] = medium;
        fieldsToUpdate['Photo Thumbnail URL'] = thumbnail;
      }
    } else {
      return {
        statusCode: 400,
        body: 'Unsupported submission type',
      };
    }

    const finalFields = {};
    for (const key in fieldsToUpdate) {
        if (fieldsToUpdate[key] !== undefined) {
            if ((key === 'Venue' || key === 'Photo' || key === 'Promo Image') && (fieldsToUpdate[key] === null || fieldsToUpdate[key].length === 0)) {
                finalFields[key] = null;
            } else if (fieldsToUpdate[key] === '') { 
                finalFields[key] = '';
            } else {
                finalFields[key] = fieldsToUpdate[key];
            }
        }
    }

    await table.update(id, finalFields);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `${type} updated successfully` }),
    };
  } catch (error) {
    console.error('Error updating submission:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to update submission', details: error.message }),
    };
  }
};
