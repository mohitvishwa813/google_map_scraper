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

2. Run the scraper:
   ```bash
   npm start
   ```

## Configuration
Open `main.js` and change the `keyword` variable to your desired search term (e.g., `'plumber'`, `'restaurant in London'`).

```javascript
const keyword = 'dentist'; 
```

## How it works
1. **Search**: Navigates to the Google Maps search URL.
2. **Scroll**: Finds the results feed and scrolls until the end of the list is reached.
3. **Crawl**: Visits each unique business page found in the list.
4. **Scrape**: Parses the page for details and optionally fetches the website footer/home for emails.
5. **Store**: Exports data to JSON/CSV format in the local storage directory.

> [!NOTE]
> Google Maps often limits results to ~200 items per search. For larger datasets, try searching with more specific location keywords (e.g., "dentist Manhattan", "dentist Queens").
