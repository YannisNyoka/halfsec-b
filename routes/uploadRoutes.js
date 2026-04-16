import express from 'express';
import { upload, uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// Upload multiple images (admin only)
router.post(
  '/',
  protect,
  adminOnly,
  upload.array('images', 5),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No images uploaded.' });
      }

      // ✅ Upload each image buffer to Cloudinary
      const uploadPromises = req.files.map((file) =>
        uploadToCloudinary(file.buffer)
      );

      const results = await Promise.all(uploadPromises);

      const images = results.map((result) => ({
        url: result.secure_url,     // ✅ correct
        publicId: result.public_id, // ✅ correct
      }));

      res.status(200).json({
        message: 'Images uploaded.',
        images,
      });

    } catch (error) {
      console.error('UPLOAD ERROR:', error);
      res.status(500).json({ message: error.message || 'Upload failed.' });
    }
  }
);

// Delete image from Cloudinary (admin only)
router.delete('/:publicId', protect, adminOnly, async (req, res) => {
  try {
    const publicId = decodeURIComponent(req.params.publicId);

    // ✅ Use your helper (cleaner)
    await deleteFromCloudinary(publicId);

    res.status(200).json({ message: 'Image deleted.' });

  } catch (error) {
    console.error('DELETE ERROR:', error);
    res.status(500).json({ message: error.message || 'Delete failed.' });
  }
});

export default router;