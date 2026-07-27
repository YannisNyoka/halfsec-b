import crypto from 'crypto';

// ── Verify Yoco webhook signature (Standard Webhooks / Svix scheme) ──────────
// https://developer.yoco.com/online/guides/online-payments/webhooks/verifying-the-events
const TOLERANCE_SECONDS = 3 * 60;

export const verifyYocoWebhook = (headers, rawBody) => {
  const secret = process.env.YOCO_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('YOCO_WEBHOOK_SECRET is not configured.');
  }

  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];

  if (!id || !timestamp || !signatureHeader) {
    throw new Error('Missing webhook signature headers.');
  }

  // Reject stale or replayed webhooks
  const timestampSeconds = parseInt(timestamp, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > TOLERANCE_SECONDS) {
    throw new Error('Webhook timestamp outside tolerance window.');
  }

  const secretBytes = Buffer.from(secret.split('_')[1], 'base64');
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expectedBuffer = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest();

  // webhook-signature is space-separated "v1,<base64sig>" entries (supports secret rotation)
  const isValid = signatureHeader.split(' ').some((candidate) => {
    const [version, sig] = candidate.split(',');
    if (version !== 'v1' || !sig) return false;
    const sigBuffer = Buffer.from(sig, 'base64');
    return sigBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  });

  if (!isValid) {
    throw new Error('Webhook signature mismatch.');
  }
};
