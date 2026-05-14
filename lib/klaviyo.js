// /lib/klaviyo.js
// Two operations:
// 1. updateKlaviyoProfile: writes generated copy to profile properties
//    so the Klaviyo email template can render personalized content
// 2. logEvent: fires a custom event so the Klaviyo flow can branch on success/failure

const KLAVIYO_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_REVISION = '2024-10-15';

export async function updateKlaviyoProfile(profileId, properties) {
  const res = await fetch(`${KLAVIYO_BASE}/profiles/${profileId}/`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_KEY}`,
      'revision': KLAVIYO_REVISION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      data: {
        type: 'profile',
        id: profileId,
        attributes: { properties }
      }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Klaviyo profile update failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function logEvent(email, metricName, properties = {}) {
  const res = await fetch(`${KLAVIYO_BASE}/events/`, {
    method: 'POST',
    headers: {
      'Authorization': `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_KEY}`,
      'revision': KLAVIYO_REVISION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      data: {
        type: 'event',
        attributes: {
          properties,
          metric: { data: { type: 'metric', attributes: { name: metricName } } },
          profile: { data: { type: 'profile', attributes: { email } } }
        }
      }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Klaviyo event log failed: ${res.status} ${text}`);
    // Don't throw. Event logging failure shouldn't break the main flow.
  }
}
