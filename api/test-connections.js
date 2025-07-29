import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    console.log(`Invalid method: ${req.method}`);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { smartsheetSheetId, jiraKeys } = req.body;
  const smartsheetKey = req.headers['x-api-key'];

  const results = {
    proxyReachable: true,
    smartsheet: false,
    jiraKeysReceived: Array.isArray(jiraKeys) && jiraKeys.length > 0,
    receivedKeysCount: Array.isArray(jiraKeys) ? jiraKeys.length : 0,
    orderSync: null
  };

  if (!smartsheetSheetId || !smartsheetKey) {
    return res.status(400).json({ error: 'Missing Smartsheet credentials.' });
  }

  try {
    // 1. Test Smartsheet access and fetch sheet data
    const sheetResp = await axios.get(
      `https://api.smartsheet.com/2.0/sheets/${smartsheetSheetId}`,
      {
        headers: { Authorization: `Bearer ${smartsheetKey}` }
      }
    );
    results.smartsheet = sheetResp.status === 200;

    const columns = sheetResp.data?.columns || [];
    const rows = sheetResp.data?.rows || [];

    const orderNumCol = columns.find(col => col.title.trim() === 'Order #');
    if (!orderNumCol) {
      throw new Error("Smartsheet column 'Order #' not found.");
    }

    const columnId = orderNumCol.id;

    // 2. Build a Set of existing order numbers to avoid duplicates
    const existingKeys = new Set();
    for (const row of rows) {
      for (const cell of row.cells) {
        if (cell.columnId === columnId && typeof cell.value === 'string') {
          existingKeys.add(cell.value.trim());
        }
      }
    }

    // 3. Prepare new rows to add for missing keys
    const newRows = [];
    for (const key of jiraKeys) {
      if (!existingKeys.has(key)) {
        newRows.push({
          cells: [{ columnId, value: key }]
        });
      }
    }

    // 4. Add new rows to Smartsheet (with batching for large lists)
    let updateResult = null;
    if (newRows.length > 0) {
      const batchSize = 400; // Smartsheet limit per request
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
        updateResult = updateResult ? [...updateResult, updateResp.data] : [updateResp.data];
      }
      results.orderSync = {
        success: true,
        added: newRows.length,
        addedKeys: newRows.map(r => r.cells[0].value)
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
    results.orderSync = {
      success: false,
      error: e.response?.data?.error || e.message || 'Unknown error'
    };
    console.error("❌ Sync failed:", e.response ? e.response.data : e.message);
    return res.status(200).json(results); // Return 200 with error details for client
  }
}