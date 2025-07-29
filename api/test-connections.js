import express from 'express';
import axios from 'axios';

export const router = express.Router();

router.options('/test-connections', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
  });
  res.sendStatus(200);
});

router.post('/test-connections', async (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
  });

  const { smartsheetSheetId, jiraKeys } = req.body;
  const smartsheetKey = req.headers['x-api-key'];

  const results = {
    proxyReachable: true,
    smartsheet: false,
    jiraKeysReceived: Array.isArray(jiraKeys) && jiraKeys.length > 0,
    receivedKeysCount: Array.isArray(jiraKeys) ? jiraKeys.length : 0,
    sheetName: null
  };

  if (!smartsheetSheetId || !smartsheetKey) {
    return res.status(400).json({ error: 'Missing Smartsheet credentials.' });
  }

  try {
    const sheetResp = await axios.get(
      `https://api.smartsheet.com/2.0/sheets/${smartsheetSheetId}`,
      {
        headers: { Authorization: `Bearer ${smartsheetKey}` }
      }
    );
    results.smartsheet = sheetResp.status === 200;
    if (results.smartsheet) {
      results.sheetName = sheetResp.data.name || 'Unnamed Sheet';
    }

    // Skipping row addition/update for now – just testing connection and receiving keys
    // If you want to re-enable later, add the column/row logic here

    return res.status(200).json(results);
  } catch (e) {
    results.smartsheet = false;
    results.sheetName = null;
    console.error("❌ Connection test failed:", e.response ? e.response.data : e.message);
    return res.status(200).json(results);
  }
});