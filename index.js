const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const cors = require('cors');
app.use(cors({
  origin: '*',
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Token', 'X-API-Key'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// Proxy for Smartsheet API
app.all('/api/smartsheet/*', async (req, res) => {
  try {
    const apiPath = req.url.replace('/api/smartsheet', '');
    const response = await axios({
      method: req.method,
      url: `https://api.smartsheet.com${apiPath}`,
      headers: {
        ...req.headers,
        'Authorization': `Bearer ${req.headers['x-api-key']}`, // Use custom header for security
        'Content-Type': 'application/json'
      },
      data: req.body
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).send(error.message);
  }
});

// Proxy for Jira API (adjust for your Jira Server endpoint)
app.all('/api/jira/*', async (req, res) => {
  try {
    const apiPath = req.url.replace('/api/jira', '');
    const response = await axios({
      method: req.method,
      url: `https://prodfjira.cspire.net${apiPath}`,
      headers: {
        ...req.headers,
        'Authorization': `Bearer ${req.headers['x-api-token']}`, // Custom header; change to Basic if needed for Jira
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      data: req.body
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).send(error.message);
  }
});

app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
});