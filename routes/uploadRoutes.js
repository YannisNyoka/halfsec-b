import express from 'express';
import { upload, uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';
import { protect, adminOnly, sellerOnly } from '../middleware/auth.js';

const router = express.Router();

// Allow either an admin OR an approved seller to upload images
const adminOrSeller = (req, res, next) => {
  const isAdmin = req.user?.role === 'admin';
  const isApprovedSeller = req.user?.sellerProfile?.status === 'approved';

  if (!isAdmin && !isApprovedSeller) {
    return res.status(403).json({ message: 'Not authorised to upload images.' });
  }
  next();
};

// Upload multiple images (admin OR approved seller)
router.post(
  '/',
  protect,
  adminOrSeller,
  (req, res, next) => {
    upload.array('images', 5)(req, res, (err) => {
      if (err) {
        console.error('MULTER ERROR:', err.message);
        return res.status(400).json({ message: err.message || 'Upload failed.' });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No images uploaded.' });
      }

      const uploadPromises = req.files.map((file) =>
        uploadToCloudinary(file.buffer)
      );

      const results = await Promise.all(uploadPromises);

      const images = results.map((result) => ({
        url: result.secure_url,
        publicId: result.public_id,
      }));

      res.status(200).json({ message: 'Images uploaded.', images });

    } catch (error) {
      console.error('UPLOAD ERROR:', error);
      res.status(500).json({ message: error.message || 'Upload failed.' });
    }
  }
);

// Delete image from Cloudinary (admin OR approved seller)
router.delete('/:publicId', protect, adminOrSeller, async (req, res) => {
  try {
    const publicId = decodeURIComponent(req.params.publicId);
    await deleteFromCloudinary(publicId);
    res.status(200).json({ message: 'Image deleted.' });
  } catch (error) {
    console.error('DELETE ERROR:', error);
    res.status(500).json({ message: error.message || 'Delete failed.' });
  }
});

export default router;