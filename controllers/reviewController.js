import Review from '../models/Review.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';

// ── Helper: recalculate product rating ────────────────────────────────────────
const updateProductRating = async (productId) => {
  const result = await Review.aggregate([
    { $match: { product: productId } },
    {
      $group: {
        _id: '$product',
        average: { $avg: '$rating' },
        count: { $sum: 1 },
      },
    },
  ]);

  const average = result[0]?.average
    ? Math.round(result[0].average * 10) / 10
    : 0;
  const count = result[0]?.count || 0;

  await Product.findByIdAndUpdate(productId, {
    'rating.average': average,
    'rating.count': count,
  });
};

// ── Get reviews for a product ──────────────────────────────────────────────────
export const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(20, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

    const [reviews, total] = await Promise.all([
      Review.find({ product: productId })
        .populate('user', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Review.countDocuments({ product: productId }),
    ]);

    // Rating distribution
    const distribution = await Review.aggregate([
      { $match: { product: new (await import('mongoose')).default.Types.ObjectId(productId) } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]);

    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    distribution.forEach((d) => { dist[d._id] = d.count; });

    res.status(200).json({
      reviews,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
      },
      distribution: dist,
    });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Create review ──────────────────────────────────────────────────────────────
export const createReview = async (req, res) => {
  try {
    const { productId, rating, title, body } = req.body;

    if (!productId || !rating) {
      return res.status(400).json({ message: 'Product and rating are required.' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5.' });
    }

    // Check product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    // Check if already reviewed
    const existing = await Review.findOne({
      product: productId,
      user: req.user.id,
    });
    if (existing) {
      return res.status(409).json({
        message: 'You have already reviewed this product.',
      });
    }

    // Check if user purchased this product
    const purchased = await Order.findOne({
      user: req.user.id,
      'items.product': productId,
      orderStatus: 'delivered',
    });

    const review = await Review.create({
      product: productId,
      user: req.user.id,
      rating,
      title: title?.trim(),
      body: body?.trim(),
      verified: !!purchased,
    });

    await review.populate('user', 'name');

    // Update product rating
    await updateProductRating(product._id);

    res.status(201).json({ message: 'Review submitted.', review });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'You have already reviewed this product.',
      });
    }
    console.error('Create review error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Update review ──────────────────────────────────────────────────────────────
export const updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, title, body } = req.body;

    const review = await Review.findOne({ _id: id, user: req.user.id });
    if (!review) {
      return res.status(404).json({ message: 'Review not found.' });
    }

    if (rating) review.rating = rating;
    if (title !== undefined) review.title = title?.trim();
    if (body !== undefined) review.body = body?.trim();
    await review.save();

    await updateProductRating(review.product);
    await review.populate('user', 'name');

    res.status(200).json({ message: 'Review updated.', review });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Delete review ──────────────────────────────────────────────────────────────
export const deleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findOne({
      _id: id,
      $or: [
        { user: req.user.id },
        ...(req.user.role === 'admin' ? [{}] : []),
      ],
    });

    if (!review) {
      return res.status(404).json({ message: 'Review not found.' });
    }

    const productId = review.product;
    await review.deleteOne();
    await updateProductRating(productId);

    res.status(200).json({ message: 'Review deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get my review for a product ────────────────────────────────────────────────
export const getMyReview = async (req, res) => {
  try {
    const { productId } = req.params;
    const review = await Review.findOne({
      product: productId,
      user: req.user.id,
    });
    res.status(200).json({ review });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Admin: get all reviews ─────────────────────────────────────────────────────
export const getAllReviewsAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const skip = (pageNum - 1) * parseInt(limit);

    const [reviews, total] = await Promise.all([
      Review.find()
        .populate('user', 'name email')
        .populate('product', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Review.countDocuments(),
    ]);

    res.status(200).json({
      reviews,
      pagination: { total, page: pageNum, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};