import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import { sendSellerApplicationReceived, sendSellerApprovalEmail } from '../utils/email.js';

// ── Apply to become a seller ───────────────────────────────────────────────────
export const applyAsSeller = async (req, res) => {
  try {
    const { businessName, bio, phone, bankDetails } = req.body;

    if (!businessName || !phone) {
      return res.status(400).json({ message: 'Business name and phone are required.' });
    }
    if (!bankDetails?.accountHolder || !bankDetails?.bankName ||
        !bankDetails?.accountNumber || !bankDetails?.branchCode) {
      return res.status(400).json({ message: 'Complete banking details are required for payouts.' });
    }

    const user = await User.findById(req.user.id);

    if (user.sellerProfile?.status === 'pending') {
      return res.status(409).json({ message: 'Your application is already pending review.' });
    }
    if (user.sellerProfile?.status === 'approved') {
      return res.status(409).json({ message: 'You are already an approved seller.' });
    }

    user.sellerProfile = {
      businessName: businessName.trim(),
      bio: bio?.trim() || '',
      phone: phone.trim(),
      bankDetails: {
        accountHolder: bankDetails.accountHolder.trim(),
        bankName: bankDetails.bankName.trim(),
        accountNumber: bankDetails.accountNumber.trim(),
        branchCode: bankDetails.branchCode.trim(),
      },
      status: 'pending',
      appliedAt: new Date(),
    };

    await user.save();

    try {
      sendSellerApplicationReceived(user.email, user.name);
    } catch {}

    res.status(200).json({
      message: 'Application submitted! We will review it within 1-2 business days.',
      status: 'pending',
    });
  } catch (error) {
    console.error('Seller application error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get my seller profile / status ─────────────────────────────────────────────
export const getMyApplicationStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('sellerProfile');
    res.status(200).json({ sellerProfile: user.sellerProfile || { status: 'none' } });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Update seller profile (approved sellers) ────────────────────────────────────
export const updateSellerProfile = async (req, res) => {
  try {
    const { businessName, bio, phone, bankDetails } = req.body;
    const user = await User.findById(req.user.id);

    if (businessName) user.sellerProfile.businessName = businessName.trim();
    if (bio !== undefined) user.sellerProfile.bio = bio.trim();
    if (phone) user.sellerProfile.phone = phone.trim();
    if (bankDetails) {
      user.sellerProfile.bankDetails = {
        ...user.sellerProfile.bankDetails,
        ...bankDetails,
      };
    }

    await user.save();
    res.status(200).json({ message: 'Profile updated.', sellerProfile: user.sellerProfile });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get seller dashboard stats ───────────────────────────────────────────────────
export const getSellerStats = async (req, res) => {
  try {
    const sellerId = req.user.id;

    const [totalProducts, activeProducts, outOfStock, salesData] = await Promise.all([
      Product.countDocuments({ seller: sellerId }),
      Product.countDocuments({ seller: sellerId, isActive: true, stock: { $gt: 0 } }),
      Product.countDocuments({ seller: sellerId, stock: 0 }),
      Order.aggregate([
        { $unwind: '$items' },
        { $match: { 'items.seller': new (await import('mongoose')).default.Types.ObjectId(sellerId) } },
        {
          $group: {
            _id: null,
            totalSold: { $sum: '$items.quantity' },
            totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
            totalOrders: { $sum: 1 },
          },
        },
      ]),
    ]);

    res.status(200).json({
      stats: {
        totalProducts,
        activeProducts,
        outOfStock,
        totalSold: salesData[0]?.totalSold || 0,
        totalRevenue: salesData[0]?.totalRevenue || 0,
        totalOrders: salesData[0]?.totalOrders || 0,
      },
    });
  } catch (error) {
    console.error('Seller stats error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get my products ─────────────────────────────────────────────────────────────
export const getMyProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const skip = (pageNum - 1) * parseInt(limit);

    const [products, total] = await Promise.all([
      Product.find({ seller: req.user.id })
        .populate('category', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Product.countDocuments({ seller: req.user.id }),
    ]);

    res.status(200).json({
      products,
      pagination: { total, page: pageNum, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Create product (as seller) ───────────────────────────────────────────────────
export const createSellerProduct = async (req, res) => {
  try {
    const product = await Product.create({
      ...req.body,
      seller: req.user.id,
    });
    res.status(201).json({ message: 'Product listed.', product });
  } catch (error) {
    console.error('Create seller product error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Update product (own only) ─────────────────────────────────────────────────────
export const updateSellerProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      seller: req.user.id,
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    Object.assign(product, req.body);
    await product.save();

    res.status(200).json({ message: 'Product updated.', product });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Delete product (own only) ──────────────────────────────────────────────────────
export const deleteSellerProduct = async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({
      _id: req.params.id,
      seller: req.user.id,
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    res.status(200).json({ message: 'Product deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get single own product (for edit form) ───────────────────────────────────────
export const getSellerProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      seller: req.user.id,
    }).populate('category', 'name');

    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    res.status(200).json({ product });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get orders containing my products ──────────────────────────────────────────────
export const getSellerOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const skip = (pageNum - 1) * parseInt(limit);
    const mongoose = (await import('mongoose')).default;
    const sellerId = new mongoose.Types.ObjectId(req.user.id);

    const matchStage = { 'items.seller': sellerId };

    const [orders, totalResult] = await Promise.all([
      Order.aggregate([
        { $match: { 'items.seller': sellerId } },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) },
        {
          $lookup: {
            from: 'users',
            localField: 'user',
            foreignField: '_id',
            as: 'customer',
          },
        },
        { $unwind: '$customer' },
        {
          $project: {
            orderNumber: 1,
            orderStatus: 1,
            paymentStatus: 1,
            createdAt: 1,
            'customer.name': 1,
            items: {
              $filter: {
                input: '$items',
                as: 'item',
                cond: { $eq: ['$$item.seller', sellerId] },
              },
            },
          },
        },
      ]),
      Order.aggregate([
        { $match: matchStage },
        { $count: 'total' },
      ]),
    ]);

    const total = totalResult[0]?.total || 0;

    res.status(200).json({
      orders,
      pagination: { total, page: pageNum, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error('Seller orders error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// ADMIN — manage seller applications
// ════════════════════════════════════════════════════════════════════════════════

// ── Get all seller applications/sellers ──────────────────────────────────────────
export const getAllSellers = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { 'sellerProfile.status': { $exists: true, $ne: 'none' } };
    if (status) filter['sellerProfile.status'] = status;

    const sellers = await User.find(filter)
      .select('name email sellerProfile createdAt')
      .sort({ 'sellerProfile.appliedAt': -1 });

    res.status(200).json({ sellers });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Approve seller ────────────────────────────────────────────────────────────────
export const approveSeller = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.sellerProfile?.status !== 'pending') {
      return res.status(404).json({ message: 'Pending application not found.' });
    }

    user.sellerProfile.status = 'approved';
    user.sellerProfile.approvedAt = new Date();
    await user.save();

    try {
      sendSellerApprovalEmail(user.email, user.name);
    } catch {}

    res.status(200).json({ message: 'Seller approved.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Reject seller ─────────────────────────────────────────────────────────────────
export const rejectSeller = async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user || user.sellerProfile?.status !== 'pending') {
      return res.status(404).json({ message: 'Pending application not found.' });
    }

    user.sellerProfile.status = 'rejected';
    user.sellerProfile.rejectionReason = reason || '';
    await user.save();

    res.status(200).json({ message: 'Application rejected.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Suspend / reinstate an approved seller ───────────────────────────────────────
export const toggleSellerSuspension = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || !['approved', 'suspended'].includes(user.sellerProfile?.status)) {
      return res.status(404).json({ message: 'Seller not found.' });
    }

    user.sellerProfile.status =
      user.sellerProfile.status === 'approved' ? 'suspended' : 'approved';
    await user.save();

    res.status(200).json({
      message: `Seller ${user.sellerProfile.status}.`,
      status: user.sellerProfile.status,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};