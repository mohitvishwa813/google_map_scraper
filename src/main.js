import { PlaywrightCrawler, Dataset, Configuration } from 'crawlee';
import { Actor } from 'apify';
import { router } from './routes.js';
import { loadCookies } from './cookieLoader.js';
import { exportResults } from './exporter.js';
import { CONFIG } from './config.js';
import chalk from 'chalk';

await Actor.init();

console.log(chalk.magenta.bold(`
╔══════════════════════════════════════════╗
║     Instagram Scraper — by Crawlee       ║
║     Keyword → Account Username & Name    ║
╚══════════════════════════════════════════╝
`));

// ─── Setup ──────────────────────────────────────────────────────────────────
Configuration.getGlobalConfig().set('purgeOnStart', true);

// ─── Get Input ───────────────────────────────────────────────────────────────
const input = await Actor.getInput();
let keywordsToUse = CONFIG.keywords;

if (input && input.keyword) {
  const { keyword, location, maxAccounts, webhookUrl, webhookTimeoutMs } = input;
  if (maxAccounts !== undefined) CONFIG.maxAccountsPerSource = parseInt(maxAccounts, 10);
  if (webhookUrl) CONFIG.webhookUrl = webhookUrl;
  if (webhookTimeoutMs !== undefined) CONFIG.webhookTimeoutMs = parseInt(webhookTimeoutMs, 10);
  
  const fullKeyword = location ? `${keyword} ${location}` : keyword;
  keywordsToUse = [fullKeyword];
  console.log(chalk.cyan(`📝 Using input - Keyword: "${keyword}", Location: "${location || 'None'}", Max: ${CONFIG.maxAccountsPerSource}`));
} else {
  // Fallback to CLI args for local dev
  const args = process.argv.slice(2);
  const positionalArgs = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--webhook') {
      const next = args[i + 1];
      if (next) {
        CONFIG.webhookUrl = next;
        i++;
      }
      continue;
    }
    if (arg.startsWith('--webhook=')) {
      CONFIG.webhookUrl = arg.slice('--webhook='.length);
      continue;
    }
    if (arg === '--webhook-timeout-ms') {
      const next = args[i + 1];
      if (next) {
        CONFIG.webhookTimeoutMs = parseInt(next, 10);
        i++;
      }
      continue;
    }
    if (arg.startsWith('--webhook-timeout-ms=')) {
      CONFIG.webhookTimeoutMs = parseInt(arg.slice('--webhook-timeout-ms='.length), 10);
      continue;
    }
    positionalArgs.push(arg);
  }

  if (positionalArgs.length > 0) {
    const keyword = positionalArgs[0];
    const location = positionalArgs[1] && !isNaN(positionalArgs[1]) ? '' : (positionalArgs[1] || '');
    const limit = positionalArgs[2] || (positionalArgs[1] && !isNaN(positionalArgs[1]) ? positionalArgs[1] : null);
    
    if (limit) CONFIG.maxAccountsPerSource = parseInt(limit, 10);
    
    const fullKeyword = location ? `${keyword} ${location}` : keyword;
    keywordsToUse = [fullKeyword];
  }
}

// ─── Load cookies ────────────────────────────────────────────────────────────
const cookies = await loadCookies();
if (!cookies.length) {
  console.log(chalk.yellow('⚠  No cookies found. Instagram may block unauthenticated requests.'));
  console.log(chalk.yellow('   Add your cookies to cookies.json (see cookies.example.json for format).\n'));
} else {
  console.log(chalk.green(`✔  Loaded ${cookies.length} cookie(s) from cookies.json`));
  
  // Quick check for essential cookies
  const hasSession = cookies.some(c => c.name === 'sessionid');
  if (hasSession) {
    console.log(chalk.cyan('✨ Session cookie (sessionid) detected. Authenticated mode active.\n'));
  } else {
    console.log(chalk.yellow('⚠  No "sessionid" cookie found. You might be browsing as a guest.\n'));
  }
}

// ─── Build start URLs ────────────────────────────────────────────────────────
const startUrls = [];

for (const keyword of keywordsToUse) {
  startUrls.push({
    url: 'https://www.instagram.com/explore/',
    label: 'KEYWORD_SEARCH',
    userData: { keyword },
    uniqueKey: `KEYWORD_SEARCH:${keyword}:${Date.now()}`,
  });
  console.log(chalk.cyan(`🔍 Queued fresh search for: "${keyword}"`));
}

if (!startUrls.length) {
  console.log(chalk.red('✖  No keywords provided! Use Apify input or CLI: npm start <keyword> [location]'));
  await Actor.exit();
}

console.log('');

// ─── Crawler ─────────────────────────────────────────────────────────────────
const crawler = new PlaywrightCrawler({
  requestHandlerTimeoutSecs: CONFIG.requestTimeoutSecs,
  maxRequestsPerCrawl: CONFIG.maxRequests,
  maxConcurrency: CONFIG.maxConcurrency,

  launchContext: {
    launchOptions: {
      headless: CONFIG.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',   // prevents crashes in low /dev/shm containers
        '--disable-gpu',
        '--disable-extensions',
      ],
    },
  },

  preNavigationHooks: [
    async ({ page }) => {
      // Stealth: hide Playwright fingerprints
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      });

      // Inject cookies before navigation
      if (cookies.length) {
        await page.context().addCookies(cookies);
      }
    },
  ],

  requestHandler: router,

  failedRequestHandler: async ({ request }, error) => {
    console.log(chalk.red(`✖  Failed [${request.label}]: ${request.url} — ${error.message}`));
  },
});

await crawler.run(startUrls);

// ─── Export results ───────────────────────────────────────────────────────────
console.log(chalk.magenta('\n📦 Exporting results...'));
await exportResults();

console.log(chalk.green.bold('\n✅ Scraping complete!\n'));
console.log(`   Results saved to: ${chalk.white('output/results.json')} and ${chalk.white('output/results.csv')}`);

await Actor.exit();
