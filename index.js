const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Token, X-API-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// ✅ Diagnostics route
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
  } catch {
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
  } catch {
    results.jira = false;
  }

  res.json(results);
});

// Proxy for Smartsheet API
app.all('/api/smartsheet/*', async (req, res) => {
  try {
    const apiPath = req.url.replace('/api/smartsheet', '');
    const response = await axios({
      method: req.method,
      url: `https://api.smartsheet.com${apiPath}`,
      headers: {
        ...req.headers,
        'Authorization': `Bearer ${req.headers['x-api-key']}`,
        'Content-Type': 'application/json'
      },
      data: req.body
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).send(error.message);
  }
});

// Proxy for Jira API
app.all('/api/jira/*', async (req, res) => {
  try {
    const apiPath = req.url.replace('/api/jira', '');
    const response = await axios({
      method: req.method,
      url: `https://prodfjira.cspire.net${apiPath}`,
      headers: {
        ...req.headers,
        'Authorization': `Bearer ${req.headers['x-api-token']}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      data: req.body
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Jira proxy error:', error.response?.status, error.message);
    res.status(error.response?.status || 500).send(error.message || 'Unknown proxy error');
  }
});

app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
});
