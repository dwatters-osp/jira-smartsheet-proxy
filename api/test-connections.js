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
    sheetName: null,
    orderSync: null
  };

  if (!smartsheetSheetId || !smartsheetKey) {
    return res.status(400).json({ error: 'Missing Smartsheet credentials.' });
  }

  // Optional: Validate sheet ID format (uncomment if you want stricter checks)
  // if (!/^[a-zA-Z0-9]{16}$/.test(smartsheetSheetId)) {
  //   return res.status(400).json({ error: 'Invalid Smartsheet sheet ID format.' });
  // }

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
    } else {
      throw new Error('Failed to connect to Smartsheet sheet.');
    }

    const columns = sheetResp.data?.columns || [];
    const rows = sheetResp.data?.rows || [];

    const orderNumCol = columns.find(col => col.title.trim() === 'Order #');
    if (!orderNumCol) {
      throw new Error("Smartsheet column 'Order #' not found.");
    }

    const columnId = orderNumCol.id;

    const existingKeys = new Set();
    for (const row of rows) {
      for (const cell of row.cells) {
        if (cell.columnId === columnId && typeof cell.value === 'string') {
          existingKeys.add(cell.value.trim());
        }
      }
    }

    const newRows = [];
    for (const key of jiraKeys) {
      if (!existingKeys.has(key)) {
        newRows.push({
          cells: [{ columnId, value: key }]
        });
      }
    }

    if (newRows.length > 0) {
      const batchSize = 400;
      let addedCount = 0;
      const addedKeys = [];
      for (let i = 0; i < newRows.length; i += batchSize) {
        const batch = newRows.slice(i, i + batchSize);
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
          throw new Error(`Row addition failed: ${updateResp.data.message || 'Unknown error'}`);
        }
        addedCount += batch.length;
        addedKeys.push(...batch.map(r => r.cells[0].value));
      }
      results.orderSync = {
        success: true,
        added: addedCount,
        addedKeys
      };
    } else {
      results.orderSync = {
        success: true,
        added: 0,
        addedKeys: []
      };
    }

    return res.status(200).json(results);
  } catch (e) {
    results.smartsheet = false;
    results.sheetName = null;
    results.orderSync = {
      success: false,
      error: e.response?.data?.message || e.message || 'Unknown error'
    };
    console.error("❌ Sync failed:", e.response ? e.response.data : e.message);
    return res.status(200).json(results);
  }
});