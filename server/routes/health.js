/**
 * Health Check Endpoint
 * Returns system status for monitoring and load balancers
 */
import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// Solr config (read from config file if available)
let solrConfig = { host: 'localhost', port: 8983, core: 'tracks' };
try {
  const configPath = path.join(__dirname, '..', 'config', 'solr.json');
  if (fs.existsSync(configPath)) {
    solrConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch (e) {
  // Use defaults
}

/**
 * GET /api/health
 * Returns comprehensive health status
 */
router.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    solr: { status: 'unknown' },
    sqlite: { status: 'unknown' },
    anthropic_api: { configured: !!process.env.ANTHROPIC_API_KEY }
  };

  // Check Solr
  try {
    const solrUrl = `http://${solrConfig.host}:${solrConfig.port}/solr/${solrConfig.core}/admin/ping`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(solrUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      // Get document count
      const statsUrl = `http://${solrConfig.host}:${solrConfig.port}/solr/${solrConfig.core}/select?q=*:*&rows=0&wt=json`;
      const statsResponse = await fetch(statsUrl);
      const statsData = await statsResponse.json();

      health.solr = {
        status: 'connected',
        url: `${solrConfig.host}:${solrConfig.port}`,
        core: solrConfig.core,
        numDocs: statsData.response?.numFound || 0
      };
    } else {
      health.solr = { status: 'error', message: `HTTP ${response.status}` };
    }
  } catch (e) {
    health.solr = {
      status: 'disconnected',
      message: e.name === 'AbortError' ? 'timeout' : e.message
    };
  }

  // Check SQLite
  try {
    const dbPath = path.join(__dirname, '..', 'apm_music.db');
    const db = new Database(dbPath, { readonly: true });

    const trackCount = db.prepare('SELECT COUNT(*) as count FROM tracks').get();
    const facetCount = db.prepare('SELECT COUNT(*) as count FROM facet_taxonomy').get();

    health.sqlite = {
      status: 'connected',
      track_count: trackCount.count,
      facet_count: facetCount.count
    };

    db.close();
  } catch (e) {
    health.sqlite = { status: 'error', message: e.message };
  }

  // Determine overall health
  const isHealthy =
    health.solr.status === 'connected' &&
    health.sqlite.status === 'connected';

  health.status = isHealthy ? 'healthy' : 'degraded';

  res.status(isHealthy ? 200 : 503).json(health);
});

/**
 * GET /api/health/live
 * Simple liveness probe for Kubernetes
 */
router.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * GET /api/health/ready
 * Readiness probe - checks if service can accept traffic
 */
router.get('/health/ready', async (req, res) => {
  try {
    // Quick SQLite check
    const dbPath = path.join(__dirname, '..', 'apm_music.db');
    const db = new Database(dbPath, { readonly: true });
    db.prepare('SELECT 1').get();
    db.close();

    res.status(200).json({ status: 'ready' });
  } catch (e) {
    res.status(503).json({ status: 'not ready', error: e.message });
  }
});

export default router;
