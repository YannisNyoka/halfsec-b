import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import connectDB from './config/db.js';
import { helmetConfig, sanitizeInputs, preventParamPollution } from './middleware/security.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import errorHandler from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import productRoutes from './routes/productRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import stockRoutes from './routes/stockRoutes.js';
import wishlistRoutes from './routes/wishlistRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import couponRoutes from './routes/couponRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import sellerRoutes from './routes/sellerRoutes.js';
import adminSellerRoutes from './routes/adminSellerRoutes.js';
import escrowRoutes from './routes/escrowRoutes.js';
import { startAutoReleaseCron } from './utils/autoReleaseCron.js';
import payoutRoutes from './routes/payoutRoutes.js';
import sellerRatingRoutes from './routes/sellerRatingRoutes.js';

const app = express();
const PORT = process.env.PORT || 5000;

// ── Trust proxy (required for rate limiting behind Render/Railway) ────────────
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmetConfig);

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_URL,
  'https://halfsec.co.za',
  'https://www.halfsec.co.za',
  'https://halfsec-f.vercel.app',
  'http://localhost:5173',
].filter(Boolean);


app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(cookieParser());
// Raw body for Yoco webhook — must be BEFORE express.json()
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Input sanitization ────────────────────────────────────────────────────────
app.use(sanitizeInputs);
app.use(preventParamPollution);

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const userAgent = req.headers['user-agent'] || '';
  const isMonitor = userAgent.includes('UptimeRobot') ||
                    userAgent.includes('monitor') ||
                    req.query.source === 'monitor';

  if (!isMonitor) {
    console.log(`Health check from: ${req.ip}`);
  }

  res.status(200).json({
    status: 'ok',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/sellers', sellerRoutes);
app.use('/api/admin/sellers', adminSellerRoutes);
app.use('/api/escrow', escrowRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/seller-ratings', sellerRatingRoutes);
app.use('/api/seller', sellerRoutes);
// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found.` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  });
  startAutoReleaseCron();
}).catch((err) => {
  console.error('Failed to connect to database:', err.message);
  process.exit(1);
});

export default app;