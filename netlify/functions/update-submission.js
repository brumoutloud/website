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
    if (event.httpMethod !== 'PUT') {
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
        result[part.name] = part.data.toString('utf8');
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

    const toArray = (value) => {
      if (!value) return [];
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        return value.split(',').map(item => item.trim()).filter(item => item !== '');
      }
    };

    let table;
    let fieldsToUpdate = {};

    if (type === 'Event') {
      table = base('Events Pending Approval');

      fieldsToUpdate = {
        'Name': result.name,
        'Date': result.date,
        'Time': result.time,
        'Venue': toArray(result.venue),
        'Type': toArray(result.type_tags),
        'Genre': toArray(result.genre_tags),
        'Cost': result.cost,
        'Ticket Link': result.ticket_link,
        'Description': result.description,
        'Website': result.website,
        'Instagram': result.instagram,
        'Facebook': result.facebook,
        'TikTok': result.tiktok,
        'Contact Email': result.contact_email,
        'Contact Phone': result.contact_phone,
        'Internal Notes': result.internal_notes,
      };

      const photoFile = files.photo;
      if (photoFile && photoFile.data.length > 0) {
        const { original, medium, thumbnail } = await uploadImage(photoFile, 'brumoutloud_events');
        fieldsToUpdate['Photo'] = [{ url: original, filename: photoFile.filename }];
        fieldsToUpdate['Photo URL'] = original;
        fieldsToUpdate['Photo Medium URL'] = medium;
        fieldsToUpdate['Photo Thumbnail URL'] = thumbnail;
      }
    } else if (type === 'Venue') {
      table = base('Venues Pending Approval');

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
        'Contact Phone': result['contact-phone'],
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

    // Filter out undefined values to avoid overwriting existing data with nulls
    const filteredFields = Object.fromEntries(
      Object.entries(fieldsToUpdate).filter(([, value]) => value !== undefined)
    );

    await table.update(id, filteredFields);

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
