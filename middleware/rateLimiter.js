import rateLimit from 'express-rate-limit';

// ── General API limiter ───────────────────────────────────────────────────────
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 100,                    // 100 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again after 15 minutes.' },
  skip: (req) => req.method === 'GET', // don't limit public browsing
});

// ── Strict limiter for auth routes ────────────────────────────────────────────
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 10,                     // only 10 login/register attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Please try again after 15 minutes.' },
});

// ── Very strict limiter for password changes ──────────────────────────────────
export const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many password change attempts. Please try again after 1 hour.' },
});