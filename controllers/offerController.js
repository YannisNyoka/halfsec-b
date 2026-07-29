import { validationResult } from 'express-validator';
import Offer from '../models/Offer.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import { notify, notifyOrderPlaced, notifyNewOrderSeller } from '../utils/notify.js';
import { pushOrderPlaced, pushNewSale } from '../utils/pushNotify.js';
import { sendOrderConfirmation, sendAdminOrderAlert } from '../utils/email.js';
import { calculateProtectionFee, groupItemsBySeller, SHIPPING_COST } from '../utils/fees.js';
import { calculateAutoReleaseDate } from '../utils/escrow.js';
import { claimStock } from '../utils/stock.js';

// ── Buyer: make an offer ──────────────────────────────────────────────────────────
export const makeOffer = async (req, res) => {
  try {
    const { productId, offerPrice, message } = req.body;

    if (!productId || !offerPrice || offerPrice < 1) {
      return res.status(400).json({ message: 'Product and offer price are required.' });
    }

    const product = await Product.findById(productId)
      .populate('seller', 'name email sellerProfile.businessName');

    if (!product || !product.isActive) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    if (!product.seller) {
      return res.status(400).json({
        message: 'This item is sold directly by Halfsec and does not accept offers.',
      });
    }

    if (product.seller._id.toString() === req.user.id) {
      return res.status(400).json({ message: 'You cannot make an offer on your own listing.' });
    }

    if (offerPrice >= product.price) {
      return res.status(400).json({
        message: `Your offer must be below the listing price of R${product.price.toLocaleString()}.`,
      });
    }

    if (offerPrice < product.price * 0.3) {
      return res.status(400).json({
        message: 'Offer is too low. Minimum offer is 30% of the listing price.',
      });
    }

    // Check for existing pending offer from this buyer — fast, friendly rejection
    // before any write. The partial unique index on (product, buyer, status:'pending')
    // is the actual guard against a double-submit race; this is just the UX fast path.
    const existing = await Offer.findOne({
      product: productId,
      buyer: req.user.id,
      status: 'pending',
    });

    if (existing) {
      return res.status(409).json({
        message: 'You already have a pending offer on this item. Withdraw it first to make a new one.',
      });
    }

    let offer;
    try {
      offer = await Offer.create({
        product: productId,
        buyer: req.user.id,
        seller: product.seller._id,
        offerPrice,
        originalPrice: product.price,
        message: message?.trim() || '',
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({
          message: 'You already have a pending offer on this item. Withdraw it first to make a new one.',
        });
      }
      throw err;
    }

    // Notify seller
    notify(product.seller._id, {
      type: 'new_order_seller',
      title: '💬 New offer received',
      message: `Someone offered R${offerPrice.toLocaleString()} for "${product.name}" (listed at R${product.price.toLocaleString()}).`,
      link: '/seller/offers',
    });

    const populated = await offer.populate([
      { path: 'product', select: 'name images price slug' },
      { path: 'buyer', select: 'name' },
    ]);

    res.status(201).json({ message: 'Offer sent!', offer: populated });
  } catch (error) {
    console.error('Make offer error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Buyer: get my offers ──────────────────────────────────────────────────────────
export const getMyOffers = async (req, res) => {
  try {
    const offers = await Offer.find({ buyer: req.user.id })
      .populate('product', 'name images price slug isActive')
      .populate('seller', 'name sellerProfile.businessName')
      .sort({ createdAt: -1 });

    // Auto-expire
    const now = new Date();
    for (const offer of offers) {
      if (offer.status === 'pending' && offer.expiresAt < now) {
        offer.status = 'expired';
        await offer.save();
      }
    }

    res.status(200).json({ offers });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Buyer: withdraw an offer ──────────────────────────────────────────────────────
export const withdrawOffer = async (req, res) => {
  try {
    // Atomic: the status:'pending' condition is checked and changed in one step,
    // so this can't race a concurrent accept/decline into an inconsistent state.
    const offer = await Offer.findOneAndUpdate(
      { _id: req.params.id, buyer: req.user.id, status: 'pending' },
      { $set: { status: 'withdrawn', respondedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!offer) {
      return res.status(404).json({ message: 'Pending offer not found.' });
    }

    res.status(200).json({ message: 'Offer withdrawn.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Seller: get offers on my products ────────────────────────────────────────────
export const getSellerOffers = async (req, res) => {
  try {
    const { status = 'pending' } = req.query;

    const filter = { seller: req.user.id };
    if (status !== 'all') filter.status = status;

    const offers = await Offer.find(filter)
      .populate('product', 'name images price slug')
      .populate('buyer', 'name email')
      .sort({ createdAt: -1 });

    // Auto-expire
    const now = new Date();
    for (const offer of offers) {
      if (offer.status === 'pending' && offer.expiresAt < now) {
        offer.status = 'expired';
        await offer.save();
      }
    }

    res.status(200).json({ offers });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Seller: accept an offer ───────────────────────────────────────────────────────
export const acceptOffer = async (req, res) => {
  try {
    const { sellerNote } = req.body;

    const offer = await Offer.findOne({
      _id: req.params.id,
      seller: req.user.id,
      status: 'pending',
    }).populate('product', 'name price stock');

    if (!offer) return res.status(404).json({ message: 'Pending offer not found.' });
    if (offer.expiresAt < new Date()) {
      // Only flip to expired if still pending — don't clobber a concurrent accept/decline.
      await Offer.updateOne({ _id: offer._id, status: 'pending' }, { $set: { status: 'expired' } });
      return res.status(400).json({ message: 'This offer has expired.' });
    }
    if (offer.product.stock === 0) {
      return res.status(400).json({ message: 'This item is out of stock.' });
    }

    // Atomic: only succeeds if the offer is still 'pending' at write time, so a
    // double-click or a concurrent decline/withdraw can't both take effect.
    const accepted = await Offer.findOneAndUpdate(
      { _id: offer._id, status: 'pending' },
      { $set: { status: 'accepted', respondedAt: new Date(), sellerNote: sellerNote?.trim() || '' } },
      { returnDocument: 'after' }
    ).populate('product', 'name price stock slug');

    if (!accepted) {
      return res.status(409).json({ message: 'This offer was already responded to.' });
    }

    // Notify buyer
    notify(accepted.buyer, {
      type: 'order_confirmed',
      title: '🎉 Offer accepted!',
      message: `Your offer of R${accepted.offerPrice.toLocaleString()} for "${accepted.product.name}" was accepted. Complete your purchase now.`,
      link: `/offers/${accepted._id}/checkout`,
    });

    res.status(200).json({ message: 'Offer accepted.', offer: accepted });
  } catch (error) {
    console.error('Accept offer error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Seller: decline an offer ──────────────────────────────────────────────────────
export const declineOffer = async (req, res) => {
  try {
    const { sellerNote } = req.body;

    // Atomic: only succeeds if the offer is still 'pending' at write time.
    const offer = await Offer.findOneAndUpdate(
      { _id: req.params.id, seller: req.user.id, status: 'pending' },
      { $set: { status: 'declined', respondedAt: new Date(), sellerNote: sellerNote?.trim() || '' } },
      { returnDocument: 'after' }
    ).populate('product', 'name slug');

    if (!offer) return res.status(404).json({ message: 'Pending offer not found.' });

    // Notify buyer
    notify(offer.buyer, {
      type: 'order_cancelled',
      title: 'Offer declined',
      message: `Your offer for "${offer.product.name}" was declined.${sellerNote ? ` Seller note: ${sellerNote}` : ''}`,
      link: `/shop/${offer.product.slug}`,
    });

    res.status(200).json({ message: 'Offer declined.', offer });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Buyer: get checkout summary for an accepted offer ──────────────────────────
export const getOfferCheckout = async (req, res) => {
  try {
    const offer = await Offer.findOne({ _id: req.params.id, buyer: req.user.id })
      .populate('product', 'name images price slug stock isActive');

    if (!offer) return res.status(404).json({ message: 'Offer not found.' });

    if (offer.status === 'purchased') {
      return res.status(200).json({ alreadyPurchased: true, orderId: offer.order });
    }

    if (offer.status !== 'accepted') {
      return res.status(400).json({ message: 'This offer is not available to purchase.' });
    }

    const itemsTotal = offer.offerPrice;
    const buyerProtectionFee = calculateProtectionFee(itemsTotal);
    const shippingCost = SHIPPING_COST;
    const total = itemsTotal + buyerProtectionFee + shippingCost;

    res.status(200).json({ offer, itemsTotal, buyerProtectionFee, shippingCost, total });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Buyer: complete a purchase at an accepted offer's negotiated price ─────────
export const purchaseOffer = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const { shippingAddress, paymentMethod, notes } = req.body;

    const offer = await Offer.findOne({ _id: req.params.id, buyer: req.user.id })
      .populate('product', 'name images price stock isActive seller');

    if (!offer) return res.status(404).json({ message: 'Offer not found.' });

    if (offer.status !== 'accepted') {
      return res.status(409).json({ message: 'This offer is no longer available to purchase.' });
    }

    // Atomic claim: exclusively locks this offer for purchase, so a double-click
    // or two open tabs can't both build an order from the same accepted offer —
    // same idiom used to fix accept/decline/withdraw races earlier this session.
    const claimedOffer = await Offer.findOneAndUpdate(
      { _id: offer._id, buyer: req.user.id, status: 'accepted', order: null },
      { $set: { status: 'purchased' } },
      { returnDocument: 'after' }
    );

    if (!claimedOffer) {
      return res.status(409).json({ message: 'This offer is no longer available to purchase.' });
    }

    const product = offer.product;

    if (!product || !product.isActive) {
      await Offer.updateOne(
        { _id: offer._id, status: 'purchased', order: null },
        { $set: { status: 'accepted' } }
      );
      return res.status(400).json({ message: 'This item is no longer available.' });
    }

    const orderItem = {
      product: product._id,
      seller: product.seller || null,
      name: product.name,
      image: product.images?.[0]?.url || '',
      price: offer.offerPrice,
      quantity: 1,
    };

    const stockResult = await claimStock([orderItem]);
    if (!stockResult.success) {
      await Offer.updateOne(
        { _id: offer._id, status: 'purchased', order: null },
        { $set: { status: 'accepted' } }
      );
      return res.status(400).json({ message: 'This item no longer has enough stock.' });
    }

    const itemsTotal = offer.offerPrice;
    const buyerProtectionFee = calculateProtectionFee(itemsTotal);
    const shippingCost = SHIPPING_COST;
    const total = itemsTotal + buyerProtectionFee + shippingCost;

    const grouped = groupItemsBySeller([orderItem]);
    const subOrders = Object.entries(grouped).map(([sellerKey, items]) => ({
      seller: sellerKey === 'platform' ? null : sellerKey,
      items: items.map((i) => ({
        product: i.product,
        name: i.name,
        image: i.image,
        price: i.price,
        quantity: i.quantity,
      })),
      subtotal: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      escrowStatus: 'held',
      autoReleaseAt: calculateAutoReleaseDate(new Date()),
    }));

    const order = await Order.create({
      user: req.user.id,
      items: [orderItem],
      subOrders,
      shippingAddress,
      paymentMethod,
      itemsTotal,
      discountAmount: 0,
      couponCode: null,
      buyerProtectionFee,
      shippingCost,
      total,
      notes,
      offer: offer._id,
    });

    await Offer.updateOne(
      { _id: offer._id, status: 'purchased', order: null },
      { $set: { order: order._id } }
    );

    // Send emails — non-blocking, failure won't break the order
    try {
      sendOrderConfirmation(order, req.user.email, req.user.name);
      sendAdminOrderAlert(order, req.user.name, req.user.email);
    } catch (emailErr) {
      console.error('Email send failed (non-fatal):', emailErr.message);
    }

    notifyOrderPlaced(req.user.id, order.orderNumber, order._id);
    pushOrderPlaced(req.user.id, order.orderNumber, order._id);

    if (orderItem.seller) {
      notifyNewOrderSeller(orderItem.seller.toString(), order.orderNumber, order._id);
      pushNewSale(orderItem.seller.toString(), order.orderNumber, order._id);
    }

    res.status(201).json({ message: 'Purchase complete.', order });
  } catch (error) {
    console.error('Purchase offer error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};