import SavedSearch from '../models/SavedSearch.js';
import PriceAlert from '../models/PriceAlert.js';
import Product from '../models/Product.js';
import { notify } from '../utils/notify.js';

// ── Saved searches ────────────────────────────────────────────────────────────────

export const getMySavedSearches = async (req, res) => {
  try {
    const searches = await SavedSearch.find({ user: req.user.id })
      .sort({ createdAt: -1 });
    res.status(200).json({ searches });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

export const saveSearch = async (req, res) => {
  try {
    const { name, filters, alertEnabled } = req.body;

    const count = await SavedSearch.countDocuments({ user: req.user.id });
    if (count >= 10) {
      return res.status(400).json({ message: 'You can save up to 10 searches.' });
    }

    const search = await SavedSearch.create({
      user: req.user.id,
      name: name?.trim() || filters?.search || 'Saved search',
      filters: {
        search: filters?.search || '',
        category: filters?.category || '',
        conditions: filters?.conditions || [],
        minPrice: filters?.minPrice || 0,
        maxPrice: filters?.maxPrice || 0,
        sort: filters?.sort || 'newest',
        inStock: filters?.inStock || false,
      },
      alertEnabled: alertEnabled !== false,
    });

    res.status(201).json({ message: 'Search saved.', search });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

export const deleteSavedSearch = async (req, res) => {
  try {
    await SavedSearch.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    res.status(200).json({ message: 'Search deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

export const toggleSearchAlert = async (req, res) => {
  try {
    const search = await SavedSearch.findOne({
      _id: req.params.id,
      user: req.user.id,
    });
    if (!search) return res.status(404).json({ message: 'Search not found.' });

    search.alertEnabled = !search.alertEnabled;
    await search.save();

    res.status(200).json({
      message: `Alerts ${search.alertEnabled ? 'enabled' : 'disabled'}.`,
      alertEnabled: search.alertEnabled,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Price alerts ──────────────────────────────────────────────────────────────────

export const getMyPriceAlerts = async (req, res) => {
  try {
    const alerts = await PriceAlert.find({ user: req.user.id })
      .populate('product', 'name images price slug isActive')
      .sort({ createdAt: -1 });
    res.status(200).json({ alerts });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

export const setPriceAlert = async (req, res) => {
  try {
    const { productId, targetPrice } = req.body;

    if (!productId || !targetPrice || targetPrice < 1) {
      return res.status(400).json({ message: 'Product and target price are required.' });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found.' });

    if (targetPrice >= product.price) {
      return res.status(400).json({
        message: `Target price must be below the current price of R${product.price.toLocaleString()}.`,
      });
    }

    const alert = await PriceAlert.findOneAndUpdate(
      { user: req.user.id, product: productId },
      {
        targetPrice,
        triggered: false,
        triggeredAt: null,
        triggeredPrice: null,
      },
      { upsert: true, new: true }
    );

    res.status(201).json({ message: 'Price alert set.', alert });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

export const deletePriceAlert = async (req, res) => {
  try {
    await PriceAlert.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    res.status(200).json({ message: 'Alert deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Cron: check price alerts ──────────────────────────────────────────────────────
export const checkPriceAlerts = async () => {
  try {
    const alerts = await PriceAlert.find({ triggered: false })
      .populate('product', 'name price slug isActive')
      .populate('user', '_id');

    let triggered = 0;

    for (const alert of alerts) {
      if (!alert.product?.isActive) continue;

      if (alert.product.price <= alert.targetPrice) {
        alert.triggered = true;
        alert.triggeredAt = new Date();
        alert.triggeredPrice = alert.product.price;
        await alert.save();

        await notify(alert.user._id, {
          type: 'review_reminder',
          title: '🏷️ Price drop alert!',
          message: `"${alert.product.name}" is now R${alert.product.price.toLocaleString()} — your target was R${alert.targetPrice.toLocaleString()}.`,
          link: `/shop/${alert.product.slug}`,
        });

        triggered++;
      }
    }

    if (triggered > 0) {
      console.log(`[price-alerts] Triggered ${triggered} alert(s).`);
    }
  } catch (error) {
    console.error('[price-alerts] Error:', error.message);
  }
};

// ── Cron: check saved search alerts for new items ────────────────────────────────
export const checkSavedSearchAlerts = async () => {
  try {
    const searches = await SavedSearch.find({ alertEnabled: true })
      .populate('user', '_id');

    for (const search of searches) {
      const f = search.filters;

      const filter = {
        isActive: true,
        $or: [
          { moderationStatus: 'approved' },
          { moderationStatus: { $exists: false } },
          { moderationStatus: null },
        ],
        ...(f.search && { name: { $regex: f.search, $options: 'i' } }),
        ...(f.category && { category: f.category }),
        ...(f.conditions?.length && { condition: { $in: f.conditions } }),
        ...(f.minPrice > 0 || f.maxPrice > 0
          ? {
              price: {
                ...(f.minPrice > 0 && { $gte: f.minPrice }),
                ...(f.maxPrice > 0 && { $lte: f.maxPrice }),
              },
            }
          : {}),
        ...(f.inStock && { stock: { $gt: 0 } }),
        // Only products added since last alert check
        ...(search.lastAlertedAt && {
          createdAt: { $gt: search.lastAlertedAt },
        }),
      };

      const newCount = await Product.countDocuments(filter);

      if (newCount > 0) {
        await notify(search.user._id, {
          type: 'review_reminder',
          title: '🔍 New items match your search',
          message: `${newCount} new item${newCount !== 1 ? 's' : ''} match "${search.name}".`,
          link: `/shop?search=${encodeURIComponent(f.search || '')}&category=${f.category || ''}`,
        });

        search.lastAlertedAt = new Date();
        search.lastResultCount = newCount;
        await search.save();
      }
    }
  } catch (error) {
    console.error('[saved-search-alerts] Error:', error.message);
  }
};