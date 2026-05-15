// /api/stats.js
// Returns aggregate stats for the admin dashboard.

import { getStats, getRecentActivity } from '../lib/activity-log.js';

export default async function handler(req, res) {
  // Simple bearer auth so this isn't world-readable
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.DASHBOARD_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const days = parseInt(req.query.days) || 7;
    const [stats, recent] = await Promise.all([
      getStats(days),
      getRecentActivity(50)
    ]);

    res.json({ stats, recent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
