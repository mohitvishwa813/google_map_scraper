import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;
const INPUT_PATH = path.join(ROOT, 'storage', 'key_value_stores', 'default', 'INPUT.json');
const OUTPUT_PATH = path.join(ROOT, 'output', 'results.json');

let isRunning = false;

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.url === '/health' || req.url === '/') {
    return send(res, 200, { status: 'ok', running: isRunning });
  }

  if (req.method !== 'POST') {
    return send(res, 405, { error: 'POST required' });
  }

  if (isRunning) {
    return send(res, 503, { error: 'Scraper already running, try again shortly' });
  }

  let input;
  try {
    input = await parseBody(req);
  } catch (e) {
    return send(res, 400, { error: e.message });
  }

  if (!input.keyword) {
    return send(res, 400, { error: '"keyword" field is required' });
  }

  // Write input so Actor.getInput() picks it up
  fs.mkdirSync(path.dirname(INPUT_PATH), { recursive: true });
  fs.writeFileSync(INPUT_PATH, JSON.stringify(input), 'utf8');

  // Clean previous output so we don't return stale data
  if (fs.existsSync(OUTPUT_PATH)) fs.unlinkSync(OUTPUT_PATH);

  isRunning = true;
  console.log(`\n▶ Scraping: keyword="${input.keyword}" location="${input.location || ''}"`);

  const child = spawn(process.execPath, ['src/main.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      APIFY_LOCAL_STORAGE_DIR: path.join(ROOT, 'storage'),
    },
    stdio: 'inherit',
  });

  let responded = false;

  child.on('error', (err) => {
    isRunning = false;
    if (!responded) {
      responded = true;
      send(res, 500, { success: false, error: err.message });
    }
  });

  child.on('close', (code) => {
    isRunning = false;
    if (responded) return;
    responded = true;

    if (fs.existsSync(OUTPUT_PATH)) {
      try {
        const data = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
        console.log(`✅ Done — ${data.length} accounts returned`);
        send(res, 200, { success: true, count: data.length, data });
      } catch (e) {
        send(res, 500, { success: false, error: 'Failed to read results: ' + e.message });
      }
    } else {
      send(res, 500, { success: false, error: `Scraper exited with code ${code} — no results file produced` });
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ Instagram Scraper API listening on port ${PORT}`);
  console.log(`   POST /scrape  { keyword, location, maxAccounts, webhookUrl }`);
  console.log(`   GET  /health`);
});
