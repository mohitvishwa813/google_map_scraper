import { Dataset } from 'crawlee';
import fs from 'fs';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import { CONFIG } from './config.js';
import chalk from 'chalk';

const OUTPUT_DIR = path.resolve(CONFIG.outputDir);

function validateWebhookUrl(rawUrl) {
  if (!rawUrl) return { ok: false, reason: 'No webhook URL set.' };

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'Invalid URL format. Include https:// and a valid hostname.' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: `Unsupported protocol "${url.protocol}". Use http(s).` };
  }

  // Common typo seen with Render: "onrender." missing ".com"
  if (url.hostname.endsWith('.onrender.')) {
    return {
      ok: false,
      reason:
        'Hostname ends with ".onrender." (missing ".com"?) Example: https://<app>.onrender.com/webhook/<id>',
    };
  }

  // Hostnames with a trailing dot are technically valid, but almost always a mistake in this context.
  if (url.hostname.endsWith('.')) {
    return { ok: false, reason: 'Hostname ends with a trailing dot. Remove the final ".".' };
  }

  return { ok: true, url: url.toString() };
}

function formatFetchError(error) {
  const message = error?.message ? String(error.message) : String(error);
  const cause = error?.cause;
  const causeBits = [];
  if (cause?.code) causeBits.push(`code=${cause.code}`);
  if (cause?.errno) causeBits.push(`errno=${cause.errno}`);
  if (cause?.syscall) causeBits.push(`syscall=${cause.syscall}`);
  if (cause?.hostname) causeBits.push(`hostname=${cause.hostname}`);
  if (cause?.message) causeBits.push(`cause="${cause.message}"`);
  return causeBits.length ? `${message} (${causeBits.join(', ')})` : message;
}

export async function exportResults() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const dataset = await Dataset.open();
  const { items } = await dataset.getData();

  if (!items.length) {
    console.log('  No data collected.');
    return;
  }

  // ── JSON ──────────────────────────────────────────────────────────────────
  const jsonPath = path.join(OUTPUT_DIR, 'results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(items, null, 2), 'utf8');
  console.log(`  📄 JSON  → ${jsonPath}  (${items.length} accounts)`);

  // ── CSV ───────────────────────────────────────────────────────────────────
  const csvPath = path.join(OUTPUT_DIR, 'results.csv');
  const csvWriter = createObjectCsvWriter({
    path: csvPath,
    header: [
      { id: 'username',   title: 'Username' },
      { id: 'fullName',   title: 'Full Name' },
      { id: 'profileUrl', title: 'Profile URL' },
      { id: 'source',     title: 'Source (keyword)' },
      { id: 'scrapedAt',  title: 'Scraped At' },
    ],
  });
  await csvWriter.writeRecords(items);
  console.log(`  📊 CSV   → ${csvPath}  (${items.length} accounts)`);

  // ── Summary ───────────────────────────────────────────────────────────────
  const summaryPath = path.join(OUTPUT_DIR, 'summary.txt');
  const sources = {};
  for (const item of items) {
    sources[item.source] = (sources[item.source] || 0) + 1;
  }
  const lines = [
    `Instagram Scraper Results — ${new Date().toLocaleString()}`,
    `Total accounts: ${items.length}`,
    '',
    'By keyword:',
    ...Object.entries(sources).map(([src, cnt]) => `  ${src}: ${cnt} accounts`),
  ];
  fs.writeFileSync(summaryPath, lines.join('\n'), 'utf8');
  console.log(`  📝 Summary → ${summaryPath}`);

  // ── Webhook ───────────────────────────────────────────────────────────────
  const webhookCheck = validateWebhookUrl(CONFIG.webhookUrl);
  if (CONFIG.webhookUrl && !webhookCheck.ok) {
    console.log(chalk.red(`\nWebhook URL is set but invalid: ${webhookCheck.reason}`));
  }

  if (webhookCheck.ok) {
    console.log(chalk.cyan(`\n🚀 Sending data to webhook: ${CONFIG.webhookUrl}...`));
    try {
      const response = await fetch(webhookCheck.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scrapedAt: new Date().toISOString(),
          count: items.length,
          data: items,
        }),
        signal: AbortSignal.timeout(Math.max(1, Number(CONFIG.webhookTimeoutMs) || 15000)),
      });

      if (response.ok) {
        console.log(chalk.green(`  ✔  Webhook delivered successfully! (Status: ${response.status})`));
      } else {
        const responseText = await response.text().catch(() => '');
        if (responseText) {
          console.log(chalk.yellow(`  Webhook response body: ${responseText.slice(0, 500)}`));
        }
        console.log(chalk.yellow(`  ⚠  Webhook returned error status: ${response.status}`));
      }
    } catch (error) {
      console.log(chalk.red(`  Webhook error details: ${formatFetchError(error)}`));
      console.log(chalk.red(`  ✖  Webhook failed: ${error.message}`));
    }
  }
}
