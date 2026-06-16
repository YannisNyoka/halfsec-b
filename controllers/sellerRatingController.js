import SellerRating from '../models/SellerRating.js';
import Order from '../models/Order.js';
import User from '../models/User.js';

// ── Buyer: submit a rating for a sub-order ───────────────────────────────────────
export const rateSeller = async (req, res) => {
  try {
    const { orderId, subOrderId } = req.params;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5.' });
    }

    const order = await Order.findOne({ _id: orderId, user: req.user.id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    const sub = order.subOrders.id(subOrderId);
    if (!sub) return res.status(404).json({ message: 'Sub-order not found.' });

    if (!sub.seller) {
      return res.status(400).json({ message: 'This item was sold by Halfsec directly and cannot be rated.' });
    }

    if (sub.rated) {
      return res.status(409).json({ message: 'You have already rated this seller for this order.' });
    }

    if (!['released', 'refunded'].includes(sub.escrowStatus)) {
      return res.status(400).json({ message: 'You can rate this seller once the order is complete.' });
    }

    await SellerRating.create({
      seller: sub.seller,
      buyer: req.user.id,
      order: order._id,
      subOrderId: sub._id,
      rating,
      comment: comment?.trim() || '',
    });

    sub.rated = true;
    await order.save();

    // Recalculate seller's average rating
    const stats = await SellerRating.aggregate([
      { $match: { seller: sub.seller } },
      { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);

    await User.findByIdAndUpdate(sub.seller, {
      'sellerProfile.rating.average': stats[0]?.average || 0,
      'sellerProfile.rating.count': stats[0]?.count || 0,
    });

    res.status(201).json({ message: 'Thanks for your feedback!' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'You have already rated this seller for this order.' });
    }
    console.error('Rate seller error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Public: get a seller's ratings/reviews ───────────────────────────────────────
export const getSellerRatings = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    const seller = await User.findOne({
      _id: sellerId,
      'sellerProfile.status': 'approved',
    }).select('name sellerProfile.businessName sellerProfile.rating sellerProfile.bio');

    if (!seller) return res.status(404).json({ message: 'Seller not found.' });

    const [ratings, total, distribution] = await Promise.all([
      SellerRating.find({ seller: sellerId })
        .populate('buyer', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      SellerRating.countDocuments({ seller: sellerId }),
      SellerRating.aggregate([
        { $match: { seller: new (await import('mongoose')).default.Types.ObjectId(sellerId) } },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
      ]),
    ]);

    const distMap = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    distribution.forEach((d) => { distMap[d._id] = d.count; });

    res.status(200).json({
      seller: {
        name: seller.sellerProfile.businessName || seller.name,
        bio: seller.sellerProfile.bio,
        rating: seller.sellerProfile.rating,
      },
      ratings,
      distribution: distMap,
      pagination: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error('Get seller ratings error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};