import Product from '../models/Product.js';
import { sendLowStockAlert } from '../utils/email.js';

// ── Get all low stock products ─────────────────────────────────────────────────
export const getLowStockProducts = async (req, res) => {
  try {
    const products = await Product.find({
      $expr: { $lte: ['$stock', '$lowStockThreshold'] },
      isActive: true,
    })
      .populate('category', 'name')
      .sort({ stock: 1 })
      .select('name slug stock lowStockThreshold images category isActive sold');

    res.status(200).json({ products, count: products.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Update stock manually ──────────────────────────────────────────────────────
export const updateStock = async (req, res) => {
  try {
    const { stock, lowStockThreshold } = req.body;
    const { id } = req.params;

    if (stock === undefined || stock < 0) {
      return res.status(400).json({ message: 'Valid stock quantity required.' });
    }

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found.' });

    const oldStock = product.stock;
    product.stock = stock;
    if (lowStockThreshold !== undefined) {
      product.lowStockThreshold = lowStockThreshold;
    }
    await product.save();

    // Send low stock alert if stock just dropped to or below threshold
    if (
      stock <= product.lowStockThreshold &&
      oldStock > product.lowStockThreshold
    ) {
      sendLowStockAlert(product).catch(console.error);
    }

    res.status(200).json({ message: 'Stock updated.', product });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get stock overview ─────────────────────────────────────────────────────────
export const getStockOverview = async (req, res) => {
  try {
    const [
      totalProducts,
      outOfStock,
      lowStock,
      inStock,
    ] = await Promise.all([
      Product.countDocuments({ isActive: true }),
      Product.countDocuments({ isActive: true, stock: 0 }),
      Product.countDocuments({
        isActive: true,
        stock: { $gt: 0 },
        $expr: { $lte: ['$stock', '$lowStockThreshold'] },
      }),
      Product.countDocuments({
        isActive: true,
        $expr: { $gt: ['$stock', '$lowStockThreshold'] },
      }),
    ]);

    res.status(200).json({
      overview: { totalProducts, outOfStock, lowStock, inStock },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};