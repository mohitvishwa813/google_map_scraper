# Google Maps Scraper

A robust Google Maps scraper built with [Crawlee](https://crawlee.dev/) and [Playwright](https://playwright.dev/).

## Features
- **Keyword Search**: Automatically searches for your target keyword.
- **Infinite Scroll**: Scrolls the results sidebar to capture all available businesses.
- **Data Extraction**: Extracts business name, rating, reviews count, category, address, phone, and website.
- **Email Discovery**: Automatically visits the business's website (if available) to search for email addresses.
- **Incremental Saving**: Saves data to `storage/datasets/default` as it scrapes.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

## API Usage

The scraper also runs as an Express server.

1. Start the server:
   ```bash
   npm run serve
   ```

2. Send a POST request to scrape data:

### URL
`http://localhost:3000/scrape`

### Parameters (JSON Body)
- `keyword` (string, required): The service/business to search for.
- `location` (string, optional): The city or area.
- `maxResults` (number, optional, default: 100): Maximum results to fetch.
- `webhookUrl` (string, optional): A URL to send the results to once finished.

### Example CURL
```bash
curl -X POST http://localhost:3000/scrape \
     -H "Content-Type: application/json" \
     -d '{
       "keyword": "dentist",
       "location": "New York",
       "maxResults": 10
     }'
```

## Configuration
Open `main.js` and change the `keyword` variable to your desired search term (e.g., `'plumber'`, `'restaurant in London'`).

```javascript
const keyword = 'dentist'; 
```

## Deployment (Render.com)

Render's standard environment doesn't allow `sudo`, which Playwright needs to install dependencies. To fix this, I have added a **Dockerfile**.

### Steps to Deploy:

1.  **Push Changes**: Ensure the `Dockerfile` and updated `package.json` are pushed to your GitHub.
2.  **Change Service Type**: In your Render Dashboard, you might need to recreate the service as a **Web Service** using **Docker** as the runtime.
3.  **Settings**:
    - **Runtime**: `Docker`
    - **Build Command**: (Empty/None - Docker handles it)
    - **Start Command**: (Empty/None - Docker handles it)
4.  **Environment Variables**:
    - `PORT` = `3000`

> [!IMPORTANT]
> Using Docker is the most reliable way to run scrapers on Render because it includes all the necessary Linux libraries for Chromium to run headless.

## How it works
1. **Search**: Navigates to the Google Maps search URL.
2. **Scroll**: Finds the results feed and scrolls until the end of the list is reached.
3. **Crawl**: Visits each unique business page found in the list.
4. **Scrape**: Parses the page for details like title, address, phone, and website.
5. **Storage**: Data is returned in the API response and can optionally be sent to a webhook.

> [!NOTE]
> Google Maps often limits results to ~200 items per search. For larger datasets, the scraper automatically appends alphabetical suffixes to keywords to bypass scrolling limits.
