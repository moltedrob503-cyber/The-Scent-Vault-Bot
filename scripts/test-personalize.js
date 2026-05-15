// scripts/test-personalize.js
// Run with: node scripts/test-personalize.js
// Generates a few sample emails to verify the voice before deploying.

import { generatePersonalizedEmail } from '../lib/claude-personalizer.js';
import { getFragranceContext } from '../lib/fragrance-catalog.js';

const scenarios = [
  {
    name: 'Abandoned cart, returning visitor, Guerlain SDV',
    payload: {
      firstName: 'Aisha',
      triggerType: 'abandoned_cart',
      products: [{
        product_id: '1',
        handle: 'guerlain-sdv',
        title: 'Guerlain Spiritueuse Double Vanille',
        variant: '5ml decant',
        price: '24'
      }],
      sessionData: { pages_viewed: 7, time_on_site: '12m', returning_visitor: true }
    }
  },
  {
    name: 'Browse only, first time, Herbes Troublantes',
    payload: {
      firstName: 'Marcus',
      triggerType: 'browse_abandonment',
      products: [{
        product_id: '2',
        handle: 'herbes-troublantes',
        title: 'Maison Crivelli Herbes Troublantes',
        variant: '2ml decant',
        price: '14'
      }],
      sessionData: { pages_viewed: 3, time_on_site: '4m', returning_visitor: false }
    }
  },
  {
    name: 'Popup signup, no purchase, Neroli Outrenoir',
    payload: {
      firstName: null,
      triggerType: 'post_popup_no_purchase',
      products: [{
        product_id: '3',
        handle: 'neroli-outrenoir',
        title: 'Guerlain Neroli Outrenoir',
        variant: '10ml decant',
        price: '38'
      }]
    }
  }
];

console.log('Testing Scent Vault personalization agent\n');
console.log('=' .repeat(70));

for (const s of scenarios) {
  console.log(`\nSCENARIO: ${s.name}`);
  console.log('-'.repeat(70));

  const enriched = await Promise.all(s.payload.products.map(getFragranceContext));
  const result = await generatePersonalizedEmail({
    ...s.payload,
    products: enriched
  });

  console.log(`Subject:   ${result.subject}`);
  console.log(`Preview:   ${result.preview}`);
  console.log(`Headline:  ${result.headline}`);
  console.log(`Body:\n${result.body}`);
  console.log(`CTA:       [${result.cta}]`);
  console.log(`Pairing:   ${result.pairingNote}`);
  console.log(`\nCost:      $${result.usage.cost_estimate.toFixed(5)}`);
}
