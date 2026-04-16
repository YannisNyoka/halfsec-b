import Product from '../models/Product.js';
import { validationResult } from 'express-validator';

// ── Get all active products with filtering, search, pagination (public) ────────
export const getProducts = async (req, res) => {
  try {
    const {
      search, category, condition, minPrice,
      maxPrice, featured, sort, page = 1, limit = 12,
    } = req.query;

    const filter = { isActive: true, stock: { $gt: 0 } };

    if (search) {
      filter.$text = { $search: search };
    }
    if (category) filter.category = category;
    if (condition) filter.condition = condition;
    if (featured === 'true') filter.isFeatured = true;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      'price-asc': { price: 1 },
      'price-desc': { price: -1 },
      popular: { sold: -1 },
    };
    const sortBy = sortOptions[sort] || { createdAt: -1 };

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name slug')
        .sort(sortBy)
        .skip(skip)
        .limit(limitNum)
        .select('-__v'),
      Product.countDocuments(filter),
    ]);

    res.status(200).json({
      products,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get single product by slug (public) ───────────────────────────────────────
export const getProductBySlug = async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug, isActive: true })
      .populate('category', 'name slug');
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    res.status(200).json({ product });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get all products including inactive (admin) ────────────────────────────────
export const getAllProductsAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      Product.find()
        .populate('category', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .select('-__v'),
      Product.countDocuments(),
    ]);

    res.status(200).json({
      products,
      pagination: { total, page: pageNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Create product (admin) ─────────────────────────────────────────────────────
export const createProduct = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const product = await Product.create(req.body);
    await product.populate('category', 'name slug');
    res.status(201).json({ message: 'Product created.', product });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A product with this name already exists.' });
    }
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Update product (admin) ─────────────────────────────────────────────────────
export const updateProduct = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('category', 'name slug');

    if (!product) return res.status(404).json({ message: 'Product not found.' });
    res.status(200).json({ message: 'Product updated.', product });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Delete product (admin) ─────────────────────────────────────────────────────
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    res.status(200).json({ message: 'Product deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Toggle featured (admin) ────────────────────────────────────────────────────
export const toggleFeatured = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    product.isFeatured = !product.isFeatured;
    await product.save();
    res.status(200).json({ message: `Product ${product.isFeatured ? 'featured' : 'unfeatured'}.`, product });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};