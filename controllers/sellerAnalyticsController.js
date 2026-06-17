import Order from '../models/Order.js';
import Product from '../models/Product.js';
import mongoose from 'mongoose';

// ── Helper: get date range from period string ────────────────────────────────────
const getDateRange = (period) => {
  const now = new Date();
  const from = new Date();
  switch (period) {
    case '7d':  from.setDate(now.getDate() - 7); break;
    case '30d': from.setDate(now.getDate() - 30); break;
    case '90d': from.setDate(now.getDate() - 90); break;
    case '1y':  from.setFullYear(now.getFullYear() - 1); break;
    default:    from.setDate(now.getDate() - 30);
  }
  return { from, to: now };
};

// ── Helper: fill missing dates with zero ─────────────────────────────────────────
const fillDates = (data, from, to, period) => {
  const map = {};
  data.forEach((d) => { map[d.date] = d; });

  const result = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);

  const isWeekly = period === '1y';

  while (cursor <= to) {
    const key = cursor.toISOString().split('T')[0];
    result.push(map[key] || { date: key, revenue: 0, orders: 0, items: 0 });
    if (isWeekly) {
      cursor.setDate(cursor.getDate() + 7);
    } else {
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return result;
};

// ── GET /api/seller-analytics/overview ──────────────────────────────────────────
export const getSellerOverview = async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const { from, to } = getDateRange(period);
    const sellerId = new mongoose.Types.ObjectId(req.user.id);

    // Revenue over time
    const revenueData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: from, $lte: to },
          paymentStatus: 'paid',
          'subOrders.seller': sellerId,
        },
      },
      { $unwind: '$subOrders' },
      { $match: { 'subOrders.seller': sellerId } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          },
          revenue: { $sum: '$subOrders.subtotal' },
          orders: { $sum: 1 },
          items: {
            $sum: {
              $reduce: {
                input: '$subOrders.items',
                initialValue: 0,
                in: { $add: ['$$value', '$$this.quantity'] },
              },
            },
          },
        },
      },
      { $project: { date: '$_id.date', revenue: 1, orders: 1, items: 1, _id: 0 } },
      { $sort: { date: 1 } },
    ]);

    const filledRevenue = fillDates(revenueData, from, to, period);

    // Summary totals for current period
    const [currentPeriod, previousPeriodData] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: from, $lte: to },
            paymentStatus: 'paid',
            'subOrders.seller': sellerId,
          },
        },
        { $unwind: '$subOrders' },
        { $match: { 'subOrders.seller': sellerId } },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$subOrders.subtotal' },
            orders: { $sum: 1 },
            items: {
              $sum: {
                $reduce: {
                  input: '$subOrders.items',
                  initialValue: 0,
                  in: { $add: ['$$value', '$$this.quantity'] },
                },
              },
            },
          },
        },
      ]),
      // Previous period for comparison
      (() => {
        const prevTo = new Date(from);
        const prevFrom = new Date(from);
        const diff = to - from;
        prevFrom.setTime(prevFrom.getTime() - diff);
        return Order.aggregate([
          {
            $match: {
              createdAt: { $gte: prevFrom, $lte: prevTo },
              paymentStatus: 'paid',
              'subOrders.seller': sellerId,
            },
          },
          { $unwind: '$subOrders' },
          { $match: { 'subOrders.seller': sellerId } },
          {
            $group: {
              _id: null,
              revenue: { $sum: '$subOrders.subtotal' },
              orders: { $sum: 1 },
            },
          },
        ]);
      })(),
    ]);

    const current = currentPeriod[0] || { revenue: 0, orders: 0, items: 0 };
    const previous = previousPeriodData[0] || { revenue: 0, orders: 0 };

    const revenueChange = previous.revenue > 0
      ? ((current.revenue - previous.revenue) / previous.revenue) * 100
      : current.revenue > 0 ? 100 : 0;

    const ordersChange = previous.orders > 0
      ? ((current.orders - previous.orders) / previous.orders) * 100
      : current.orders > 0 ? 100 : 0;

    res.status(200).json({
      period,
      summary: {
        revenue: current.revenue,
        orders: current.orders,
        items: current.items,
        revenueChange: Math.round(revenueChange),
        ordersChange: Math.round(ordersChange),
        avgOrderValue: current.orders > 0
          ? Math.round(current.revenue / current.orders)
          : 0,
      },
      revenueChart: filledRevenue,
    });
  } catch (error) {
    console.error('Seller overview error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/seller-analytics/top-products ───────────────────────────────────────
export const getTopProducts = async (req, res) => {
  try {
    const { period = '30d', limit = 5 } = req.query;
    const { from, to } = getDateRange(period);
    const sellerId = new mongoose.Types.ObjectId(req.user.id);

    const topProducts = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: from, $lte: to },
          'subOrders.seller': sellerId,
        },
      },
      { $unwind: '$subOrders' },
      { $match: { 'subOrders.seller': sellerId } },
      { $unwind: '$subOrders.items' },
      {
        $group: {
          _id: '$subOrders.items.product',
          name: { $first: '$subOrders.items.name' },
          image: { $first: '$subOrders.items.image' },
          unitsSold: { $sum: '$subOrders.items.quantity' },
          revenue: {
            $sum: {
              $multiply: ['$subOrders.items.price', '$subOrders.items.quantity'],
            },
          },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: parseInt(limit) },
      {
        $project: {
          productId: '$_id',
          name: 1,
          image: 1,
          unitsSold: 1,
          revenue: 1,
          _id: 0,
        },
      },
    ]);

    res.status(200).json({ topProducts });
  } catch (error) {
    console.error('Top products error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/seller-analytics/escrow-breakdown ───────────────────────────────────
export const getEscrowBreakdown = async (req, res) => {
  try {
    const sellerId = new mongoose.Types.ObjectId(req.user.id);

    const breakdown = await Order.aggregate([
      { $match: { 'subOrders.seller': sellerId } },
      { $unwind: '$subOrders' },
      { $match: { 'subOrders.seller': sellerId } },
      {
        $group: {
          _id: '$subOrders.escrowStatus',
          total: { $sum: '$subOrders.subtotal' },
          count: { $sum: 1 },
        },
      },
    ]);

    const result = { held: 0, released: 0, refunded: 0, disputed: 0 };
    const counts = { held: 0, released: 0, refunded: 0, disputed: 0 };

    breakdown.forEach((b) => {
      if (result.hasOwnProperty(b._id)) {
        result[b._id] = b.total;
        counts[b._id] = b.count;
      }
    });

    res.status(200).json({ amounts: result, counts });
  } catch (error) {
    console.error('Escrow breakdown error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/seller-analytics/order-status ───────────────────────────────────────
export const getOrderStatusBreakdown = async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const { from, to } = getDateRange(period);
    const sellerId = new mongoose.Types.ObjectId(req.user.id);

    const breakdown = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: from, $lte: to },
          'subOrders.seller': sellerId,
        },
      },
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 },
        },
      },
    ]);

    const result = {
      pending: 0, confirmed: 0, processing: 0,
      shipped: 0, delivered: 0, cancelled: 0,
    };
    breakdown.forEach((b) => {
      if (result.hasOwnProperty(b._id)) result[b._id] = b.count;
    });

    res.status(200).json({ orderStatuses: result });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};