// /lib/fragrance-catalog.js
// Enriches product data with fragrance-specific context that Claude needs
// to write knowledgeable copy.
//
// Two sources:
// 1. Your Shopify product metafields (preferred - source of truth)
// 2. A local fallback map for the catalog you already wrote SEO descriptions for
//
// As you keep adding fragrances to Shopify, populate the metafields:
//   custom.fragrance_notes (list.single_line_text)
//   custom.fragrance_house (single_line_text)
//   custom.scent_family (single_line_text)
//   custom.similar_to (list.single_line_text)
//   custom.best_for (single_line_text)

const FALLBACK_CATALOG = {
  // The fragrances you have SEO descriptions for already
  'guerlain-sdv': {
    house: 'Guerlain',
    notes: ['orange blossom', 'jasmine', 'sandalwood', 'tonka bean', 'vanilla'],
    family: 'oriental floral',
    bestFor: 'evening, date night, warm weather',
    similarTo: ['Mon Guerlain', 'Tom Ford Soleil Blanc']
  },
  'herbes-troublantes': {
    house: 'Maison Crivelli',
    notes: ['fig leaf', 'galbanum', 'mate absolute', 'cypress', 'vetiver'],
    family: 'green aromatic',
    bestFor: 'spring, daytime, outdoor wear',
    similarTo: ['Diptyque Philosykos', 'Hermes Un Jardin en Mediterranee']
  },
  'neroli-outrenoir': {
    house: 'Guerlain',
    notes: ['neroli', 'bigarade', 'smoky tea', 'iris', 'musk'],
    family: 'smoky citrus',
    bestFor: 'office, signature scent, year-round',
    similarTo: ['Tom Ford Neroli Portofino', 'Hermes Eau de Neroli Dore']
  }
  // Add more as you go. The webhook gracefully handles missing entries.
};

export async function getFragranceContext(product) {
  // First try Shopify metafields (live data)
  if (process.env.SHOPIFY_STORE && product.product_id) {
    try {
      const metafields = await fetchShopifyMetafields(product.product_id);
      if (metafields.notes?.length) {
        return { ...product, ...metafields };
      }
    } catch (err) {
      console.warn(`Shopify metafield fetch failed for ${product.product_id}`, err.message);
    }
  }

  // Fall back to local catalog by slug
  const slug = product.handle || slugify(product.title);
  const fallback = FALLBACK_CATALOG[slug];
  if (fallback) {
    return { ...product, ...fallback };
  }

  // No enrichment available. Claude will still write decent copy from the title alone.
  return product;
}

async function fetchShopifyMetafields(productId) {
  const url = `https://${process.env.SHOPIFY_STORE}.myshopify.com/admin/api/2024-10/products/${productId}/metafields.json`;
  const res = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) throw new Error(`Shopify ${res.status}`);

  const data = await res.json();
  const meta = data.metafields || [];

  const get = (key) => meta.find(m => m.namespace === 'custom' && m.key === key)?.value;
  const getList = (key) => {
    const raw = get(key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [raw];
    } catch {
      return [raw];
    }
  };

  return {
    house: get('fragrance_house'),
    notes: getList('fragrance_notes'),
    family: get('scent_family'),
    bestFor: get('best_for'),
    similarTo: getList('similar_to')
  };
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
