import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';

// ── Main analytics ─────────────────────────────────────────────────────────────
export const getAnalytics = async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - days);

    // ── Run all queries in parallel ──────────────────────────────────────────
    const [
      totalRevenueData,
      prevRevenueData,
      totalOrders,
      prevOrders,
      totalCustomers,
      prevCustomers,
      revenueByDay,
      ordersByStatus,
      topProducts,
      recentOrders,
      ordersByPayment,
    ] = await Promise.all([

      // Current period revenue
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: startDate } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),

      // Previous period revenue
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: prevStartDate, $lt: startDate } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),

      // Current period orders
      Order.countDocuments({ createdAt: { $gte: startDate } }),

      // Previous period orders
      Order.countDocuments({ createdAt: { $gte: prevStartDate, $lt: startDate } }),

      // Current period new customers
      User.countDocuments({ role: 'customer', createdAt: { $gte: startDate } }),

      // Previous period new customers
      User.countDocuments({ role: 'customer', createdAt: { $gte: prevStartDate, $lt: startDate } }),

      // Revenue by day for chart
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            revenue: { $sum: '$total' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Orders by status
      Order.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Top selling products
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: startDate } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            name: { $first: '$items.name' },
            image: { $first: '$items.image' },
            totalSold: { $sum: '$items.quantity' },
            totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 5 },
      ]),

      // Recent orders
      Order.find({ createdAt: { $gte: startDate } })
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .limit(5)
        .select('orderNumber total orderStatus paymentStatus createdAt user'),

      // Orders by payment method
      Order.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$paymentMethod', count: { $sum: 1 }, revenue: { $sum: '$total' } } },
        { $sort: { revenue: -1 } },
      ]),
    ]);

    // ── Calculate percentage changes ─────────────────────────────────────────
    const currentRevenue = totalRevenueData[0]?.total || 0;
    const prevRevenue = prevRevenueData[0]?.total || 0;
    const revenueChange = prevRevenue === 0
      ? 100
      : Math.round(((currentRevenue - prevRevenue) / prevRevenue) * 100);

    const prevOrderCount = prevOrders || 0;
    const ordersChange = prevOrderCount === 0
      ? 100
      : Math.round(((totalOrders - prevOrderCount) / prevOrderCount) * 100);

    const prevCustomerCount = prevCustomers || 0;
    const customersChange = prevCustomerCount === 0
      ? 100
      : Math.round(((totalCustomers - prevCustomerCount) / prevCustomerCount) * 100);

    // ── Fill in missing days with 0 ──────────────────────────────────────────
    const filledDays = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const found = revenueByDay.find((r) => r._id === key);
      filledDays.push({
        date: key,
        revenue: found?.revenue || 0,
        orders: found?.orders || 0,
      });
    }

    res.status(200).json({
      period: days,
      overview: {
        revenue: { current: currentRevenue, change: revenueChange },
        orders: { current: totalOrders, change: ordersChange },
        customers: { current: totalCustomers, change: customersChange },
        avgOrderValue: totalOrders > 0
          ? Math.round(currentRevenue / totalOrders)
          : 0,
      },
      revenueByDay: filledDays,
      ordersByStatus,
      topProducts,
      recentOrders,
      ordersByPayment,
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};