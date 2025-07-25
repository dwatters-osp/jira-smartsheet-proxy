import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Token, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { smartsheetSheetId } = req.body;
  const smartsheetKey = req.headers['x-api-key'];
  const jiraToken = req.headers['x-api-token'];

  if (!smartsheetKey || !jiraToken || !smartsheetSheetId) {
    return res.status(400).json({ error: 'Missing required credentials or sheet ID' });
  }

  try {
    // Step 1: Get Jira issues assigned to beinorthal
    const jiraResp = await axios.get('https://prodfjira.cspire.net/rest/api/2/search?jql=assignee=beinorthal', {
      headers: {
        Authorization: `Bearer ${jiraToken}`,
        Accept: 'application/json'
      }
    });

    const jiraIssues = jiraResp.data.issues.map(issue => issue.key);

    // Step 2: Get Smartsheet rows and columns
    const sheetResp = await axios.get(`https://api.smartsheet.com/2.0/sheets/${smartsheetSheetId}`, {
      headers: { Authorization: `Bearer ${smartsheetKey}` }
    });

    const orderCol = sheetResp.data.columns.find(col => col.title === 'Order #');
    if (!orderCol) {
      return res.status(400).json({ error: 'Column "Order #" not found in sheet' });
    }

    const orderColId = orderCol.id;

    // Step 3: Filter which Jira issues are NOT already in the sheet
    const existingOrderNums = sheetResp.data.rows
      .map(row => {
        const cell = row.cells.find(c => c.columnId === orderColId);
        return cell?.displayValue || null;
      })
      .filter(Boolean);

    const newIssueKeys = jiraIssues.filter(key => !existingOrderNums.includes(key));
    if (newIssueKeys.length === 0) {
      return res.status(200).json({ added: 0, skipped: existingOrderNums.length, message: 'No new Jira issues to sync' });
    }

    // Step 4: Find empty rows to write into
    const rowsToUpdate = sheetResp.data.rows
      .filter(row => {
        const cell = row.cells.find(c => c.columnId === orderColId);
        return !cell?.displayValue;
      })
      .slice(0, newIssueKeys.length)
      .map((row, idx) => ({
        id: row.id,
        cells: [{ columnId: orderColId, value: newIssueKeys[idx] }]
      }));

    if (rowsToUpdate.length === 0) {
      return res.status(400).json({ added: 0, error: 'No empty rows available to insert Jira keys' });
    }

    // Step 5: Update rows
    await axios.put(`https://api.smartsheet.com/2.0/sheets/${smartsheetSheetId}/rows`, rowsToUpdate, {
      headers: {
        Authorization: `Bearer ${smartsheetKey}`,
        'Content-Type': 'application/json'
      }
    });

    return res.status(200).json({ added: rowsToUpdate.length, skipped: existingOrderNums.length });
  } catch (err) {
    console.error('❌ Error syncing Jira to Smartsheet:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
