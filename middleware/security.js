import helmet from 'helmet';
import hpp from 'hpp';

// ── Helmet — sets secure HTTP headers ────────────────────────────────────────
export const helmetConfig = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
});

// ── Manual NoSQL injection sanitizer ─────────────────────────────────────────
// Recursively removes any keys starting with $ or containing .
const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      console.warn(`Blocked potentially malicious key: ${key}`);
      delete obj[key];
    } else {
      sanitizeObject(obj[key]);
    }
  }
};

export const sanitizeInputs = (req, res, next) => {
  sanitizeObject(req.body);
  sanitizeObject(req.params);
  // req.query is read-only in newer Express — sanitize a copy instead
  const cleanQuery = JSON.parse(JSON.stringify(req.query));
  sanitizeObject(cleanQuery);
  next();
};

// ── HPP — prevent HTTP parameter pollution ────────────────────────────────────
export const preventParamPollution = hpp({
  whitelist: ['sort', 'condition', 'category', 'price', 'page', 'limit'],
});