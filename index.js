// index.js

const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// 🔧 Handle ALL preflight requests (CORS-safe)
app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Token, X-API-Key');
  return res.status(200).end();
});

// 🌐 CORS headers for every response
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// ✅ Diagnostic test route
app.post('/api/test-connections', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Token, X-API-Key');

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
    console.error('❌ Smartsheet error:', e.response?.status, e.message);
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
    console.error('❌ Jira error:', e.response?.status, e.message);
    results.jira = false;
  }

  res.json(results);
});

// 📡 Proxy for Smartsheet API
app.all('/api/smartsheet/*', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const apiPath = req.url.replace('/api/smartsheet', '');

  try {
    const response = await axios({
      method: req.method,
      url: `https://api.smartsheet.com${apiPath}`,
      headers: {
        Authorization: `Bearer ${req.headers['x-api-key']}`,
        'Content-Type': 'application/json'
      },
      data: req.body
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Smartsheet proxy error:', error.response?.status, error.message);
    res.status(error.response?.status || 500).send(error.message || 'Unknown proxy error');
  }
});

// 📡 Proxy for Jira API
app.all('/api/jira/*', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const apiPath = req.url.replace('/api/jira', '');

  try {
    const response = await axios({
      method: req.method,
      url: `https://prodfjira.cspire.net${apiPath}`,
      headers: {
        Authorization: `Bearer ${req.headers['x-api-token']}`,
        Accept: 'application/json',
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
  console.log(`🚀 Proxy server running on port ${port}`);
});
