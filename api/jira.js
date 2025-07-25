// /api/jira.js
import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Token');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = `https://prodfjira.cspire.net${req.url.replace('/api/jira', '')}`;

  try {
    const response = await axios({
      method: req.method,
      url,
      headers: {
        Authorization: `Bearer ${req.headers['x-api-token']}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      data: req.body
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).send(error.message || 'Jira proxy error');
  }
}
