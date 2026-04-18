// ─────────────────────────────────────────────────────────────
//  Instagram Scraper Configuration
//  Edit this file to control what gets scraped and how.
// ─────────────────────────────────────────────────────────────

export const CONFIG = {
  // ── Keywords to search ─────────────────────────────────────
  // Add any keywords you want to search on Instagram Explore.
  // The scraper will return matching account usernames & names.
  keywords: [
    'giftshop',
  ],

  // Max accounts to collect per keyword
  // Set to 0 to collect all profiles found on the keyword search page.
  maxAccountsPerSource: 0,

  // How many posts to scan per keyword page to find accounts
  maxPostsToScan: 30,

  // ── Crawler behaviour ───────────────────────────────────────
  maxRequests: 500,         // Hard cap on total HTTP requests
  maxConcurrency: 2,        // Parallel browser pages (keep low to avoid bans)
  requestTimeoutSecs: 60,   // Timeout per page

  // Run browser in headless mode (true = no GUI, recommended for servers)
  headless: true,

  // Delay between requests in ms (randomised ± 50% to appear human)
  delayMs: 2000,

  // ── Webhook ────────────────────────────────────────────────
  // Optional: Send results to this URL after completion.
  // Tip (n8n on Render): your URL usually looks like:
  //   https://<your-app>.onrender.com/webhook/<id>
  //
  // You can override this via:
  //   - env var: WEBHOOK_URL
  //   - Apify input: { "webhookUrl": "https://..." }
  webhookUrl: process.env.WEBHOOK_URL || 'https://n8n-bg4s.onrender.com/webhook/scraper',
  webhookTimeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS || '15000', 10),

  // ── Output ─────────────────────────────────────────────────
  outputDir: './output',
};
