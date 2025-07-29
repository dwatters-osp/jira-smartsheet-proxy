import express from 'express';
import axios from 'axios';

export const router = express.Router();

// Preflight
router.options('/test-connections', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
  });
  res.sendStatus(200);
});

// Main handler
router.post('/test-connections', async (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
  });

  console.log('➡ /test-connections hit');
  console.log('Headers:', req.headers);
  console.log('Body:', JSON.stringify(req.body));

  const { smartsheetSheetId, jiraKeys } = req.body || {};
  const smartsheetKey = req.headers['x-api-key'];

  const results = {
    proxyReachable: true,
    smartsheet: false,
    jiraKeysReceived: Array.isArray(jiraKeys) && jiraKeys.length > 0,
    receivedKeysCount: Array.isArray(jiraKeys) ? jiraKeys.length : 0,
    sheetName: null,
    orderSync: null
  };

  if (!smartsheetSheetId || !smartsheetKey) {
    return res.status(400).json({ error: 'Missing Smartsheet credentials.' });
  }

  try {
    // 1. Fetch sheet
    const sheetResp = await axios.get(
      `https://api.smartsheet.com/2.0/sheets/${smartsheetSheetId}`,
      { headers: { Authorization: `Bearer ${smartsheetKey}` } }
    );

    results.smartsheet = sheetResp.status === 200;
    results.sheetName = sheetResp.data?.name || null;

    const columns = sheetResp.data?.columns || [];
    const rows = sheetResp.data?.rows || [];

    const orderNumCol = columns.find(col => col.title.trim() === 'Order #');
    if (!orderNumCol) throw new Error("Smartsheet column 'Order #' not found.");
    const columnId = orderNumCol.id;

    const existingKeys = new Set();
    for (const row of rows) {
      for (const cell of row.cells) {
        if (cell.columnId === columnId && typeof cell.value === 'string') {
          existingKeys.add(cell.value.trim());
        }
      }
    }

    const newRows = (jiraKeys || [])
      .filter(key => !existingKeys.has(key))
      .map(key => ({ cells: [{ columnId, value: key }] }));

    if (newRows.length > 0) {
      const batchSize = 400;
      const addedKeys = [];
      for (let i = 0; i < newRows.length; i += batchSize) {
        const batch = newRows.slice(i, i + batchSize);
        console.log('Posting batch to Smartsheet:', batch.length, 'rows');

        try {
          const updateResp = await axios.post(
            `https://api.smartsheet.com/2.0/sheets/${smartsheetSheetId}/rows`,
            batch,
            {
              headers: {
                Authorization: `Bearer ${smartsheetKey}`,
                'Content-Type': 'application/json'
              }
            }
          );
          if (updateResp.status !== 200) {
            console.error('❌ Smartsheet rejected batch:', updateResp.data);
          }
          addedKeys.push(...batch.map(r => r.cells[0].value));
        } catch (err) {
          console.error('❌ Error posting batch:', err.response?.data || err.message);
          throw err; // let the outer catch return JSON safely
        }
      }

      results.orderSync = {
        success: true,
        added: addedKeys.length,
        addedKeys
      };
    } else {
      results.orderSync = { success: true, added: 0, addedKeys: [] };
    }

    return res.status(200).json(results);
  } catch (err) {
    console.error('❌ Fatal error in /test-connections:', err.response?.data || err.message || err);
    results.smartsheet = false;
    results.orderSync = {
      success: false,
      error: err.response?.data?.message || err.message || 'Unknown error'
    };
    return res.status(200).json(results); // always respond to avoid 502
  }
});
