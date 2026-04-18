import { PlaywrightCrawler, Dataset, log as crawleeLog } from 'crawlee';
import axios from 'axios';
import readline from 'readline';

const ask = readline.createInterface({ input: process.stdin, output: process.stdout });

async function getInputs() {
    return new Promise((resolve) => {
        ask.question('Enter keyword (e.g. dentist): ', (keyword) => {
            ask.question('Enter location (optional): ', (location) => {
                ask.question('Max results (default 100): ', (max) => {
                    ask.close();
                    resolve({
                        keyword: keyword || 'dentist',
                        location: location || '',
                        maxResults: max ? parseInt(max) : 100
                    });
                });
            });
        });
    });
}

const { keyword, location, maxResults } = await getInputs();

async function findEmailOnWebsite(url) {
    if (!url || url === 'N/A' || !url.startsWith('http')) return 'N/A';
    try {
        const response = await axios.get(url, { 
            timeout: 6000, 
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = response.data;
        const matches = html.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi);
        return matches ? [...new Set(matches.map(e => e.toLowerCase()))].join(', ') : 'N/A';
    } catch (e) {}
    return 'N/A';
}

let scrapedCount = 0;

const crawler = new PlaywrightCrawler({
    maxConcurrency: 5,
    requestHandlerTimeoutSecs: 90,
    launchContext: {
        launchOptions: {
            headless: true,
            args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
        }
    },
    async requestHandler({ page, request, crawler, log }) {
        if (scrapedCount >= maxResults) return;

        if (request.label === 'DETAIL') {
            try {
                await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
                const titleSelector = 'h1.fontHeadlineLarge, h1.DUwDvf';
                await page.waitForSelector(titleSelector, { timeout: 15000 });

                const detail = await page.evaluate(() => {
                    const get = (s) => document.querySelector(s)?.innerText?.trim() || 'N/A';
                    
                    // --- SUPER ROBUST PHONE EXTRACTION ---
                    let phone = 'N/A';
                    const phoneEl = document.querySelector('button[data-item-id^="phone:tel"], a[data-item-id^="phone:tel"], button[aria-label*="Phone"], button[data-tooltip*="phone"]');
                    if (phoneEl) {
                        phone = phoneEl.innerText.trim();
                    }
                    if (phone === 'N/A' || !/[0-9]/.test(phone)) {
                        const mainContent = document.querySelector('div[role="main"], div.m67qEc, div.ZHeE1b');
                        if (mainContent) {
                            const text = mainContent.innerText;
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
                        phone: phone.trim(),
                        website: document.querySelector('a[data-item-id="authority"]')?.href || 'N/A',
                        rating: document.querySelector('span[aria-label*="star"]')?.getAttribute('aria-label') || 'N/A',
                        url: window.location.href
                    };
                });

                detail.email = await findEmailOnWebsite(detail.website);
                
                await Dataset.pushData(detail);
                scrapedCount++;
                log.info(`[${scrapedCount}] ✅ Scraped: ${detail.name} | Phone: ${detail.phone}`);

            } catch (err) {
                log.warning(`Failed ${request.url}: ${err.message}`);
            }
        } else {
            log.info(`Searching: ${request.url}`);
            await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
            
            const feedSelector = 'div[role="feed"]';
            try { await page.waitForSelector(feedSelector, { timeout: 15000 }); } catch (e) {}

            for (let i = 0; i < 3; i++) {
                await page.evaluate((sel) => {
                    const f = document.querySelector(sel);
                    if (f) f.scrollTo(0, f.scrollHeight);
                }, feedSelector);
                await page.waitForTimeout(1000);
            }

            const links = await page.evaluate(() => 
                Array.from(document.querySelectorAll('a[href*="/maps/place/"]')).map(a => a.href)
            );
            
            const uniqueLinks = [...new Set(links)].slice(0, 15);
            await crawler.addRequests(uniqueLinks.map(url => ({ url, label: 'DETAIL' })));
        }
    },
});

const alphabet = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const sources = alphabet.map(letter => ({
    url: `https://www.google.com/maps/search/${encodeURIComponent(`${keyword} ${letter}`.trim() + (location ? ` in ${location}` : ''))}`,
    label: 'SEARCH'
}));

log.info(`🚀 Starting CLI Scrape for: ${keyword} | Max: ${maxResults}`);
await crawler.run(sources);
log.info('🎉 Finished! Results saved to local storage.');
process.exit(0);