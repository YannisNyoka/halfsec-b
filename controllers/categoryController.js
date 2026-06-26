import Category from '../models/Category.js';
import cloudinary from '../config/cloudinary.js';
import { validationResult } from 'express-validator';

// ── Fetch a relevant photo from Unsplash for a category name ─────────────
const fetchUnsplashImage = async (query) => {
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=squarish`,
      { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } }
    );
    const data = await res.json();
    const photo = data?.results?.[0];
    if (!photo) return null;
    return {
      url: photo.urls.small,
      publicId: photo.id,
    };
  } catch (err) {
    console.error('Unsplash fetch error:', err.message);
    return null;
  }
};

// ── Get all active categories (public) ──────────────────────────────────
export const getCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ name: 1 });
    res.status(200).json({ categories });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get all categories including inactive (admin) ───────────────────────
export const getAllCategoriesAdmin = async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.status(200).json({ categories });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get single category by slug (public) ─────────────────────────────────
export const getCategoryBySlug = async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug, isActive: true });
    if (!category) return res.status(404).json({ message: 'Category not found.' });
    res.status(200).json({ category });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Create category (admin) ──────────────────────────────────────────────
export const createCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const { name, description } = req.body;

    const existing = await Category.findOne({ name: name.trim() });
    if (existing) return res.status(409).json({ message: 'Category already exists.' });

    const categoryData = { name, description };

    const image = await fetchUnsplashImage(name);
    if (image) categoryData.image = image;

    const category = await Category.create(categoryData);
    res.status(201).json({ message: 'Category created.', category });
  } catch (error) {
    console.error('CREATE CATEGORY ERROR:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Update category (admin) ──────────────────────────────────────────────
export const updateCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found.' });

    if (req.body.name !== undefined) category.name = req.body.name;
    if (req.body.description !== undefined) category.description = req.body.description;
    if (req.body.isActive !== undefined) category.isActive = req.body.isActive;

    if (req.body.name && req.body.name !== category.name) {
      const image = await fetchUnsplashImage(req.body.name);
      if (image) category.image = image;
    }

    await category.save();
    res.status(200).json({ message: 'Category updated.', category });
  } catch (error) {
    console.error('UPDATE CATEGORY ERROR:', error);
    res.status(500).json({ message: 'Server category error.' });
  }
};

// ── Delete category (admin) ──────────────────────────────────────────────
export const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found.' });

    await category.deleteOne();
    res.status(200).json({ message: 'Category deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── ONE-TIME MIGRATION: backfill Unsplash images for imageless categories ─
// Call once: POST /api/categories/migrate-images (admin only)
// Safe to call multiple times — skips categories that already have an image
export const migrateImages = async (req, res) => {
  try {
    const categories = await Category.find({
      $or: [
        { 'image.url': { $exists: false } },
        { 'image.url': null },
        { 'image.url': '' },
      ],
    });

    if (categories.length === 0) {
      return res.status(200).json({ message: 'All categories already have images.', updated: 0 });
    }

    const results = [];

    for (const cat of categories) {
      // Small delay between requests to stay within Unsplash rate limits
      await new Promise((r) => setTimeout(r, 300));

      const image = await fetchUnsplashImage(cat.name);
      if (image) {
        cat.image = image;
        await cat.save();
        results.push({ name: cat.name, status: 'updated', url: image.url });
      } else {
        results.push({ name: cat.name, status: 'no image found' });
      }
    }

    const updated = results.filter((r) => r.status === 'updated').length;
    res.status(200).json({
      message: `Migration complete. ${updated}/${categories.length} categories updated.`,
      updated,
      results,
    });
  } catch (error) {
    console.error('MIGRATE IMAGES ERROR:', error);
    res.status(500).json({ message: 'Migration failed.', error: error.message });
  }
};