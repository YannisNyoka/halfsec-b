import Cart from '../models/Cart.js';
import Product from '../models/Product.js';

// ── Get cart ───────────────────────────────────────────────────────────────────
export const getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id })
      .populate('items.product', 'name images price stock isActive slug');

    if (!cart) return res.status(200).json({ cart: { items: [], total: 0 } });

    // Filter out items whose product was deleted or deactivated
    cart.items = cart.items.filter(
      (item) => item.product && item.product.isActive
    );
    await cart.save();

    res.status(200).json({ cart });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Add item to cart ───────────────────────────────────────────────────────────
export const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;

    if (!productId) return res.status(400).json({ message: 'Product ID is required.' });
    if (quantity < 1) return res.status(400).json({ message: 'Quantity must be at least 1.' });

    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res.status(404).json({ message: 'Product not found.' });
    }
    if (product.stock < quantity) {
      return res.status(400).json({ message: `Only ${product.stock} item(s) available.` });
    }

    let cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      cart = await Cart.create({
        user: req.user.id,
        items: [{ product: productId, quantity, priceAtAdd: product.price }],
      });
    } else {
      const existingItem = cart.items.find(
        (item) => item.product.toString() === productId
      );

      if (existingItem) {
        const newQty = existingItem.quantity + quantity;
        if (newQty > product.stock) {
          return res.status(400).json({ message: `Only ${product.stock} item(s) available.` });
        }
        existingItem.quantity = newQty;
      } else {
        cart.items.push({ product: productId, quantity, priceAtAdd: product.price });
      }
      await cart.save();
    }

    await cart.populate('items.product', 'name images price stock slug');
    res.status(200).json({ message: 'Item added to cart.', cart });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Update item quantity ───────────────────────────────────────────────────────
export const updateCartItem = async (req, res) => {
  try {
    const { quantity } = req.body;
    const { productId } = req.params;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ message: 'Quantity must be at least 1.' });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    if (product.stock < quantity) {
      return res.status(400).json({ message: `Only ${product.stock} item(s) available.` });
    }

    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) return res.status(404).json({ message: 'Cart not found.' });

    const item = cart.items.find((i) => i.product.toString() === productId);
    if (!item) return res.status(404).json({ message: 'Item not in cart.' });

    item.quantity = quantity;
    await cart.save();
    await cart.populate('items.product', 'name images price stock slug');

    res.status(200).json({ message: 'Cart updated.', cart });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Remove item from cart ─────────────────────────────────────────────────────
export const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;

    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) return res.status(404).json({ message: 'Cart not found.' });

    cart.items = cart.items.filter((i) => i.product.toString() !== productId);
    await cart.save();
    await cart.populate('items.product', 'name images price stock slug');

    res.status(200).json({ message: 'Item removed.', cart });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Clear cart ─────────────────────────────────────────────────────────────────
export const clearCart = async (req, res) => {
  try {
    await Cart.findOneAndDelete({ user: req.user.id });
    res.status(200).json({ message: 'Cart cleared.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};