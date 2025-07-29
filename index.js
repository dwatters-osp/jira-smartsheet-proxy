import express from 'express';
import { router as testConnectionsRouter } from './api/test-connections.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Mount the router at /api
app.use('/api', testConnectionsRouter);

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});