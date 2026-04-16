import jwt from 'jsonwebtoken';

export const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

export const sendTokenCookie = (res, token) => {
  const cookieOptions = {
    httpOnly: true,                                     // JS cannot access this cookie
    secure: process.env.NODE_ENV === 'production',      // HTTPS only in production
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,                  // 7 days in ms
  };

  res.cookie('token', token, cookieOptions);
};

export const clearTokenCookie = (res) => {
  res.cookie('token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 0,
  });
};