import './helpers/env.js';
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb.js';
import { installFetchMock, restoreFetch, setFetchHandler, resetFetchHandler } from './helpers/mockFetch.js';
import { mockReq, mockRes } from './helpers/mockReqRes.js';
import { createUser } from './helpers/fixtures.js';

import User from '../models/User.js';
import { forgotPassword, resetPassword } from '../controllers/authController.js';

before(async () => {
  await connectTestDb();
  installFetchMock();
});
after(async () => {
  restoreFetch();
  await disconnectTestDb();
});
beforeEach(async () => {
  resetFetchHandler();
  await clearTestDb();
});

// The raw reset token only ever exists in the outbound email — it's never stored
// raw (only its hash) or returned in any API response. Capture it from the
// mocked Resend call, the same way a real integration test would have to.
const captureResetToken = () => {
  let captured = null;
  setFetchHandler(async (url, opts) => {
    if (typeof url === 'string' && url.includes('api.resend.com')) {
      const body = JSON.parse(opts.body);
      const match = body.html.match(/reset-password\/([a-f0-9]{64})/);
      if (match) captured = match[1];
    }
    return { ok: true, json: async () => ({ id: 'email_1' }) };
  });
  return () => captured;
};

describe('forgotPassword', () => {
  test('returns the generic message and stores a hashed (not raw) reset token for an existing email', async () => {
    const user = await createUser({ email: 'reset-me@test.com' });
    const getToken = captureResetToken();

    const res = mockRes();
    await forgotPassword(mockReq({ body: { email: 'reset-me@test.com' } }), res);

    assert.equal(res.statusCode, 200);
    assert.match(res.body.message, /If an account exists/);

    const updated = await User.findById(user._id).select('+passwordResetToken +passwordResetExpires');
    assert.ok(updated.passwordResetToken);
    assert.ok(updated.passwordResetExpires > new Date());

    const rawToken = getToken();
    assert.ok(rawToken, 'expected a reset token to have been emailed');
    assert.notEqual(updated.passwordResetToken, rawToken, 'the stored value must be a hash, not the raw emailed token');
  });

  test('returns the exact same generic message for a non-existent email — no enumeration', async () => {
    const res = mockRes();
    await forgotPassword(mockReq({ body: { email: 'nobody@test.com' } }), res);

    assert.equal(res.statusCode, 200);
    assert.match(res.body.message, /If an account exists/);
  });
});

describe('resetPassword', () => {
  test('resets the password with a valid unexpired token and logs the user in', async () => {
    const user = await createUser({ email: 'reset-me@test.com', password: 'OldPassword1' });
    const getToken = captureResetToken();

    await forgotPassword(mockReq({ body: { email: 'reset-me@test.com' } }), mockRes());
    const rawToken = getToken();

    const res = mockRes();
    await resetPassword(
      mockReq({ params: { token: rawToken }, body: { newPassword: 'NewPassword1' } }),
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.email, 'reset-me@test.com');

    const updated = await User.findById(user._id).select('+password +passwordResetToken +passwordResetExpires');
    assert.ok(await updated.comparePassword('NewPassword1'));
    assert.equal(await updated.comparePassword('OldPassword1'), false);
    assert.equal(updated.passwordResetToken, undefined);
    assert.equal(updated.passwordResetExpires, undefined);
  });

  test('rejects an invalid/unknown token', async () => {
    await createUser({ email: 'reset-me@test.com' });

    const res = mockRes();
    await resetPassword(
      mockReq({ params: { token: 'not-a-real-token' }, body: { newPassword: 'NewPassword1' } }),
      res
    );

    assert.equal(res.statusCode, 400);
  });

  test('rejects an expired token', async () => {
    const user = await createUser({ email: 'reset-me@test.com' });
    const getToken = captureResetToken();
    await forgotPassword(mockReq({ body: { email: 'reset-me@test.com' } }), mockRes());
    const rawToken = getToken();

    // Simulate the token having expired.
    await User.updateOne({ _id: user._id }, { passwordResetExpires: new Date(Date.now() - 1000) });

    const res = mockRes();
    await resetPassword(
      mockReq({ params: { token: rawToken }, body: { newPassword: 'NewPassword1' } }),
      res
    );

    assert.equal(res.statusCode, 400);
  });

  test('a token cannot be reused after a successful reset', async () => {
    await createUser({ email: 'reset-me@test.com' });
    const getToken = captureResetToken();
    await forgotPassword(mockReq({ body: { email: 'reset-me@test.com' } }), mockRes());
    const rawToken = getToken();

    const res1 = mockRes();
    await resetPassword(
      mockReq({ params: { token: rawToken }, body: { newPassword: 'NewPassword1' } }),
      res1
    );
    assert.equal(res1.statusCode, 200);

    const res2 = mockRes();
    await resetPassword(
      mockReq({ params: { token: rawToken }, body: { newPassword: 'AnotherPassword2' } }),
      res2
    );
    assert.equal(res2.statusCode, 400);
  });
});
