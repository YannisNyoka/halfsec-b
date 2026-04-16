import Category from '../models/Category.js';
import { validationResult } from 'express-validator';

// ── Get all active categories (public) ───────────────────────────────────────
export const getCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ name: 1 });
    res.status(200).json({ categories });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get all categories including inactive (admin) ─────────────────────────────
export const getAllCategoriesAdmin = async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.status(200).json({ categories });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get single category by slug (public) ─────────────────────────────────────
export const getCategoryBySlug = async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug, isActive: true });
    if (!category) return res.status(404).json({ message: 'Category not found.' });
    res.status(200).json({ category });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Create category (admin) ───────────────────────────────────────────────────
export const createCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const { name, description } = req.body;

    const existing = await Category.findOne({ name: name.trim() });
    if (existing) return res.status(409).json({ message: 'Category already exists.' });

    const category = await Category.create({ name, description });
    res.status(201).json({ message: 'Category created.', category });
  } catch (error) {
    console.error('CREATE CATEGORY ERROR:', error); // ← add this
    res.status(500).json({ message: error.message }); // ← show real message
  }
};

// ── Update category (admin) ───────────────────────────────────────────────────
export const updateCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!category) return res.status(404).json({ message: 'Category not found.' });
    res.status(200).json({ message: 'Category updated.', category });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Delete category (admin) ───────────────────────────────────────────────────
export const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found.' });
    res.status(200).json({ message: 'Category deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};