// /api/shopify-order.js
// Shopify hits this when an order completes. We match the email back to
// recent agent activity to attribute the recovery.

import { recordConversion } from '../lib/activity-log.js';
import crypto from 'crypto';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const rawBody = await req.text();

  // Verify Shopify HMAC
  const hmac = req.headers.get('x-shopify-hmac-sha256');
  const expected = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');

  if (hmac !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }

  const order = JSON.parse(rawBody);
  const email = order.email || order.customer?.email;
  const total = parseFloat(order.total_price);

  if (email && total) {
    await recordConversion(email, total);
  }

  return Response.json({ ok: true });
}
