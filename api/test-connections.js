import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { smartsheetSheetId, jiraKeys } = req.body;
  const smartsheetKey = req.headers['x-api-key'];

  const results = {
    proxyReachable: true,
    smartsheet: false,
    jiraKeysReceived: Array.isArray(jiraKeys) && jiraKeys.length > 0,
    receivedKeysCount: Array.isArray(jiraKeys) ? jiraKeys.length : 0,  // NEW: Echo back the count
    orderSync: null
  };

  if (!smartsheetSheetId || !smartsheetKey) {
    return res.status(400).json({ error: 'Missing Smartsheet credentials.' });
  }

  try {
    // 1. Test Smartsheet access
    const sheetResp = await axios.get(
      `https://api.smartsheet.com/2.0/sheets/${smartsheetSheetId}`,
      {
        headers: { Authorization: `Bearer ${smartsheetKey}` }
      }
    );
    results.smartsheet = sheetResp.status === 200;
  } catch (e) {
    results.smartsheet = false;
    return res.status(200).json(results); // No need to continue if Smartsheet is bad
  }

  // 2. Only proceed with syncing if both checks pass
  if (results.smartsheet && results.jiraKeysReceived) {
    try {
      const syncResp = await axios.post(
        'https://jira-smartsheet-proxy.vercel.app/api/jira-key-to-ordernum',
        { smartsheetSheetId, jiraKeys },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': smartsheetKey
          }
        }
      );

      results.orderSync = {
        success: true,
        added: syncResp.data?.addedCount || 0,
        addedKeys: syncResp.data?.addedKeys || []
      };
    } catch (err) {
      results.orderSync = {
        success: false,
        error: err.response?.data?.error || err.message || 'Unknown error'
      };
    }
  } else {
    results.orderSync = {
      success: false,
      error: !results.jiraKeysReceived
        ? 'No Jira keys received.'
        : 'Smartsheet connection failed.'
    };
  }

  return res.status(200).json(results);
}