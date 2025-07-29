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
  console.log('Body keys:', Object.keys(req.body));

  const { smartsheetSheetId, jiraRows } = req.body || {};
  const smartsheetKey = req.headers['x-api-key'];

  const results = {
    proxyReachable: true,
    smartsheet: false,
    receivedRowsCount: Array.isArray(jiraRows) ? jiraRows.length : 0,
    orderSync: null
  };

  if (!smartsheetSheetId || !smartsheetKey || !Array.isArray(jiraRows)) {
    return res.status(400).json({ error: 'Missing Smartsheet credentials or jiraRows.' });
  }

  try {
    // 1. Fetch sheet metadata
    const sheetResp = await axios.get(
      `https://api.smartsheet.com/2.0/sheets/${smartsheetSheetId}`,
      { headers: { Authorization: `Bearer ${smartsheetKey}` } }
    );

    results.smartsheet = sheetResp.status === 200;
    const columns = sheetResp.data?.columns || [];
    const rows = sheetResp.data?.rows || [];

    // Column ID lookup by title
    const colMap = {};
    for (const col of columns) {
      colMap[col.title.trim()] = col.id;
    }

    // 2. Build set of existing Jira keys (Order #)
    const existingKeys = new Set();
    for (const row of rows) {
      const orderCell = row.cells.find(c => c.columnId === colMap['Order #']);
      if (orderCell?.value) {
        existingKeys.add(orderCell.value.toString().trim());
      }
    }

    // 3. Prepare new rows for Smartsheet
    const newRows = [];
    const skipped = [];
    for (const row of jiraRows) {
      if (existingKeys.has(row.orderNumber)) {
        skipped.push(row.orderNumber);
        continue;
      }

      newRows.push({
        cells: [
          { columnId: colMap['Order #'], value: row.orderNumber },
          { columnId: colMap['CSpire Install Date'], value: row.installDate || '' },
          { columnId: colMap['CSpire Install Time'], value: row.installTime || '' },
          { columnId: colMap['Address'], value: row.address || '' },
          { columnId: colMap['City'], value: row.city || '' },
          { columnId: colMap['State'], value: row.state || '' },
          { columnId: colMap['Zip'], value: row.zip || '' },
          { columnId: colMap['Billing Code'], value: row.billingCode || '' },
          { columnId: colMap['Fiber Hood'], value: row.fiberHood || '' },
          { columnId: colMap['Account Name'], value: row.accountName || '' },
          { columnId: colMap['Phone Input'], value: row.phone || '' },
          { columnId: colMap['Email'], value: row.email || '' },
          { columnId: colMap['Handoff Date'], value: row.handoffDate || '' }
        ]
      });
    }

    // 4. Batch insert (Smartsheet max 400 per request)
    const addedKeys = [];
    for (let i = 0; i < newRows.length; i += 400) {
      const batch = newRows.slice(i, i + 400);
      console.log(`Posting batch of ${batch.length} rows to Smartsheet...`);

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
        if (updateResp.status === 200) {
          addedKeys.push(...batch.map(r => r.cells[0].value));
        } else {
          console.error('❌ Smartsheet rejected batch:', updateResp.data);
        }
      } catch (err) {
        console.error('❌ Error posting batch:', err.response?.data || err.message);
        throw err;
      }
    }

    results.orderSync = {
      success: true,
      added: addedKeys.length,
      addedKeys,
      skipped
    };

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