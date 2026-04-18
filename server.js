import express from 'express';
import { PlaywrightCrawler, log as crawleeLog, Configuration, RequestQueue } from 'crawlee';
import { MemoryStorage } from '@crawlee/memory-storage';
import axios from 'axios';

const memoryStorage = new MemoryStorage();
const config = new Configuration({ storageClient: memoryStorage });

const app = express();
app.use(express.json());

async function runScraper(keyword, location, maxResultsLimit, webhookUrl) {
    const results = [];
    let totalScraped = 0;
    const requestQueue = await RequestQueue.open(null, { storageClient: memoryStorage });

    const alphabet = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const sources = alphabet.map(letter => ({
        url: `https://www.google.com/maps/search/${encodeURIComponent(`${keyword} ${letter}`.trim() + (location ? ` in ${location}` : ''))}`,
        label: 'SEARCH',
        forefront: true 
    }));

    const crawler = new PlaywrightCrawler({
        requestQueue,
        maxConcurrency: 10, // Back to 10 with tab optimization
        requestHandlerTimeoutSecs: 60,
        browserPoolOptions: { 
            useFingerprints: false, 
            maxOpenPagesPerBrowser: 10 
        },
        launchContext: { 
            launchOptions: { 
                headless: true, 
                args: [
                    '--disable-gpu', 
                    '--no-sandbox', 
                    '--disable-dev-shm-usage',
                    '--disable-setuid-sandbox'
                ] 
            } 
        },

        async requestHandler({ page, request, crawler, log }) {
            if (maxResultsLimit && totalScraped >= maxResultsLimit) return;

            if (request.label === 'DETAIL') {
                try {
                    await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    const titleSelector = 'h1.fontHeadlineLarge, h1.DUwDvf';
                    await page.waitForSelector(titleSelector, { timeout: 15000 });

                    const detail = await page.evaluate(() => {
                        const get = (s) => document.querySelector(s)?.innerText?.trim() || 'N/A';
                        
                        // --- SUPER ROBUST PHONE EXTRACTION ---
                        let phone = 'N/A';
                        
                        // 1. Try button with data-item-id
                        const phoneEl = document.querySelector('button[data-item-id^="phone:tel"], a[data-item-id^="phone:tel"], button[aria-label*="Phone"], button[data-tooltip*="phone"]');
                        if (phoneEl) {
                            phone = phoneEl.innerText.trim();
                        }
                        
                        // 2. Fallback: Search all text in the main detail container for phone patterns
                        if (phone === 'N/A' || !/[0-9]/.test(phone)) {
                            const mainContent = document.querySelector('div[role="main"], div.m67qEc, div.ZHeE1b');
                            if (mainContent) {
                                const text = mainContent.innerText;
                                // Common phone number regex
                                const matches = text.match(/(\+?\d{1,4}[-.\s]?)?\(?\d{2,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/g);
                                if (matches) {
                                    phone = matches.find(m => m.replace(/\D/g, '').length >= 10) || 'N/A';
                                }
                            }
                        }
                        // ------------------------------------

                        return {
                            name: get('h1'),
                            address: document.querySelector('button[data-item-id="address"]')?.innerText?.trim() || 'N/A',
                            phone: phone.trim() !== 'N/A' ? phone.trim() : 'N/A',
                            website: document.querySelector('a[data-item-id="authority"]')?.href || 'N/A',
                            rating: document.querySelector('span[aria-label*="star"]')?.getAttribute('aria-label') || 'N/A',
                            url: window.location.href
                        };
                    });

                    results.push(detail);
                    totalScraped++;
                    log.info(`[${totalScraped}] Scraped: ${detail.name} | Phone: ${detail.phone}`);

                } catch (err) {
                    log.error(`Detail error: ${err.message}`);
                }
            } else {
                // SEARCH
                await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                const feedSelector = 'div[role="feed"]';
                try { await page.waitForSelector(feedSelector, { timeout: 10000 }); } catch (e) {}

                await page.evaluate((sel) => {
                    const f = document.querySelector(sel);
                    if (f) f.scrollTo(0, f.scrollHeight);
                }, feedSelector);
                await page.waitForTimeout(1000);

                const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href*="/maps/place/"]')).map(a => a.href));
                const uniqueLinks = [...new Set(links)].slice(0, 15);
                await crawler.addRequests(uniqueLinks.map(url => ({ url, label: 'DETAIL' })));
            }
        },
    }, config);

    const scraperTask = crawler.run(sources);
    const timeoutTask = new Promise((resolve) => setTimeout(async () => {
        crawleeLog.warning('⏳ 4-minute limit reached.');
        crawler.autoscaledPool?.abort(); 
        resolve(results);
    }, 240000));

    await Promise.race([scraperTask, timeoutTask]);

    if (webhookUrl) {
        axios.post(webhookUrl, { status: "end", count: results.length, data: results }).catch(() => {});
    }

    return results;
}

app.post('/scrape', async (req, res) => {
    const { keyword, location, maxResults = 100, webhookUrl } = req.body;
    if (!keyword) return res.status(400).json({ error: 'Keyword required' });
    try {
        const results = await runScraper(keyword, location, parseInt(maxResults), webhookUrl);
        res.json({ status: "end", count: results.length, data: results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 API: http://localhost:${PORT}`));