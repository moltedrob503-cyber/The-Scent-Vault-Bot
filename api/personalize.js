// /api/personalize.js
// Vercel Edge Function. Klaviyo webhook hits this when a flow triggers.
// We generate personalized copy and write it back to the Klaviyo profile as
// custom properties, which the email template then renders.

import { generatePersonalizedEmail } from '../lib/claude-personalizer.js';
import { updateKlaviyoProfile, logEvent } from '../lib/klaviyo.js';
import { getFragranceContext } from '../lib/fragrance-catalog.js';
import { saveActivity } from '../lib/activity-log.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Verify the request actually came from Klaviyo
  const signature = req.headers.get('x-klaviyo-signature');
  const rawBody = await req.text();

  const validSignature = await verifyKlaviyoSignature(signature, rawBody);
  if (!validSignature) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    return new Response('Invalid JSON', { status: 400 });
  }

  const {
    profile_id,
    email,
    first_name,
    trigger_type,        // "abandoned_cart" | "browse_abandonment" | "post_popup_no_purchase"
    products,            // array of { product_id, title, variant, price, image_url, url }
    session_data         // optional: pages_viewed, time_on_site, returning_visitor
  } = payload;

  if (!profile_id || !trigger_type || !products?.length) {
    return new Response('Missing required fields', { status: 400 });
  }

  try {
    // Enrich each product with fragrance knowledge (notes, house, similar scents)
    const enrichedProducts = await Promise.all(
      products.map(p => getFragranceContext(p))
    );

    // Generate the personalized email copy
    const generated = await generatePersonalizedEmail({
      firstName: first_name,
      triggerType: trigger_type,
      products: enrichedProducts,
      sessionData: session_data
    });

    // Write the generated copy back to Klaviyo as profile properties.
    // The Klaviyo email template uses {{ person.sv_recovery_subject }} etc.
    await updateKlaviyoProfile(profile_id, {
      sv_recovery_subject: generated.subject,
      sv_recovery_preview: generated.preview,
      sv_recovery_headline: generated.headline,
      sv_recovery_body: generated.body,
      sv_recovery_cta: generated.cta,
      sv_recovery_pairing: generated.pairingNote,
      sv_recovery_generated_at: new Date().toISOString()
    });

    // Fire a custom Klaviyo event so the flow can proceed to the next step
    await logEvent(email, 'Personalized Recovery Generated', {
      trigger_type,
      product_count: products.length,
      lead_product: products[0].title
    });

    // Log to our own dashboard
    await saveActivity({
      profile_id,
      email,
      trigger_type,
      products: products.map(p => p.title),
      generated_subject: generated.subject,
      tokens_used: generated.usage?.total_tokens,
      cost_estimate: generated.usage?.cost_estimate
    });

    return Response.json({ ok: true, subject: generated.subject });
  } catch (err) {
    console.error('Personalization failed:', err);

    // Graceful degradation: trigger the fallback flow with generic copy
    // so the customer still gets *something*. Better a generic email than none.
    await logEvent(email, 'Personalized Recovery Failed', {
      error: err.message,
      trigger_type
    });

    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}

// Web Crypto API version of HMAC-SHA256 signature verification.
// Works in Vercel Edge runtime (which doesn't support Node's crypto module).
async function verifyKlaviyoSignature(signature, body) {
  if (!signature || !process.env.KLAVIYO_WEBHOOK_SECRET) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(process.env.KLAVIYO_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(body)
  );

  const expected = bufferToHex(signatureBuffer);
  return timingSafeEqual(signature, expected);
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
