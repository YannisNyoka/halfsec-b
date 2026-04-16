import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { Readable } from 'stream';

// ✅ Environment variable safety check
if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  throw new Error('Cloudinary environment variables are missing');
}

// ✅ Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ Stronger file validation
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

// ✅ Multer setup (memory storage)
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WEBP allowed.'), false);
    }
  },
});

// ✅ Upload buffer to Cloudinary using stream
export const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'halfsec/products',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [
          {
            width: 800,
            height: 800,
            crop: 'limit',
            quality: 'auto',
          },
        ],
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary Upload Error:', error);
          return reject(error);
        }
        resolve(result);
      }
    );

    // ✅ Extra stream-level error handling
    stream.on('error', (err) => {
      console.error('Stream Error:', err);
      reject(err);
    });

    // ✅ Pipe buffer to Cloudinary
    Readable.from(buffer).pipe(stream);
  });
};

// ✅ Optional: helper for deleting images later
export const deleteFromCloudinary = async (publicId) => {
  if (!publicId) throw new Error('publicId is required for deletion');

  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary Deletion Error:', error);
    throw error;
  }
};

export default cloudinary;