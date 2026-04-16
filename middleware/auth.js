import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// ── Protect: must be logged in ──────────────────────────────────────────────
export const protect = async (req, res, next) => {
  try {
    // Read token from httpOnly cookie only — never from headers/body
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({ message: 'Not authenticated. Please log in.' });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Session expired. Please log in again.' });
      }
      return res.status(401).json({ message: 'Invalid token. Please log in again.' });
    }

    // Check user still exists
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'User no longer exists.' });
    }

    // Check account is active
    if (!user.isActive) {
      return res.status(403).json({ message: 'Your account has been deactivated.' });
    }

    // Check if password was changed after token was issued
    if (user.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({ message: 'Password recently changed. Please log in again.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({ message: 'Authentication error.' });
  }
};

// ── Admin guard: must be admin ───────────────────────────────────────────────
export const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admins only.' });
  }
  next();
};