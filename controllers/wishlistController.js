import Wishlist from '../models/Wishlist.js';

// ── Get wishlist ───────────────────────────────────────────────────────────────
export const getWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user.id })
      .populate(
        'products',
        'name slug price originalPrice images condition category stock isActive isFeatured'
      );

    if (!wishlist) {
      return res.status(200).json({ products: [] });
    }

    // Filter out deleted or inactive products
    const activeProducts = wishlist.products.filter(
      (p) => p && p.isActive
    );

    res.status(200).json({ products: activeProducts });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Add to wishlist ────────────────────────────────────────────────────────────
export const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ message: 'Product ID required.' });
    }

    let wishlist = await Wishlist.findOne({ user: req.user.id });

    if (!wishlist) {
      wishlist = await Wishlist.create({
        user: req.user.id,
        products: [productId],
      });
    } else {
      if (wishlist.products.includes(productId)) {
        return res.status(200).json({
          message: 'Already in wishlist.',
          products: wishlist.products,
        });
      }
      wishlist.products.push(productId);
      await wishlist.save();
    }

    res.status(200).json({
      message: 'Added to wishlist.',
      products: wishlist.products,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Remove from wishlist ───────────────────────────────────────────────────────
export const removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;

    const wishlist = await Wishlist.findOne({ user: req.user.id });
    if (!wishlist) {
      return res.status(404).json({ message: 'Wishlist not found.' });
    }

    wishlist.products = wishlist.products.filter(
      (id) => id.toString() !== productId
    );
    await wishlist.save();

    res.status(200).json({
      message: 'Removed from wishlist.',
      products: wishlist.products,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Toggle wishlist ────────────────────────────────────────────────────────────
export const toggleWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ message: 'Product ID required.' });
    }

    let wishlist = await Wishlist.findOne({ user: req.user.id });

    if (!wishlist) {
      wishlist = await Wishlist.create({
        user: req.user.id,
        products: [productId],
      });
      return res.status(200).json({
        message: 'Added to wishlist.',
        added: true,
        products: wishlist.products,
      });
    }

    const exists = wishlist.products.some(
      (id) => id.toString() === productId
    );

    if (exists) {
      wishlist.products = wishlist.products.filter(
        (id) => id.toString() !== productId
      );
      await wishlist.save();
      return res.status(200).json({
        message: 'Removed from wishlist.',
        added: false,
        products: wishlist.products,
      });
    } else {
      wishlist.products.push(productId);
      await wishlist.save();
      return res.status(200).json({
        message: 'Added to wishlist.',
        added: true,
        products: wishlist.products,
      });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Clear wishlist ─────────────────────────────────────────────────────────────
export const clearWishlist = async (req, res) => {
  try {
    await Wishlist.findOneAndDelete({ user: req.user.id });
    res.status(200).json({ message: 'Wishlist cleared.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};