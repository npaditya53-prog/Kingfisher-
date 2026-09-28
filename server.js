import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');

// Serve static files from Vite build output
app.use(express.static(DIST_DIR));

// Health check endpoint for Render / container health checks
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'kingfisher',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// SPA fallback: any unmatched route serves index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kingfisher production server listening on http://0.0.0.0:${PORT}`);
});
