# HungerHub Enhanced

A Tampermonkey userscript that displays Google Places ratings, review excerpts, and Google Maps links directly on the [hungerhub Uncatering](https://uncatering.hungerhub.com/) restaurant listing page.

## What it does

When you open the hungerhub restaurant page, the script automatically:

- Fetches the Google Places rating for each listed restaurant
- Displays a color-coded badge (green 4+, yellow 3-4, red below 3) with star rating and review count
- Lets you click the badge to expand the top 3 Google review excerpts
- Provides a direct "View on Google Maps" link for each restaurant
- Caches results for 30 days to minimize API calls

## Prerequisites

1. **Tampermonkey** browser extension ([Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo), [Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/), [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd))
2. **Google Places API key** with the Places API (New) enabled

## Setting up a Google Places API Key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Navigate to **APIs & Services > Library**
4. Search for **Places API (New)** and enable it
5. Go to **APIs & Services > Credentials**
6. Click **Create Credentials > API Key**
7. (Recommended) Restrict the key:
   - Under **Application restrictions**, select **HTTP referrers** and add `https://uncatering.hungerhub.com/*`
   - Under **API restrictions**, select **Restrict key** and choose **Places API (New)**
8. Copy the API key

**Cost**: The free tier provides 5,000 Text Search Pro requests per month at no charge. With 30-day caching, personal use will stay well within this limit.

## Installation

1. Install the Tampermonkey browser extension (links above)
2. Open the raw `hungerhub-enhanced.user.js` file or create a new userscript in Tampermonkey
3. Paste the contents of `hungerhub-enhanced.user.js`
4. Save the script (Ctrl+S / Cmd+S)

## Configuration

After installation, configure the script via the Tampermonkey menu (click the Tampermonkey icon in your browser toolbar):

| Menu Command | Description |
|---|---|
| **Set Google Places API Key** | Enter your API key (required) |
| **Set Restaurant CSS Selector** | Change the selector used to find restaurant names (default: `h5`) |
| **Set Location Suffix** | Change the location appended to searches (default: `Toronto`) |
| **Clear Rating Cache** | Purge all cached rating data |

## How it works

```
Restaurant page loads
        │
        ▼
MutationObserver detects h5 elements
        │
        ▼
Check local cache (GM_setValue, 30-day TTL)
        │
   ┌────┴────┐
   │ HIT     │ MISS
   │         ▼
   │   Google Places API
   │   Text Search Pro
   │   (GM_xmlhttpRequest)
   │         │
   │         ▼
   │   Cache result
   └────┬────┘
        │
        ▼
Inject rating badge + review panel
```

## Development

The `test/` directory contains a local test harness that mimics the hungerhub page layout. To use it:

```bash
cd test
python3 -m http.server 8765
# Open http://localhost:8765
```

Use **Mock Data** mode to test without an API key, or enter your key and switch to **Live API** mode to test with real Google Places data.
