// Imported first (side-effect only) by every test file, before any controller/util
// import touches env-dependent module-scope code (e.g. `new Resend(process.env.RESEND_API_KEY)`
// in utils/email.js runs at import time, not call time).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRES_IN = '7d';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.RESEND_API_KEY = 're_test_dummy_key';
process.env.FROM_EMAIL = 'test@halfsec.test';
process.env.ADMIN_EMAIL = 'admin@halfsec.test';
process.env.YOCO_SECRET_KEY = 'sk_test_dummy';
process.env.YOCO_PUBLIC_KEY = 'pk_test_dummy';
process.env.VAPID_EMAIL = 'mailto:test@halfsec.test';
// Throwaway keypair generated for tests only — not used anywhere real.
process.env.VAPID_PUBLIC_KEY = 'BLUJtO3hoEpVfJ6h0PtC14Elz0vNuxqK3y5uuO2DJxJXqRrCO1bSPXpDXEIYAxl2F2Cv2JmsGWGnRSi7BGdJmV0';
process.env.VAPID_PRIVATE_KEY = 'znqH6UIrwEOKNc9z_rNx_8wKDdlOBgjscZ7eDDssgw0';
