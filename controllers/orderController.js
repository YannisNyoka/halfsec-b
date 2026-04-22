import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import { validationResult } from 'express-validator';
import { sendOrderConfirmation, sendAdminOrderAlert, sendOrderStatusUpdate } from '../utils/email.js';

// ── Place order ────────────────────────────────────────────────────────────────
export const placeOrder = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const { shippingAddress, paymentMethod, notes } = req.body;

    const cart = await Cart.findOne({ user: req.user.id })
      .populate('items.product', 'name images price stock isActive');

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: 'Your cart is empty.' });
    }

    for (const item of cart.items) {
      if (!item.product || !item.product.isActive) {
        return res.status(400).json({ message: 'A product in your cart is no longer available.' });
      }
      if (item.product.stock < item.quantity) {
        return res.status(400).json({
          message: `"${item.product.name}" only has ${item.product.stock} item(s) in stock.`,
        });
      }
    }

    const orderItems = cart.items.map((item) => ({
      product: item.product._id,
      name: item.product.name,
      image: item.product.images[0]?.url || '',
      price: item.priceAtAdd,
      quantity: item.quantity,
    }));

    const itemsTotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const shippingCost = itemsTotal >= 500 ? 0 : 80;
    const total = itemsTotal + shippingCost;

    const order = await Order.create({
      user: req.user.id,
      items: orderItems,
      shippingAddress,
      paymentMethod,
      itemsTotal,
      shippingCost,
      total,
      notes,
    });

    await Promise.all(
      cart.items.map((item) =>
        Product.findByIdAndUpdate(item.product._id, {
          $inc: { stock: -item.quantity, sold: item.quantity },
        })
      )
    );

    await Cart.findOneAndDelete({ user: req.user.id });

    // Send emails — non-blocking, failure won't break the order
    try {
      const customer = await User.findById(req.user.id).select('name email');
      if (customer) {
        sendOrderConfirmation(order, customer.email, customer.name);
        sendAdminOrderAlert(order, customer.name, customer.email);
      }
    } catch (emailErr) {
      console.error('Email send failed (non-fatal):', emailErr.message);
    }

    res.status(201).json({ message: 'Order placed successfully.', order });
  } catch (error) {
    console.error('Place order error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get my orders ──────────────────────────────────────────────────────────────
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .sort({ createdAt: -1 }).select('-__v');
    res.status(200).json({ orders });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get single order (customer) ────────────────────────────────────────────────
export const getMyOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user.id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    res.status(200).json({ order });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get all orders (admin) ─────────────────────────────────────────────────────
export const getAllOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { orderStatus: status } : {};
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip).limit(limitNum),
      Order.countDocuments(filter),
    ]);

    res.status(200).json({
      orders,
      pagination: { total, page: pageNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get single order (admin) ───────────────────────────────────────────────────
export const getOrderAdmin = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name email phone');
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    res.status(200).json({ order });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Update order status (admin) ────────────────────────────────────────────────
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderStatus, paymentStatus } = req.body;

    const validOrderStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    const validPaymentStatuses = ['pending', 'paid', 'failed', 'refunded'];

    if (orderStatus && !validOrderStatuses.includes(orderStatus)) {
      return res.status(400).json({ message: 'Invalid order status.' });
    }
    if (paymentStatus && !validPaymentStatuses.includes(paymentStatus)) {
      return res.status(400).json({ message: 'Invalid payment status.' });
    }

    const updates = {};
    if (orderStatus) updates.orderStatus = orderStatus;
    if (paymentStatus) {
      updates.paymentStatus = paymentStatus;
      if (paymentStatus === 'paid') updates.paidAt = new Date();
    }
    if (orderStatus === 'delivered') updates.deliveredAt = new Date();

    const order = await Order.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('user', 'name email');
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    // Send status update email — non-blocking
    try {
      if (orderStatus && order.user?.email) {
        sendOrderStatusUpdate(order, order.user.email, order.user.name);
      }
    } catch (emailErr) {
      console.error('Status email failed (non-fatal):', emailErr.message);
    }

    res.status(200).json({ message: 'Order updated.', order });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Dashboard stats (admin) ────────────────────────────────────────────────────
export const getDashboardStats = async (req, res) => {
  try {
    const [totalOrders, totalRevenue, pendingOrders, deliveredOrders] = await Promise.all([
      Order.countDocuments(),
      Order.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Order.countDocuments({ orderStatus: 'pending' }),
      Order.countDocuments({ orderStatus: 'delivered' }),
    ]);

    res.status(200).json({
      stats: {
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        pendingOrders,
        deliveredOrders,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};