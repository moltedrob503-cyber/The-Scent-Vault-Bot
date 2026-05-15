// /lib/activity-log.js
// Logs each personalization run to Supabase so the dashboard can show
// recent activity, conversion attribution, and cost tracking.
//
// Schema (run this in Supabase SQL editor):
//
// create table agent_activity (
//   id uuid primary key default gen_random_uuid(),
//   created_at timestamptz default now(),
//   profile_id text not null,
//   email text,
//   trigger_type text not null,
//   products text[],
//   generated_subject text,
//   tokens_used int,
//   cost_estimate numeric(10,6),
//   converted_at timestamptz,
//   conversion_value numeric(10,2)
// );
//
// create index on agent_activity (created_at desc);
// create index on agent_activity (email);

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function saveActivity(activity) {
  const { error } = await supabase.from('agent_activity').insert(activity);
  if (error) {
    console.error('Activity log failed:', error);
    // Don't throw. Logging failure shouldn't break the main flow.
  }
}

export async function recordConversion(email, orderValue) {
  // Called by a separate webhook when a Shopify order completes.
  // Attributes the conversion to the most recent personalization for that email.
  const { error } = await supabase
    .from('agent_activity')
    .update({
      converted_at: new Date().toISOString(),
      conversion_value: orderValue
    })
    .eq('email', email)
    .is('converted_at', null)
    .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) console.error('Conversion record failed:', error);
}

export async function getRecentActivity(limit = 50) {
  const { data, error } = await supabase
    .from('agent_activity')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

export async function getStats(days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('agent_activity')
    .select('*')
    .gte('created_at', since);

  if (error) throw error;

  const total = data.length;
  const converted = data.filter(a => a.converted_at).length;
  const revenue = data.reduce((sum, a) => sum + (Number(a.conversion_value) || 0), 0);
  const cost = data.reduce((sum, a) => sum + (Number(a.cost_estimate) || 0), 0);

  return {
    total_emails: total,
    conversions: converted,
    conversion_rate: total ? converted / total : 0,
    revenue_recovered: revenue,
    api_cost: cost,
    roi: cost ? (revenue - cost) / cost : 0,
    by_trigger: groupByTrigger(data)
  };
}

function groupByTrigger(activities) {
  const groups = {};
  for (const a of activities) {
    if (!groups[a.trigger_type]) {
      groups[a.trigger_type] = { sent: 0, converted: 0, revenue: 0 };
    }
    groups[a.trigger_type].sent++;
    if (a.converted_at) {
      groups[a.trigger_type].converted++;
      groups[a.trigger_type].revenue += Number(a.conversion_value) || 0;
    }
  }
  return groups;
}
