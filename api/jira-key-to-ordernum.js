export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { smartsheetSheetId } = req.body;
  const jiraDomain = req.headers['x-jira-domain'];
  const jiraApiToken = req.headers['x-api-token'];
  const smartsheetApiKey = req.headers['x-api-key'];

  if (!jiraDomain || !jiraApiToken || !smartsheetApiKey || !smartsheetSheetId) {
    return res.status(400).json({ error: 'Missing required credentials or sheet ID' });
  }

  try {
    // 1. Fetch all Jira issues assigned to 'beinorthal'
    const jiraResponse = await fetch(`${jiraDomain}/rest/api/2/search?jql=assignee=beinorthal`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`beinorthal:${jiraApiToken}`).toString('base64')}`,
        'Accept': 'application/json'
      }
    });

    const jiraData = await jiraResponse.json();
    const jiraKeys = jiraData.issues?.map(issue => issue.key) || [];

    // 2. Fetch current Smartsheet rows
    const smartsheetRes = await fetch(`https://api.smartsheet.com/2.0/sheets/${smartsheetSheetId}`, {
      headers: {
        'Authorization': `Bearer ${smartsheetApiKey}`
      }
    });

    const smartsheetSheet = await smartsheetRes.json();
    const orderCol = smartsheetSheet.columns.find(c => c.title === 'Order #');
    if (!orderCol) return res.status(500).json({ error: 'Missing "Order #" column in sheet' });

    const orderColumnId = orderCol.id;

    const rowsRes = await fetch(`https://api.smartsheet.com/2.0/sheets/${smartsheetSheetId}/rows`, {
      headers: {
        'Authorization': `Bearer ${smartsheetApiKey}`
      }
    });

    const { data: rows } = await rowsRes.json();
    const existingOrderNums = new Set();

    rows.forEach(row => {
      row.cells.forEach(cell => {
        if (cell.columnId === orderColumnId && cell.value) {
          existingOrderNums.add(cell.value);
        }
      });
    });

    // 3. Prepare new rows
    const newJiraKeys = jiraKeys.filter(key => !existingOrderNums.has(key));
    const newRows = newJiraKeys.map(key => ({
      toBottom: true,
      cells: [{ columnId: orderColumnId, value: key }]
    }));

    // 4. Add new rows to Smartsheet
    if (newRows.length > 0) {
      await fetch(`https://api.smartsheet.com/2.0/sheets/${smartsheetSheetId}/rows`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${smartsheetApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ toBottom: true, rows: newRows })
      });
    }

    return res.status(200).json({ success: true, inserted: newRows.length });
  } catch (err) {
    console.error('[Jira→Smartsheet Sync Error]', err);
    return res.status(500).json({ error: err.message });
  }
}
