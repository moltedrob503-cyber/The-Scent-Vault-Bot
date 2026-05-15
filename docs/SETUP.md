# Scent Vault Recovery Agent — Setup Guide

This is a fully autonomous AI agent that personalizes your abandoned cart, browse abandonment, and post-popup follow-up emails. It runs on Vercel, talks to Klaviyo and Shopify, and uses Claude Haiku for cost-efficient personalization (roughly $0.001 per email).

## How it works

1. Customer browses Scent Vault, abandons cart or leaves without buying
2. Your existing Klaviyo flow fires after the delay you've configured (e.g., 1 hour)
3. Before sending the email, Klaviyo calls a webhook on this agent
4. The agent looks up the specific fragrance, asks Claude to write personalized copy that sounds like a fragrance friend (not a marketer), and writes it back to the customer's Klaviyo profile
5. Klaviyo sends the email using the personalized copy
6. When the customer buys, Shopify pings the agent which attributes the conversion

You stay hands-off. Open the dashboard whenever you want to see what it's doing.

## Step 1: Deploy to Vercel

```bash
cd scent-vault-agent
vercel
```

Follow the prompts. When it asks for env vars, paste the values from `.env.example` after filling them in.

## Step 2: Set up Supabase

Create a new project at supabase.com, then run this in the SQL editor:

```sql
create table agent_activity (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  profile_id text not null,
  email text,
  trigger_type text not null,
  products text[],
  generated_subject text,
  tokens_used int,
  cost_estimate numeric(10,6),
  converted_at timestamptz,
  conversion_value numeric(10,2)
);

create index on agent_activity (created_at desc);
create index on agent_activity (email);
```

Copy the project URL and service_role key (Settings → API) into your Vercel env vars.

## Step 3: Wire up Klaviyo flows

For each of your three existing flows (abandoned cart, browse abandonment, post-popup), add a **Webhook** action at the very start (before any email):

- URL: `https://your-vercel-domain.vercel.app/api/personalize`
- Method: POST
- Add header: `x-klaviyo-signature` (Klaviyo handles this automatically when you set the webhook secret)
- Body (JSON):

```json
{
  "profile_id": "{{ person.id }}",
  "email": "{{ person.email }}",
  "first_name": "{{ person.first_name|default:'' }}",
  "trigger_type": "abandoned_cart",
  "products": [
    {
      "product_id": "{{ event.items.0.ProductID }}",
      "title": "{{ event.items.0.ProductName }}",
      "variant": "{{ event.items.0.VariantName }}",
      "price": "{{ event.items.0.ItemPrice }}",
      "url": "{{ event.items.0.ProductURL }}",
      "image_url": "{{ event.items.0.ImageURL }}"
    }
  ]
}
```

Change `trigger_type` to `browse_abandonment` or `post_popup_no_purchase` for the other two flows.

Then add a **time delay of 30 seconds** after the webhook (gives the agent time to write the copy and update the profile).

Then in your email template, use these profile properties wherever you want personalization:

- Subject: `{{ person.sv_recovery_subject }}`
- Preview text: `{{ person.sv_recovery_preview }}`
- Hero headline: `{{ person.sv_recovery_headline }}`
- Body: `{{ person.sv_recovery_body|linebreaks }}`
- CTA button text: `{{ person.sv_recovery_cta }}`
- Pairing suggestion footer: `{{ person.sv_recovery_pairing }}`

Keep your existing product block and discount code logic. The agent only handles the persuasion copy.

## Step 4: Wire up Shopify conversion tracking

In Shopify Admin → Settings → Notifications → Webhooks:

- Event: **Order paid**
- Format: JSON
- URL: `https://your-vercel-domain.vercel.app/api/shopify-order`

Copy the webhook secret Shopify gives you into your Vercel env var `SHOPIFY_WEBHOOK_SECRET`.

## Step 5: Optional but recommended — fragrance metafields

The agent writes better copy when it knows scent notes, house, and similar fragrances. Add these metafields to your Shopify products under namespace `custom`:

- `fragrance_notes` (list, single line text)
- `fragrance_house` (single line text)
- `scent_family` (single line text)
- `best_for` (single line text)
- `similar_to` (list, single line text)

Fill them in as you go. The agent uses a fallback catalog for the fragrances you've already written SEO descriptions for (Guerlain SDV, Herbes Troublantes, Neroli Outrenoir). It works without metafields, just less specifically.

## Step 6: Open the dashboard

Visit `https://your-vercel-domain.vercel.app/dashboard/`. Enter the `DASHBOARD_TOKEN` you set. You'll see emails sent, conversions, recovered revenue, and the actual subject lines the agent is generating.

## Cost expectations

At Haiku pricing with the prompts in this build:

- Per email: roughly $0.0008 to $0.0015
- 1000 emails per month: about $1
- 10,000 emails per month: about $12

You'll spend more on Klaviyo and Shopify than on the AI.

## Monitoring and safety

The agent logs every generation to Supabase. If Claude returns invalid JSON or the API fails, the webhook returns an error and Klaviyo can be configured to either retry or fall back to a default email template. Set this up in Klaviyo's flow conditional branching: "If webhook failed, send default abandoned cart email."

Recommended: spot-check the dashboard for the first week. After you trust the voice, leave it alone.

## Iterating on the voice

The personality of the agent lives in `lib/claude-personalizer.js` in the `SYSTEM_PROMPT` constant. When you want to refine how it sounds (more confident, more whimsical, more pragmatic), edit that one block and redeploy. The catalog enrichment and Klaviyo plumbing don't change.
