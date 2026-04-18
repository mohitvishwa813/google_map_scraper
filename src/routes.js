import { createPlaywrightRouter, Dataset } from 'crawlee';
import { CONFIG } from './config.js';
import chalk from 'chalk';

export const router = createPlaywrightRouter();

// ─── Seen usernames (dedup across all sources) ───────────────────────────────
const seenUsernames = new Set();

// ─── Helper: human-like delay ─────────────────────────────────────────────────
const delay = (ms) => new Promise(r => setTimeout(r, ms + Math.random() * ms * 0.5));

// ─────────────────────────────────────────────────────────────────────────────
//  KEYWORD SEARCH PAGE — collect username + account name only
// ─────────────────────────────────────────────────────────────────────────────
router.addHandler('KEYWORD_SEARCH', async ({ page, request, log, crawler }) => {
  const { keyword } = request.userData;
  const source = `keyword:${keyword}`;
  console.log(chalk.magenta(`🏁 SEARCH STARTED: "${keyword}"`));
  log.info(`🔍 Scraping keyword: "${keyword}"`);

  await delay(800);

  // ── ALPHABETICAL DISCOVERY (Get hundreds of results) ────────────────────────
  const alphabet = ['', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];
  
  log.info(chalk.magenta(`🔍 Starting Alphabetical Discovery for "${keyword}"... this may take a moment but will find MANY more accounts.`));

  for (const char of alphabet) {
    const searchKeyword = char ? `${keyword} ${char}` : keyword;
    const apiLimit = 10;
    
    try {
      const sessionData = await page.evaluate(async ({ keyword, limit }) => {
        const getCookie = (name) => {
          const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
          return match ? match.split('=').slice(1).join('=') : null;
        };

        const csrf = getCookie('csrftoken');
        const url = `https://www.instagram.com/web/search/topsearch/?context=user&query=${encodeURIComponent(keyword)}`;

        const headers = {
          accept: 'application/json',
          'x-requested-with': 'XMLHttpRequest',
          'x-ig-app-id': '936619743392459',
        };
        if (csrf) headers['x-csrftoken'] = csrf;

        const res = await fetch(url, { method: 'GET', credentials: 'include', headers });
        if (!res.ok) return { error: `API status ${res.status}` };

        try {
          const data = await res.json();
          const list = Array.isArray(data?.users) ? data.users : [];
          const users = list
            .map((item) => item?.user || item)
            .filter((u) => u && u.username)
            .map((u) => ({ username: u.username, fullName: u.full_name || '' }))
            .slice(0, limit);
            
          return { users, success: true };
        } catch (e) {
          return { success: false, error: 'Instagram returned HTML instead of JSON. Authentication (cookies) likely required.' };
        }
      }, { keyword: searchKeyword, limit: apiLimit });

      if (sessionData.success && sessionData.users?.length) {
        let newCount = 0;
        for (const user of sessionData.users) {
          if (seenUsernames.has(user.username)) continue;
          seenUsernames.add(user.username);

          await Dataset.pushData({
            username: user.username,
            fullName: user.fullName || '',
            profileUrl: `https://www.instagram.com/${user.username}/`,
            source: `${source} (scan:${char || 'top'})`,
            scrapedAt: new Date().toISOString(),
          });
          newCount++;
        }
        if (newCount > 0) {
          log.info(`  [${char || 'top'}] Found ${newCount} new accounts.`);
        }
      }
      
      // Stop if we hit the global limit
      const currentDataset = await Dataset.open();
      const info = await currentDataset.getInfo();
      if (CONFIG.maxAccountsPerSource > 0 && info.itemCount >= CONFIG.maxAccountsPerSource) {
        log.info(chalk.green(`✅ Reached target limit of ${CONFIG.maxAccountsPerSource} accounts.`));
        break;
      }

      await page.waitForTimeout(1000 + Math.random() * 1000); // Random delay to stay safe
    } catch (e) {
      const errorMsg = e.message || (sessionData && sessionData.error ? sessionData.error : 'Unknown error');
      log.warning(`  [${char || 'top'}] Search failed: ${errorMsg}`);
    }
  }

  // ── DEEP DISCOVERY: Search Page & Post Authors ─────────────────────────────
  const keywordUrl = `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(keyword)}`;
  log.info(`🚀 Starting Deep Discovery via: ${keywordUrl}`);
  
  await page.goto(keywordUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Scroll a bit to load more posts
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1000);
  }

  // 1. Grab account links using XPath and strict filtering
  const profileLinks = await page.evaluate(() => {
    // XPath for finding links that look like profile links
    const xpath = '//a[contains(@href, "/")]';
    const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    const links = [];
    
    // List of words that indicate the link is NOT a real profile
    const blacklist = ['/legal/', '/privacy/', '/terms/', '/about/', '/careers/', '/help/', '/directory/', '/explore/', '/reels/', '/p/'];

    for (let i = 0; i < result.snapshotLength; i++) {
      const a = result.snapshotItem(i);
      const href = a.href;
      
      // Basic profile validation
      const isInstagram = href.includes('instagram.com/');
      const isBlacklisted = blacklist.some(word => href.toLowerCase().includes(word));
      const looksLikeProfile = href.split('/').filter(Boolean).length === 3; // https://www.instagram.com/username/

      if (isInstagram && !isBlacklisted && looksLikeProfile) {
        links.push({ href, text: a.innerText });
      }
    }
    return links;
  });

  for (const { href: profileUrl } of profileLinks) {
    const u = profileUrl.split('/').filter(Boolean).pop();
    if (u && !seenUsernames.has(u)) {
      seenUsernames.add(u);
      await crawler.addRequests([{
        url: profileUrl,
        label: 'PROFILE',
        userData: { source },
      }]);
    }
  }

  // 2. Grab post links and scan their authors
  const postLinks = await page.$$eval('a[href*="/p/"]', (links) => {
    return links.map(a => a.href);
  });

  const postsToScan = CONFIG.maxPostsToScan || 20;
  const selectedPosts = postLinks.slice(0, postsToScan);
  
  log.info(`  Found ${selectedPosts.length} posts to scan for more accounts.`);

  for (const postUrl of selectedPosts) {
    await crawler.addRequests([{
      url: postUrl,
      label: 'POST',
      userData: { source },
    }]);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST PAGE — extract the post author's username then queue their profile
// ─────────────────────────────────────────────────────────────────────────────
router.addHandler('POST', async ({ page, request, log, crawler }) => {
  const { source } = request.userData;

  await delay(CONFIG.delayMs);

  try {
    await page.waitForSelector('a[href]', { timeout: 10000 });
  } catch {
    return;
  }

  const authorHref = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('header a[href], article a[href]'));
    for (const a of links) {
      const href = a.getAttribute('href');
      if (href && href.match(/^\/[a-zA-Z0-9_.]+\/?$/) && !href.includes('/explore/')) {
        return 'https://www.instagram.com' + href;
      }
    }
    return null;
  });

  if (!authorHref) return;

  const username = authorHref.split('/').filter(Boolean).pop();
  if (!username || seenUsernames.has(username)) return;

  seenUsernames.add(username);
  await crawler.addRequests([{
    url: authorHref,
    label: 'PROFILE',
    userData: { source },
  }]);
});

// ─────────────────────────────────────────────────────────────────────────────
//  PROFILE PAGE — extract username and full name only
// ─────────────────────────────────────────────────────────────────────────────
router.addHandler('PROFILE', async ({ page, request, log }) => {
  const { source } = request.userData;

  const urlUsername = request.url.split('/').filter(Boolean).pop();


  await delay(CONFIG.delayMs);

  try {
    await page.waitForSelector('header', { timeout: 15000 });
  } catch {
    log.warning(`Could not load profile: ${request.url}`);
    return;
  }

  await page.waitForTimeout(1500);


  // Extract username and full name only
  const accountData = await page.evaluate((args) => {
    const { url, source, urlUsername } = args;

    let username = urlUsername;
    let fullName = '';

    // Strategy 1: og:title meta tag
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    const titleMatch = ogTitle.match(/^(.+?)\s*[@•(]/);
    if (titleMatch) fullName = titleMatch[1].trim();

    // Strategy 2: DOM
    if (!fullName) {
      const nameEl = document.querySelector('h1, header h2, [data-testid="user-name"]');
      if (nameEl) fullName = nameEl.innerText.trim();
    }

    return {
      username,
      fullName,
      profileUrl: url,
      source,
      scrapedAt: new Date().toISOString(),
    };
  }, { url: request.url, source, urlUsername });

  if (!accountData || !accountData.username) {
    log.warning(`  Could not parse profile: ${request.url}`);
    return;
  }

  // No longer blocking here as uniqueness is handled at the queuing stage
  // and we want to allow discovery-queued profiles to be fully scraped.

  await Dataset.pushData(accountData);

  console.log(
    chalk.green('✔ ') +
    chalk.white.bold(`@${accountData.username}`) +
    chalk.gray(` | ${accountData.fullName || '(no name)'} | source: ${source}`)
  );
});
