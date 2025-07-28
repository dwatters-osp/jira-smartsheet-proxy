import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Token, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { smartsheetSheetId, jiraKeys } = req.body;
  const smartsheetKey = req.headers['x-api-key'];

  try {
    if (!Array.isArray(jiraKeys) || jiraKeys.length === 0) {
      throw new Error("Jira keys not provided or invalid.");
    }

    // Step 1: Get the Smartsheet sheet data
    const sheetResp = await axios.get(`https://api.smartsheet.com/2.0/sheets/${smartsheetSheetId}`, {
      headers: {
        Authorization: `Bearer ${smartsheetKey}`
      }
    });

    const columns = sheetResp.data?.columns || [];
    const rows = sheetResp.data?.rows || [];

    const orderNumCol = columns.find(col => col.title.trim() === 'Order #');
    if (!orderNumCol) {
      throw new Error("Smartsheet column 'Order #' not found.");
    }

    const columnId = orderNumCol.id;

    // Step 2: Build a Set of existing order numbers to avoid duplicates
    const existingKeys = new Set();
    for (const row of rows) {
      for (const cell of row.cells) {
        if (cell.columnId === columnId && typeof cell.value === 'string') {
          existingKeys.add(cell.value.trim());
        }
      }
    }

    // Step 3: Prepare new rows to add for missing keys
    const newRows = [];
    for (const key of jiraKeys) {
      if (!existingKeys.has(key)) {
        newRows.push({
          cells: [{ columnId, value: key }]
        });
      }
    }

    // Step 4: Send add request to Smartsheet (using POST for new rows)
    let updateResult = null;
    if (newRows.length > 0) {
      const updateResp = await axios.post(
        `https://api.smartsheet.com/2.0/sheets/${smartsheetSheetId}/rows`,
        newRows,
        {
          headers: {
            Authorization: `Bearer ${smartsheetKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      updateResult = updateResp.data;
    }

    return res.status(200).json({
      synced: true,
      addedCount: newRows.length,
      addedKeys: newRows.map(r => r.cells[0].value),
      smartsheetUpdate: updateResult || null
    });
  } catch (error) {
    console.error("❌ Sync failed:", error.response ? error.response.data : error.message);
    return res.status(500).json({
      synced: false,
      error: error.message || 'Unknown error'
    });
  }
}
