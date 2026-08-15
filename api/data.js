module.exports = async function handler(req, res) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({
      error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.'
    });
    return;
  }

  const baseUrl = SUPABASE_URL.replace(/\/$/, '');
  const tableUrl = `${baseUrl}/rest/v1/app_data`;
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };

  const defaultDb = { nodes: [], routes: [], risks: [], weather: [] };

  function normalizeDb(value) {
    const base = { ...defaultDb };
    if (!value || typeof value !== 'object') return base;
    base.nodes = Array.isArray(value.nodes) ? value.nodes : [];
    base.routes = Array.isArray(value.routes) ? value.routes : [];
    base.risks = Array.isArray(value.risks) ? value.risks : [];
    base.weather = Array.isArray(value.weather) ? value.weather : [];
    return base;
  }

  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.status(204).end();
      return;
    }

    if (req.method === 'GET') {
      const response = await fetch(`${tableUrl}?select=*`, { headers });
      if (!response.ok) {
        throw new Error(`Supabase GET failed: ${response.status}`);
      }

      const rows = await response.json();
      const row = rows.find((item) => item.id === 'default') || rows[0];
      const payload = row && row.data ? normalizeDb(row.data) : defaultDb;
      res.status(200).json(payload);
      return;
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      let body = '';

      if (req.body && typeof req.body === 'object') {
        body = JSON.stringify(req.body);
      } else {
        body = await new Promise((resolve, reject) => {
          let chunk = '';
          req.on('data', (part) => { chunk += part; });
          req.on('end', () => resolve(chunk));
          req.on('error', reject);
        });
      }

      const incoming = body ? JSON.parse(body) : defaultDb;
      const nextDb = normalizeDb(incoming);
      const payload = [{
        id: 'default',
        data: nextDb,
        updated_at: new Date().toISOString()
      }];

      const response = await fetch(`${tableUrl}?on_conflict=id`, {
        method: 'POST',
        headers: {
          ...headers,
          Prefer: 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase POST failed: ${response.status} ${errorText}`);
      }

      const rows = await response.json();
      const saved = rows[0]?.data ? normalizeDb(rows[0].data) : nextDb;
      res.status(200).json(saved);
      return;
    }

    res.setHeader('Allow', 'GET, POST, PUT, OPTIONS');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Supabase API error:', error);
    res.status(500).json({
      error: 'Failed to read or save data from Supabase.',
      details: String(error.message || error)
    });
  }
};
