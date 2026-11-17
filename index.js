import express from 'express';
import { router as testConnectionsRouter } from './api/test-connections.js';
import { router as clientLogRouter } from './api/client-log.js';

const app = express();
const PORT = process.env.PORT || 3000;

// The extension POSTs every Jira issue assigned to beinorthal on each sync, so the body
// grows with the job count. Express's default 100kb cap started rejecting it (413) once
// the list passed ~290 issues (Nov 2026). Jira's search caps at 1000 issues (~350 KB),
// so 5mb leaves >10x headroom.
app.use(express.json({ limit: '5mb' }));

// Mount the router at /api
app.use('/api', testConnectionsRouter);
app.use('/api', clientLogRouter); // extension step-by-step logs → Render logs ("🧩 ext ...")

app.post('/ping', (req, res) => {
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});