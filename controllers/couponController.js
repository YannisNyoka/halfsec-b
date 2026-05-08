import Coupon from '../models/Coupon.js';

// ── Validate & apply coupon (customer) ────────────────────────────────────────
export const validateCoupon = async (req, res) => {
  try {
    const { code, orderTotal } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Coupon code is required.' });
    }

    const coupon = await Coupon.findOne({
      code: code.toUpperCase().trim(),
    });

    if (!coupon) {
      return res.status(404).json({ message: 'Invalid coupon code.' });
    }

    if (!coupon.isActive) {
      return res.status(400).json({ message: 'This coupon is no longer active.' });
    }

    const now = new Date();

    if (coupon.startsAt && now < coupon.startsAt) {
      return res.status(400).json({ message: 'This coupon is not yet valid.' });
    }

    if (coupon.expiresAt && now > coupon.expiresAt) {
      return res.status(400).json({ message: 'This coupon has expired.' });
    }

    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      return res.status(400).json({ message: 'This coupon has reached its usage limit.' });
    }

    if (orderTotal < coupon.minOrderAmount) {
      return res.status(400).json({
        message: `Minimum order of R${coupon.minOrderAmount.toLocaleString()} required for this coupon.`,
      });
    }

    // Check per-user usage
    const userUsage = coupon.usedBy.filter(
      (u) => u.user.toString() === req.user.id
    ).length;

    if (userUsage >= coupon.userUsageLimit) {
      return res.status(400).json({
        message: 'You have already used this coupon.',
      });
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.type === 'percentage') {
      discountAmount = (orderTotal * coupon.value) / 100;
      if (coupon.maxDiscount) {
        discountAmount = Math.min(discountAmount, coupon.maxDiscount);
      }
    } else {
      discountAmount = Math.min(coupon.value, orderTotal);
    }

    discountAmount = Math.round(discountAmount * 100) / 100;
    const finalTotal = Math.max(0, orderTotal - discountAmount);

    res.status(200).json({
      valid: true,
      coupon: {
        id: coupon._id,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        description: coupon.description,
      },
      discountAmount,
      finalTotal,
    });
  } catch (error) {
    console.error('Validate coupon error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get all coupons (admin) ────────────────────────────────────────────────────
export const getAllCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find()
      .sort({ createdAt: -1 })
      .select('-usedBy');
    res.status(200).json({ coupons });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Create coupon (admin) ──────────────────────────────────────────────────────
export const createCoupon = async (req, res) => {
  try {
    const {
      code, description, type, value,
      minOrderAmount, maxDiscount, usageLimit,
      userUsageLimit, isActive, expiresAt, startsAt,
    } = req.body;

    if (!code || !type || !value) {
      return res.status(400).json({
        message: 'Code, type and value are required.',
      });
    }

    if (type === 'percentage' && (value < 1 || value > 100)) {
      return res.status(400).json({
        message: 'Percentage discount must be between 1 and 100.',
      });
    }

    const existing = await Coupon.findOne({
      code: code.toUpperCase().trim(),
    });
    if (existing) {
      return res.status(409).json({ message: 'Coupon code already exists.' });
    }

    const coupon = await Coupon.create({
      code: code.toUpperCase().trim(),
      description,
      type,
      value,
      minOrderAmount: minOrderAmount || 0,
      maxDiscount: maxDiscount || null,
      usageLimit: usageLimit || null,
      userUsageLimit: userUsageLimit || 1,
      isActive: isActive !== false,
      expiresAt: expiresAt || null,
      startsAt: startsAt || null,
    });

    res.status(201).json({ message: 'Coupon created.', coupon });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Coupon code already exists.' });
    }
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Update coupon (admin) ──────────────────────────────────────────────────────
export const updateCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found.' });
    }
    res.status(200).json({ message: 'Coupon updated.', coupon });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Delete coupon (admin) ──────────────────────────────────────────────────────
export const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found.' });
    }
    res.status(200).json({ message: 'Coupon deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Toggle coupon active status (admin) ───────────────────────────────────────
export const toggleCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found.' });
    }
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    res.status(200).json({
      message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'}.`,
      coupon,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};