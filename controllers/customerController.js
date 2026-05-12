import User from '../models/User.js';
import Order from '../models/Order.js';

// ── Get all customers ──────────────────────────────────────────────────────────
export const getAllCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const skip = (pageNum - 1) * parseInt(limit);

    const filter = {
      role: 'customer',
      ...(search ? {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ],
      } : {}),
    };

    const [customers, total] = await Promise.all([
      User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(filter),
    ]);

    // Get order stats per customer
    const customerIds = customers.map((c) => c._id);
    const orderStats = await Order.aggregate([
      { $match: { user: { $in: customerIds } } },
      {
        $group: {
          _id: '$user',
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$total' },
          lastOrderDate: { $max: '$createdAt' },
        },
      },
    ]);

    const statsMap = {};
    orderStats.forEach((s) => {
      statsMap[s._id.toString()] = s;
    });

    const enriched = customers.map((c) => ({
      ...c.toObject(),
      stats: statsMap[c._id.toString()] || {
        totalOrders: 0,
        totalSpent: 0,
        lastOrderDate: null,
      },
    }));

    res.status(200).json({
      customers: enriched,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get single customer ────────────────────────────────────────────────────────
export const getCustomer = async (req, res) => {
  try {
    const customer = await User.findOne({
      _id: req.params.id,
      role: 'customer',
    }).select('-password');

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found.' });
    }

    const [orders, stats] = await Promise.all([
      Order.find({ user: req.params.id })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('orderNumber total orderStatus paymentStatus createdAt'),
      Order.aggregate([
        { $match: { user: customer._id } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalSpent: { $sum: '$total' },
            avgOrderValue: { $avg: '$total' },
          },
        },
      ]),
    ]);

    res.status(200).json({
      customer,
      orders,
      stats: stats[0] || { totalOrders: 0, totalSpent: 0, avgOrderValue: 0 },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Toggle customer active status ──────────────────────────────────────────────
export const toggleCustomerStatus = async (req, res) => {
  try {
    const customer = await User.findOne({
      _id: req.params.id,
      role: 'customer',
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found.' });
    }

    customer.isActive = !customer.isActive;
    await customer.save();

    res.status(200).json({
      message: `Customer ${customer.isActive ? 'activated' : 'deactivated'}.`,
      isActive: customer.isActive,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};