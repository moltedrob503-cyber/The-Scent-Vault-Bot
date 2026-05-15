// /api/shopify-order.js
// Shopify hits this when an order completes. We match the email back to
// recent agent activity to attribute the recovery.

import { recordConversion } from '../lib/activity-log.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const rawBody = await req.text();

  // Verify Shopify HMAC using Web Crypto API
  const hmac = req.headers.get('x-shopify-hmac-sha256');
  const valid = await verifyShopifyHmac(hmac, rawBody);

  if (!valid) {
    return new Response('Unauthorized', { status: 401 });
  }

  let order;
  try {
    order = JSON.parse(rawBody);
  } catch (err) {
    return new Response('Invalid JSON', { status: 400 });
  }

  const email = order.email || order.customer?.email;
  const total = parseFloat(order.total_price);

  if (email && total) {
    await recordConversion(email, total);
  }

  return Response.json({ ok: true });
}

// Shopify signs with HMAC-SHA256 and sends a base64-encoded digest.
// (Klaviyo uses hex. Same algorithm, different encoding.)
async function verifyShopifyHmac(receivedHmac, body) {
  if (!receivedHmac || !process.env.SHOPIFY_WEBHOOK_SECRET) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(process.env.SHOPIFY_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(body)
  );

  const expected = bufferToBase64(signatureBuffer);
  return timingSafeEqual(receivedHmac, expected);
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
