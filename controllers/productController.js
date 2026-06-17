import Product from '../models/Product.js';
import { validationResult } from 'express-validator';
import Category from '../models/Category.js';

// ── Get all active products with filtering, search, pagination (public) ────────
export const getProducts = async (req, res) => {
  try {
    const {
      search,
      category,
      condition,
      minPrice,
      maxPrice,
      sort = 'newest',
      featured,
      seller,
      page = 1,
      limit = 20,
      inStock,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

    // ── Build filter ─────────────────────────────────────────────────────────────
    const filter = {
      isActive: true,
      $or: [
        { moderationStatus: 'approved' },
        { moderationStatus: { $exists: false } },
        { moderationStatus: null },
      ],
    };

    // Full-text search across name, description, tags
    if (search?.trim()) {
      const regex = new RegExp(search.trim().split(/\s+/).join('|'), 'i');
      filter.$and = [
        {
          $or: [
            { name: { $regex: search.trim(), $options: 'i' } },
            { description: { $regex: search.trim(), $options: 'i' } },
            { tags: { $in: [new RegExp(search.trim(), 'i')] } },
          ],
        },
      ];
    }

    if (category) filter.category = category;

    // Support multiple conditions: condition=good,like+new
    if (condition) {
      const conditions = condition.split(',').map((c) => c.trim());
      filter.condition = { $in: conditions };
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    if (featured === 'true') filter.isFeatured = true;
    if (seller) filter.seller = seller;
    if (inStock === 'true') filter.stock = { $gt: 0 };

    // ── Sort ─────────────────────────────────────────────────────────────────────
    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      popular: { sold: -1 },
      rating: { 'rating.average': -1 },
    };
    const sortQuery = sortOptions[sort] || sortOptions.newest;

    // ── Execute ───────────────────────────────────────────────────────────────────
    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name')
        .populate('seller', 'name sellerProfile.businessName sellerProfile.rating')
        .sort(sortQuery)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(filter),
    ]);

    // ── Price range for current filter (excluding price filter) ──────────────────
    const priceFilter = { ...filter };
    delete priceFilter.price;
    const priceRange = await Product.aggregate([
      { $match: priceFilter },
      {
        $group: {
          _id: null,
          min: { $min: '$price' },
          max: { $max: '$price' },
        },
      },
    ]);

    res.status(200).json({
      products,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
      priceRange: priceRange[0]
        ? { min: priceRange[0].min, max: priceRange[0].max }
        : { min: 0, max: 10000 },
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get single product by slug (public) ───────────────────────────────────────
export const getProductBySlug = async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug, isActive: true })
      .populate('category', 'name slug')
      .populate('seller', 'name sellerProfile.businessName sellerProfile.rating');
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
        .populate('seller', 'name sellerProfile.businessName sellerProfile.rating')
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
    await product.populate('seller', 'name sellerProfile.businessName sellerProfile.rating');
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
    ).populate('category', 'name slug')
     .populate('seller', 'name sellerProfile.businessName sellerProfile.rating');

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

// ── Admin: get products pending moderation ───────────────────────────────────────
export const getPendingProducts = async (req, res) => {
  try {
    const products = await Product.find({ moderationStatus: 'pending' })
      .populate('seller', 'name sellerProfile.businessName')
      .populate('category', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({ products });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Admin: approve/reject a product listing ───────────────────────────────────────
export const moderateProduct = async (req, res) => {
  try {
    const { action, note } = req.body; // 'approve' | 'reject'

    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found.' });

    if (action === 'approve') {
      product.moderationStatus = 'approved';
      product.isActive = true;
    } else if (action === 'reject') {
      product.moderationStatus = 'rejected';
      product.isActive = false;
      product.moderationNote = note?.trim() || '';
    } else {
      return res.status(400).json({ message: 'Invalid action.' });
    }

    await product.save();
    res.status(200).json({ message: `Product ${action}d.`, product });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

export const getSearchSuggestions = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q?.trim() || q.trim().length < 2) {
      return res.status(200).json({ suggestions: [] });
    }

    const regex = new RegExp(q.trim(), 'i');

    const [products, categories] = await Promise.all([
      Product.find({
        isActive: true,
        $or: [
          { name: { $regex: regex } },
          { tags: { $in: [regex] } },
        ],
      })
        .select('name images price slug condition')
        .limit(5)
        .lean(),
      Category.find({ name: { $regex: regex } })
        .select('name')
        .limit(3)
        .lean(),
    ]);

    // Also get matching tags
    const tagResults = await Product.aggregate([
      { $match: { isActive: true, tags: { $in: [regex] } } },
      { $unwind: '$tags' },
      { $match: { tags: { $regex: regex } } },
      { $group: { _id: '$tags' } },
      { $limit: 4 },
    ]);

    res.status(200).json({
      suggestions: {
        products,
        categories,
        tags: tagResults.map((t) => t._id),
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};