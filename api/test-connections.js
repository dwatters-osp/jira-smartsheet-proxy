import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Token, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { smartsheetSheetId } = req.body;
  const smartsheetKey = req.headers['x-api-key'];
  const jiraToken = req.headers['x-api-token'];

  const results = {
    proxyReachable: true,
    smartsheet: false,
    jira: false,
    syncSummary: null // added this
  };

  try {
    const smartsheetResp = await axios.get(`https://api.smartsheet.com/2.0/sheets/${smartsheetSheetId}`, {
      headers: { Authorization: `Bearer ${smartsheetKey}` }
    });
    results.smartsheet = smartsheetResp.status === 200;
  } catch (e) {
    results.smartsheet = false;
  }

  try {
    const jiraResp = await axios.get('https://prodfjira.cspire.net/rest/api/2/myself', {
      headers: {
        Authorization: `Bearer ${jiraToken}`,
        Accept: 'application/json'
      }
    });
    results.jira = jiraResp.status === 200;
  } catch (e) {
    results.jira = false;
  }

  // ✅ Only run sync if both connections succeeded
  if (results.smartsheet && results.jira) {
    try {
      const syncResp = await axios.post(`${req.headers.origin || 'https://jira-smartsheet-proxy.vercel.app'}/api/jira-key-to-ordernum`, {
        smartsheetSheetId
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': smartsheetKey,
          'X-API-Token': jiraToken
        }
      });

      results.syncSummary = syncResp.data || { synced: true };
    } catch (err) {
      results.syncSummary = { synced: false, error: err.message };
    }
  }

  return res.status(200).json(results);
}
