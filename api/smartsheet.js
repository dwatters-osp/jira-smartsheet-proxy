// /api/smartsheet.js
import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = `https://api.smartsheet.com${req.url.replace('/api/smartsheet', '')}`;

  try {
    const response = await axios({
      method: req.method,
      url,
      headers: {
        Authorization: `Bearer ${req.headers['x-api-key']}`,
        'Content-Type': 'application/json'
      },
      data: req.body
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).send(error.message || 'Smartsheet proxy error');
  }
}
