import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Token, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { smartsheetSheetId } = req.body;
  const smartsheetKey = req.headers['x-api-key'];
  const jiraToken = req.headers['x-api-token'];

  try {
    // Step 1: Get Jira issues assigned to beinorthal
    const jiraResp = await axios.get(
      'https://prodfjira.cspire.net/rest/api/2/search?jql=assignee=beinorthal&maxResults=100',
      {
        headers: {
          Authorization: `Bearer ${jiraToken}`,
          Accept: 'application/json'
        }
      }
    );

    const issues = jiraResp.data?.issues;
    if (!Array.isArray(issues)) {
      throw new Error("Jira response is missing 'issues' array.");
    }

    const jiraKeys = issues.map(issue => issue.key);

    // Step 2: Get the Smartsheet sheet data
    const sheetResp = await axios.get(`https://api.smartsheet.com/2.0/sheets/${smartsheetSheetId}`, {
      headers: {
        Authorization: `Bearer ${smartsheetKey}`
      }
    });

    const columns = sheetResp.data?.columns || [];
    const rows = sheetResp.data?.rows || [];

    const orderNumCol = columns.find(col => col.title.toLowerCase().includes('order'));
    if (!orderNumCol) {
      throw new Error("Smartsheet column 'Order #' not found.");
    }

    const columnId = orderNumCol.id;

    // Step 3: Build a Set of existing order numbers to avoid duplicates
    const existingKeys = new Set();

    for (const row of rows) {
      for (const cell of row.cells) {
        if (cell.columnId === columnId && typeof cell.value === 'string') {
          existingKeys.add(cell.value.trim());
        }
      }
    }

    // Step 4: Prepare rows to add
    const newRows = [];
    for (const row of rows) {
      const rowHasOrderNum = row.cells.some(cell => cell.columnId === columnId && cell.value);
      if (rowHasOrderNum) continue;

      const match = jiraKeys.find(key => {
        return Object.values(row.cells)
          .some(cell => typeof cell.value === 'string' && cell.value.includes(key));
      });

      if (match) {
        newRows.push({
          id: row.id,
          cells: [{ columnId, value: match }]
        });
      }
    }

    // Step 5: Send update request to Smartsheet
    let updateResult = null;
    if (newRows.length > 0) {
      const updateResp = await axios.put(
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
    console.error("❌ Sync failed:", error.message);
    return res.status(500).json({
      synced: false,
      error: error.message || 'Unknown error'
    });
  }
}
