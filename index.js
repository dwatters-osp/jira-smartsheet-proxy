app.post('/api/test-connections', async (req, res) => {
  const { smartsheetSheetId } = req.body;
  const smartsheetKey = req.headers['x-api-key'];
  const jiraToken = req.headers['x-api-token'];

  const results = {
    proxyReachable: true,
    smartsheet: false,
    jira: false
  };

  try {
    const smartsheetResp = await axios.get(`https://api.smartsheet.com/2.0/sheets/${smartsheetSheetId}`, {
      headers: { Authorization: `Bearer ${smartsheetKey}` }
    });
    results.smartsheet = smartsheetResp.status === 200;
  } catch (e) {
    console.error('❌ Smartsheet API error:', e.response?.status, e.message);
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
    console.error('❌ Jira API error:', e.response?.status, e.message);
    results.jira = false;
  }

  try {
    res.status(200).json(results);
  } catch (finalErr) {
    console.error('❌ Failed to send JSON response:', finalErr);
    res.status(500).send('Internal server error');
  }
});
