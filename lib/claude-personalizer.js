// /lib/claude-personalizer.js
// This is where the actual personalization happens.
// We give Claude rich context about the specific fragrance and ask for
// copy that sounds like a knowledgeable fragrance friend, not a generic email.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// We use Haiku for cost efficiency. At Scent Vault's volume this matters.
// Roughly $0.001 per email vs $0.015 with Sonnet. Quality is plenty for this task.
const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You write recovery emails for The Scent Vault, a luxury fragrance decant business. Your voice is that of a fragrance-obsessed friend who genuinely knows scent, not a marketer.

VOICE RULES:
- Sound like a person, not a brand. Use "I" sparingly but naturally.
- Never use "Don't miss out", "Limited time", "Act now", or any phrase that screams email marketing.
- Never use em dashes. Use periods, commas, or parentheses instead.
- No exclamation points except in rare moments of genuine enthusiasm (max one per email).
- Reference the actual scent. Name the notes. Acknowledge what makes this fragrance specific.
- Address the real hesitation: at a decant store, the hesitation is usually "will I actually like this enough to wear it" or "is this the right size to try". Speak to that.

STRUCTURE: Always return valid JSON with these exact keys:
{
  "subject": "string, 35-55 chars, intriguing not salesy",
  "preview": "string, 50-90 chars, the preview text shown in inbox",
  "headline": "string, the H1 of the email, 4-10 words",
  "body": "string, 60-120 words of email body, plain text with \\n\\n between paragraphs",
  "cta": "string, 2-4 words for the button",
  "pairingNote": "string, one short sentence suggesting a complementary fragrance or use case"
}

Never include markdown, code fences, or any prose outside the JSON.`;

export async function generatePersonalizedEmail({
  firstName,
  triggerType,
  products,
  sessionData
}) {
  const userPrompt = buildUserPrompt({ firstName, triggerType, products, sessionData });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }]
  });

  // Extract text from response
  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  // Strip any accidental fencing
  const clean = text.replace(/```json|```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (err) {
    throw new Error(`Claude returned invalid JSON: ${clean.slice(0, 200)}`);
  }

  // Validate required fields
  const required = ['subject', 'preview', 'headline', 'body', 'cta'];
  for (const field of required) {
    if (!parsed[field]) throw new Error(`Missing field: ${field}`);
  }

  // Cost tracking
  const inputCost = (response.usage.input_tokens / 1_000_000) * 1.00;
  const outputCost = (response.usage.output_tokens / 1_000_000) * 5.00;

  return {
    ...parsed,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      cost_estimate: inputCost + outputCost
    }
  };
}

function buildUserPrompt({ firstName, triggerType, products, sessionData }) {
  const leadProduct = products[0];
  const name = firstName || 'this customer';

  const triggerContext = {
    abandoned_cart: `${name} added items to cart but did not complete checkout. They got close. The hesitation is likely about commitment, decant size, or price. Acknowledge they showed real interest.`,
    browse_abandonment: `${name} viewed product pages but did not add to cart. The hesitation is likely "I am not sure if I will like this scent". Help them imagine wearing it. Reduce risk by mentioning decant sizing.`,
    post_popup_no_purchase: `${name} gave us their email through the popup (so they got the discount code) but has not purchased. They are interested but hesitant. The discount is sitting there unused. Mention it without being pushy.`
  }[triggerType] || 'A potential customer needs a gentle nudge.';

  const productDetails = products.map((p, i) => `
PRODUCT ${i + 1}: ${p.title}
House: ${p.house || 'unknown'}
Notes: ${p.notes?.join(', ') || 'not catalogued'}
Scent family: ${p.family || 'unknown'}
Best for: ${p.bestFor || 'not catalogued'}
Similar to: ${p.similarTo?.join(', ') || 'not catalogued'}
Price viewed: $${p.price}
Decant size: ${p.variant || 'not specified'}
`).join('\n');

  const sessionContext = sessionData ? `
SESSION CONTEXT:
Pages viewed: ${sessionData.pages_viewed || 'unknown'}
Time on site: ${sessionData.time_on_site || 'unknown'}
Returning visitor: ${sessionData.returning_visitor ? 'yes' : 'no'}
` : '';

  return `Write a recovery email for The Scent Vault.

TRIGGER: ${triggerType}
CONTEXT: ${triggerContext}

${productDetails}
${sessionContext}

Write copy that speaks specifically to ${leadProduct.title}. Reference its actual scent character. Make it feel like a friend who knows fragrance is writing, not a marketing automation. Return JSON only.`;
}
