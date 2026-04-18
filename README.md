# Instagram Scraper — Crawlee + Playwright

Search Instagram by **hashtag** or **keyword**, collect matching accounts, and extract their full profile info including **bio, followers, website, email, and more**.

---

## 📁 Project Structure

```
instagram-scraper/
├── src/
│   ├── main.js          ← Entry point (run this)
│   ├── config.js        ← ✏️  Edit hashtags, keywords & settings here
│   ├── routes.js        ← Page handlers (hashtag / search / profile)
│   ├── parser.js        ← Profile data extractor
│   ├── cookieLoader.js  ← Reads cookies.json
│   └── exporter.js      ← Saves JSON + CSV output
├── cookies.json         ← ✏️  Paste your Instagram cookies here
├── cookies.example.json ← Format reference
├── output/              ← Created automatically
│   ├── results.json
│   ├── results.csv
│   └── summary.txt
└── package.json
```

---

## 🚀 Quick Start

### 1. Install dependencies

```bash
npm install
npx playwright install chromium
```

### 2. Configure what to scrape

Edit **`src/config.js`**:

```js
hashtags: ['#photography', '#travel'],   // hashtags to search
keywords: ['digital art', 'AI tools'],  // keywords to search
maxAccountsPerSource: 50,               // accounts to collect per source
```

### 3. Add your cookies (recommended)

Instagram blocks unauthenticated scrapers aggressively. Using your account's cookies dramatically improves results.

**How to get cookies (Chrome):**
1. Install the [EditThisCookie](https://chrome.google.com/webstore/detail/editthiscookie/) extension
2. Log in to Instagram in Chrome
3. Click EditThisCookie → Export (copies JSON to clipboard)
4. Paste into `cookies.json`

**Or use the Cookie-Editor extension** — export as JSON and paste into `cookies.json`.

The minimum cookies needed are: `sessionid`, `csrftoken`, `ds_user_id`

### 4. Run

```bash
npm start
```

---

## 📊 Output

Results are saved to the `output/` folder:

| File | Description |
|------|-------------|
| `results.json` | Full data, all fields |
| `results.csv` | Spreadsheet-friendly |
| `summary.txt` | Count per source |

### Webhook (optional)

Send results to a webhook after the scrape finishes:

- Env var: `WEBHOOK_URL="https://<your-app>.onrender.com/webhook/<id>"`
- CLI: `npm start -- <keyword> [location] [limit] --webhook "https://..."`
- Apify input: `{ "keyword": "cafe", "location": "London", "maxAccounts": 5, "webhookUrl": "https://..." }`

### Fields collected per account

| Field | Description |
|-------|-------------|
| `username` | Instagram handle |
| `fullName` | Display name |
| `bio` | Full biography text |
| `website` | Bio website link |
| `email` | Email extracted from bio |
| `phone` | Phone from bio/business profile |
| `followersCount` | Follower count |
| `followingCount` | Following count |
| `postsCount` | Number of posts |
| `category` | Business category (if set) |
| `isVerified` | Blue tick |
| `isPrivate` | Private account flag |
| `externalUrl` | Bio link |
| `profileUrl` | Direct Instagram URL |
| `source` | Which hashtag/keyword found this account |
| `scrapedAt` | Timestamp |

---

## ⚙️ Configuration Options (`src/config.js`)

| Setting | Default | Description |
|---------|---------|-------------|
| `hashtags` | `['#photography']` | Hashtags to scrape |
| `keywords` | `['digital art']` | Keywords to search |
| `maxAccountsPerSource` | `50` | Accounts per hashtag/keyword |
| `maxPostsToScan` | `30` | Posts to check per hashtag page |
| `maxRequests` | `500` | Hard cap on total requests |
| `maxConcurrency` | `2` | Parallel browser tabs |
| `headless` | `true` | Run without visible browser |
| `delayMs` | `2000` | Base delay between requests (ms) |

---

## ⚠️ Tips & Troubleshooting

- **Always use cookies** — Instagram requires login for most data
- **Keep concurrency low** (1–2) to avoid rate limiting
- **Check `output/debug-hashtag-*.png`** if a hashtag returns no results — it shows what the browser saw
- Crawlee stores intermediate data in `storage/` — delete it with `npm run clean` between runs
- Instagram frequently updates its page structure; the parser uses multiple fallback strategies

---

## 🧪 Test a single profile

You can quickly test the profile parser by adding a profile URL directly:

```js
// In src/main.js, add to startUrls:
{
  url: 'https://www.instagram.com/natgeo/',
  label: 'PROFILE',
  userData: { source: 'manual-test' },
}
```

---

## 📝 Legal

This tool is for **personal research and educational use only**. Scraping Instagram may violate their [Terms of Service](https://help.instagram.com/581066165581870). Use responsibly and respect rate limits.
