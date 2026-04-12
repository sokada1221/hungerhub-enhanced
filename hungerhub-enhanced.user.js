// ==UserScript==
// @name         HungerHub Enhanced
// @namespace    hungerhub-enhanced
// @version      1.2.0
// @description  Displays Google ratings, reviews, popular menu items, and Maps links on hungerhub restaurant listings
// @match        https://uncatering.hungerhub.com/restaurants*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @connect      places.googleapis.com
// @connect      generativelanguage.googleapis.com
// ==/UserScript==

(function () {
  "use strict";

  // ── Configuration ──────────────────────────────────────────────────────────

  const DEFAULTS = {
    SELECTOR: "h5.restaurant-title",
    // 180 John Street, Toronto ON M5T 1X5
    LOCATION_LAT: 43.6498,
    LOCATION_LNG: -79.3899,
    LOCATION_RADIUS: 10000,
    CACHE_TTL_MS: 30 * 24 * 60 * 60 * 1000,
    REQUEST_DELAY_MS: 250,
    LOCATION_QUERY_SUFFIX: "Toronto",
    CARD_SELECTOR: null,
  };

  function getConfig(key) {
    return GM_getValue(key, DEFAULTS[key] ?? null);
  }

  function getApiKey() {
    return GM_getValue("API_KEY", "");
  }

  function getGeminiApiKey() {
    return GM_getValue("GEMINI_API_KEY", "");
  }

  // ── Menu Commands ──────────────────────────────────────────────────────────

  GM_registerMenuCommand("Set Google Places API Key", () => {
    const current = getApiKey();
    const key = prompt("Enter your Google Places API key:", current);
    if (key !== null) {
      GM_setValue("API_KEY", key.trim());
      alert("API key saved. Reload the page to apply.");
    }
  });

  GM_registerMenuCommand("Set Restaurant CSS Selector", () => {
    const current = getConfig("SELECTOR");
    const sel = prompt(
      "CSS selector for restaurant name elements (default: h5):",
      current
    );
    if (sel !== null) {
      GM_setValue("SELECTOR", sel.trim());
      alert("Selector saved. Reload the page to apply.");
    }
  });

  GM_registerMenuCommand("Set Location Suffix", () => {
    const current = getConfig("LOCATION_QUERY_SUFFIX");
    const suffix = prompt(
      "Location suffix appended to restaurant name in search (e.g. Toronto):",
      current
    );
    if (suffix !== null) {
      GM_setValue("LOCATION_QUERY_SUFFIX", suffix.trim());
      alert("Location suffix saved. Reload the page to apply.");
    }
  });

  GM_registerMenuCommand("Set Card Container Selector", () => {
    const current = getConfig("CARD_SELECTOR") || "";
    const sel = prompt(
      "CSS selector for the card container wrapping each restaurant\n" +
        "(leave blank to auto-detect by walking up 2 levels from heading):",
      current
    );
    if (sel !== null) {
      GM_setValue("CARD_SELECTOR", sel.trim() || null);
      alert("Card selector saved. Reload the page to apply.");
    }
  });

  GM_registerMenuCommand("Set Gemini API Key", () => {
    const current = getGeminiApiKey();
    const key = prompt(
      "Enter your Gemini API key (from Google AI Studio).\n" +
        "Used to extract popular menu items from reviews when Google's\n" +
        "built-in review summary is unavailable:",
      current
    );
    if (key !== null) {
      GM_setValue("GEMINI_API_KEY", key.trim());
      alert("Gemini API key saved. Reload the page to apply.");
    }
  });

  GM_registerMenuCommand("Clear Rating Cache", () => {
    const allKeys = GM_getValue("_cacheKeys", []);
    allKeys.forEach((k) => GM_deleteValue(k));
    GM_deleteValue("_cacheKeys");
    alert(`Cleared ${allKeys.length} cached entries. Reload the page.`);
  });

  // ── Styles ─────────────────────────────────────────────────────────────────

  const STYLE = document.createElement("style");
  STYLE.textContent = `
    .hhe-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.4;
      cursor: pointer;
      user-select: none;
      transition: opacity 0.15s;
    }
    .hhe-badge:hover { opacity: 0.85; }
    .hhe-badge--green { background: #e6f4ea; color: #1e7e34; }
    .hhe-badge--yellow { background: #fff8e1; color: #b8860b; }
    .hhe-badge--red { background: #fce4ec; color: #c62828; }
    .hhe-badge--gray { background: #f5f5f5; color: #757575; }

    .hhe-stars { letter-spacing: 1px; }

    .hhe-panel {
      display: none;
      margin-top: 6px;
      padding: 10px 12px;
      background: #fafafa;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      font-size: 12.5px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 440px;
    }
    .hhe-panel--open { display: block; }

    .hhe-review {
      padding: 6px 0;
      border-bottom: 1px solid #eee;
    }
    .hhe-review:last-child { border-bottom: none; }

    .hhe-review-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
    }
    .hhe-review-author {
      font-weight: 600;
      color: #333;
    }
    .hhe-review-time {
      font-size: 11px;
      color: #999;
    }
    .hhe-review-stars {
      font-size: 11px;
      letter-spacing: 0.5px;
    }
    .hhe-review-text {
      color: #555;
      line-height: 1.45;
      margin-top: 2px;
    }

    .hhe-picks {
      padding: 6px 0 8px;
      border-bottom: 1px solid #eee;
      margin-bottom: 4px;
    }
    .hhe-picks-label {
      font-size: 11px;
      font-weight: 600;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }
    .hhe-picks-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .hhe-pick-tag {
      display: inline-block;
      padding: 2px 8px;
      background: #e8f0fe;
      color: #1967d2;
      border-radius: 12px;
      font-size: 11.5px;
      font-weight: 500;
      line-height: 1.4;
    }
    .hhe-summary-text {
      color: #444;
      font-size: 12px;
      line-height: 1.5;
      padding: 6px 0 8px;
      border-bottom: 1px solid #eee;
      margin-bottom: 4px;
    }
    .hhe-summary-attr {
      font-size: 10px;
      color: #aaa;
      margin-top: 3px;
      font-style: italic;
    }

    .hhe-maps-link {
      display: inline-block;
      margin-top: 6px;
      font-size: 12px;
      color: #1a73e8;
      text-decoration: none;
    }
    .hhe-maps-link:hover { text-decoration: underline; }

    .hhe-loading {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
      font-size: 12px;
      color: #999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    @keyframes hhe-spin {
      to { transform: rotate(360deg); }
    }
    .hhe-spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid #ddd;
      border-top-color: #999;
      border-radius: 50%;
      animation: hhe-spin 0.6s linear infinite;
    }
  `;
  document.head.appendChild(STYLE);

  // ── Cache Layer ────────────────────────────────────────────────────────────

  function normalizeName(name) {
    return name.trim().toLowerCase().replace(/['']/g, "'");
  }

  function cacheKey(name) {
    return "_hhe_" + normalizeName(name);
  }

  function getCached(name) {
    const key = cacheKey(name);
    const entry = GM_getValue(key, null);
    if (!entry) return null;
    if (Date.now() - entry.ts > DEFAULTS.CACHE_TTL_MS) {
      GM_deleteValue(key);
      return null;
    }
    return entry.data;
  }

  function setCache(name, data) {
    const key = cacheKey(name);
    GM_setValue(key, { ts: Date.now(), data });
    const keys = GM_getValue("_cacheKeys", []);
    if (!keys.includes(key)) {
      keys.push(key);
      GM_setValue("_cacheKeys", keys);
    }
  }

  // ── Google Places API ──────────────────────────────────────────────────────

  const FIELD_MASK =
    "places.displayName,places.rating,places.userRatingCount,places.reviews,places.reviewSummary,places.googleMapsUri";

  function searchPlace(restaurantName) {
    const apiKey = getApiKey();
    if (!apiKey) {
      return Promise.reject(new Error("No API key configured"));
    }

    const suffix = getConfig("LOCATION_QUERY_SUFFIX");
    const textQuery = suffix
      ? `${restaurantName} ${suffix}`
      : restaurantName;

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: `https://places.googleapis.com/v1/places:searchText`,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        data: JSON.stringify({
          textQuery,
          locationBias: {
            circle: {
              center: {
                latitude: getConfig("LOCATION_LAT"),
                longitude: getConfig("LOCATION_LNG"),
              },
              radius: getConfig("LOCATION_RADIUS"),
            },
          },
          maxResultCount: 1,
        }),
        onload(res) {
          if (res.status !== 200) {
            reject(new Error(`Places API ${res.status}: ${res.responseText}`));
            return;
          }
          try {
            const body = JSON.parse(res.responseText);
            const place = body.places?.[0];
            if (!place) {
              resolve(null);
              return;
            }
            resolve({
              name: place.displayName?.text ?? restaurantName,
              rating: place.rating ?? null,
              reviewCount: place.userRatingCount ?? 0,
              mapsUrl: place.googleMapsUri ?? null,
              reviewSummary: place.reviewSummary?.text?.text ?? null,
              reviews: (place.reviews ?? []).slice(0, 5).map((r) => ({
                author: r.authorAttribution?.displayName ?? "Anonymous",
                rating: r.rating ?? null,
                time: r.relativePublishTimeDescription ?? "",
                text:
                  r.text?.text ??
                  r.originalText?.text ??
                  "",
              })),
              popularItems: null,
            });
          } catch (e) {
            reject(e);
          }
        },
        onerror(err) {
          reject(new Error("Network error: " + (err.statusText || "unknown")));
        },
      });
    });
  }

  // ── Gemini API (Popular Items Extraction) ─────────────────────────────────

  const GEMINI_MODEL = "gemini-flash-latest";

  function extractItemsViaGemini(reviews) {
    const geminiKey = getGeminiApiKey();
    if (!geminiKey) return Promise.resolve(null);

    const reviewTexts = reviews
      .map((r) => r.text)
      .filter((t) => t && t.length > 10);
    if (reviewTexts.length === 0) return Promise.resolve(null);

    const prompt =
      "Extract the top 3-5 most recommended menu items or dishes from these restaurant reviews. " +
      "Return ONLY a JSON array of short strings (dish names), no other text.\n\n" +
      "Reviews:\n" +
      reviewTexts.map((t, i) => `${i + 1}. ${t}`).join("\n");

    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 256,
            responseMimeType: "application/json",
          },
        }),
        onload(res) {
          try {
            if (res.status !== 200) {
              console.warn("[HungerHub Enhanced] Gemini API error:", res.status, res.responseText);
              resolve(null);
              return;
            }
            const body = JSON.parse(res.responseText);
            const text = body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
            const items = JSON.parse(text);
            if (Array.isArray(items) && items.length > 0) {
              resolve(items.slice(0, 5).map((s) => String(s).trim()).filter(Boolean));
            } else {
              resolve(null);
            }
          } catch (e) {
            console.warn("[HungerHub Enhanced] Gemini parse error:", e);
            resolve(null);
          }
        },
        onerror() {
          resolve(null);
        },
      });
    });
  }

  // ── Heuristic Menu Item Extraction ──────────────────────────────────────────

  function extractItemsFromText(reviews) {
    const texts = reviews
      .map((r) => r.text)
      .filter((t) => t && t.length > 10);
    if (texts.length === 0) return null;

    const combined = texts.join(" ");
    const mentions = new Map();

    const patterns = [
      /(?:try|loved|recommend|order(?:ed)?|had|get)\s+the\s+((?:[A-Z][a-z]+)(?:\s+[a-z]+){0,3})/g,
      /[Tt]he\s+((?:[A-Z][a-z]+)(?:\s+[a-z]+){0,3})\s+(?:is|was|were)\s+(?:amazing|delicious|great|excellent|good|fantastic|incredible|perfect|outstanding|superb)/g,
      /[Bb]est\s+((?:[a-z]+)(?:\s+[a-z]+){0,2})\s+(?:I've|I have|ever|in town|in the|around)/g,
      /(?:must[- ]try|signature|famous(?:\s+for)?)\s+(?:the\s+)?((?:[A-Z][a-z]+)(?:\s+[a-z]+){0,3})/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(combined)) !== null) {
        const item = match[1].trim().replace(/\s+/g, " ");
        if (item.length >= 3 && item.length <= 40) {
          const key = item.toLowerCase();
          mentions.set(key, {
            display: item,
            count: (mentions.get(key)?.count ?? 0) + 1,
          });
        }
      }
    }

    if (mentions.size === 0) return null;

    const stopWords = new Set([
      "the food", "the place", "the restaurant", "the service",
      "the staff", "the price", "the portion", "the quality",
      "the atmosphere", "the location", "the menu", "the wait",
      "the experience", "the owner", "the delivery",
    ]);

    const sorted = [...mentions.entries()]
      .filter(([key]) => !stopWords.has(key))
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([, v]) => v.display);

    return sorted.length > 0 ? sorted : null;
  }

  // ── Rate-Limited Request Queue ─────────────────────────────────────────────

  const queue = [];
  let queueRunning = false;

  function enqueue(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      if (!queueRunning) processQueue();
    });
  }

  async function processQueue() {
    queueRunning = true;
    while (queue.length > 0) {
      const { fn, resolve, reject } = queue.shift();
      try {
        resolve(await fn());
      } catch (e) {
        reject(e);
      }
      if (queue.length > 0) {
        await new Promise((r) => setTimeout(r, DEFAULTS.REQUEST_DELAY_MS));
      }
    }
    queueRunning = false;
  }

  // ── Rating Registry & Sorting ─────────────────────────────────────────────

  const ratingRegistry = new Map();

  function registerRating(headingEl, data) {
    ratingRegistry.set(headingEl, {
      rating: data.rating,
      reviewCount: data.reviewCount,
    });
  }

  function findCardContainer(headingEls) {
    if (headingEls.length < 2) return null;
    for (let depth = 1; depth <= 10; depth++) {
      const ancestors = headingEls.map((h) => {
        let el = h;
        for (let i = 0; i < depth && el; i++) el = el.parentElement;
        return el;
      });
      if (ancestors.some((a) => !a)) continue;
      const uniqueAncestors = new Set(ancestors);
      const parents = new Set(
        ancestors.map((a) => a.parentElement).filter(Boolean)
      );
      if (uniqueAncestors.size === headingEls.length && parents.size === 1) {
        return { container: ancestors[0].parentElement, cards: ancestors };
      }
    }
    return null;
  }

  function purgeStaleEntries() {
    for (const el of ratingRegistry.keys()) {
      if (!document.body.contains(el)) ratingRegistry.delete(el);
    }
  }

  function compareByRating(a, b) {
    const ra = a.rating ?? -1;
    const rb = b.rating ?? -1;
    if (rb !== ra) return rb - ra;
    return b.reviewCount - a.reviewCount;
  }

  function sortRestaurants() {
    purgeStaleEntries();
    if (ratingRegistry.size < 2) return;

    const cardSelector = getConfig("CARD_SELECTOR");
    let cards;

    if (cardSelector) {
      cards = [];
      for (const [el, data] of ratingRegistry) {
        const card = el.closest(cardSelector);
        if (card) cards.push({ card, rating: data.rating, reviewCount: data.reviewCount });
      }
      if (cards.length < 2) return;
      const container = cards[0].card.parentElement;
      if (!container) return;

      cards.sort(compareByRating);

      observer.disconnect();
      cards.forEach((c) => container.appendChild(c.card));
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      const headings = [...ratingRegistry.keys()];
      const result = findCardContainer(headings);
      if (!result) return;

      cards = result.cards.map((card, i) => {
        const data = ratingRegistry.get(headings[i]);
        return { card, rating: data.rating, reviewCount: data.reviewCount };
      });

      cards.sort(compareByRating);

      observer.disconnect();
      cards.forEach((c) => result.container.appendChild(c.card));
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  // ── UI Rendering ───────────────────────────────────────────────────────────

  function renderStars(rating) {
    if (rating == null) return "";
    const full = Math.floor(rating);
    const half = rating - full >= 0.25 && rating - full < 0.75 ? 1 : 0;
    const addFull = rating - full >= 0.75 ? 1 : 0;
    const totalFull = full + addFull;
    const empty = 5 - totalFull - half;
    return (
      "★".repeat(totalFull) +
      (half ? "½" : "") +
      "☆".repeat(Math.max(0, empty))
    );
  }

  function ratingColor(rating) {
    if (rating == null) return "gray";
    if (rating >= 4.0) return "green";
    if (rating >= 3.0) return "yellow";
    return "red";
  }

  function createBadge(data) {
    const badge = document.createElement("div");
    badge.className = `hhe-badge hhe-badge--${ratingColor(data.rating)}`;
    badge.innerHTML =
      `<span class="hhe-stars">${renderStars(data.rating)}</span> ` +
      `<strong>${data.rating != null ? data.rating.toFixed(1) : "N/A"}</strong>` +
      `<span>(${data.reviewCount.toLocaleString()})</span>`;
    badge.title = "Click to expand reviews";
    return badge;
  }

  function createPanel(data) {
    const panel = document.createElement("div");
    panel.className = "hhe-panel";

    if (data.reviewSummary) {
      const summary = document.createElement("div");
      summary.className = "hhe-summary-text";
      summary.innerHTML =
        escapeHtml(data.reviewSummary) +
        `<div class="hhe-summary-attr">Summarized with Gemini</div>`;
      panel.appendChild(summary);
    } else if (data.popularItems && data.popularItems.length > 0) {
      const picks = document.createElement("div");
      picks.className = "hhe-picks";
      picks.innerHTML =
        `<div class="hhe-picks-label">Top Picks</div>` +
        `<div class="hhe-picks-tags">${data.popularItems.map((item) => `<span class="hhe-pick-tag">${escapeHtml(item)}</span>`).join("")}</div>`;
      panel.appendChild(picks);
    }

    if (data.reviews.length > 0) {
      data.reviews.slice(0, 3).forEach((r) => {
        const review = document.createElement("div");
        review.className = "hhe-review";
        review.innerHTML =
          `<div class="hhe-review-header">` +
          `<span class="hhe-review-author">${escapeHtml(r.author)}</span>` +
          `<span class="hhe-review-time">${escapeHtml(r.time)}</span>` +
          `</div>` +
          (r.rating != null
            ? `<div class="hhe-review-stars">${renderStars(r.rating)}</div>`
            : "") +
          `<div class="hhe-review-text">${escapeHtml(truncate(r.text, 200))}</div>`;
        panel.appendChild(review);
      });
    } else {
      const empty = document.createElement("div");
      empty.style.cssText = "color:#999; font-size:12px; padding:4px 0;";
      empty.textContent = "No reviews available.";
      panel.appendChild(empty);
    }

    if (data.mapsUrl) {
      const link = document.createElement("a");
      link.className = "hhe-maps-link";
      link.href = data.mapsUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "View on Google Maps \u2197";
      panel.appendChild(link);
    }

    return panel;
  }

  function createLoadingIndicator() {
    const el = document.createElement("div");
    el.className = "hhe-loading";
    el.innerHTML = '<span class="hhe-spinner"></span> Loading rating\u2026';
    return el;
  }

  function createErrorIndicator(msg) {
    const el = document.createElement("div");
    el.className = "hhe-badge hhe-badge--gray";
    el.textContent = msg;
    el.style.cursor = "default";
    return el;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function truncate(str, max) {
    if (!str || str.length <= max) return str || "";
    return str.slice(0, max).replace(/\s+\S*$/, "") + "\u2026";
  }

  // ── DOM Injection ──────────────────────────────────────────────────────────

  const PROCESSED_ATTR = "data-hhe-processed";

  function isRestaurantHeading(el) {
    const text = el.textContent.trim();
    if (!text || text.length < 2) return false;
    const nonRestaurantTexts = [
      "useful links",
      "need help?",
      "made with",
      "download",
    ];
    return !nonRestaurantTexts.some((t) =>
      text.toLowerCase().startsWith(t)
    );
  }

  async function resolvePopularItems(reviews) {
    if (!reviews || reviews.length === 0) return null;
    if (getGeminiApiKey()) {
      const items = await extractItemsViaGemini(reviews);
      if (items && items.length > 0) return items;
    }
    return extractItemsFromText(reviews);
  }

  async function enhanceRestaurant(headingEl) {
    if (headingEl.hasAttribute(PROCESSED_ATTR)) return;
    headingEl.setAttribute(PROCESSED_ATTR, "1");

    const name = headingEl.textContent.trim();
    if (!name) return;

    const cached = getCached(name);
    if (cached !== null) {
      registerRating(headingEl, cached);
      injectRating(headingEl, cached);
      return;
    }

    if (!getApiKey()) {
      registerRating(headingEl, { rating: null, reviewCount: 0 });
      const hint = createErrorIndicator("Set API key in Tampermonkey menu");
      headingEl.parentElement.insertBefore(hint, headingEl.nextSibling);
      return;
    }

    const loading = createLoadingIndicator();
    headingEl.parentElement.insertBefore(loading, headingEl.nextSibling);

    try {
      const data = await enqueue(() => searchPlace(name));
      loading.remove();
      if (data) {
        if (!data.reviewSummary) {
          data.popularItems = await resolvePopularItems(data.reviews);
        }
        setCache(name, data);
        registerRating(headingEl, data);
        injectRating(headingEl, data);
      } else {
        const fallback = {
          name,
          rating: null,
          reviewCount: 0,
          mapsUrl: null,
          reviewSummary: null,
          reviews: [],
          popularItems: null,
        };
        setCache(name, fallback);
        registerRating(headingEl, fallback);
        const notFound = createErrorIndicator("Not found on Google");
        headingEl.parentElement.insertBefore(notFound, headingEl.nextSibling);
      }
    } catch (err) {
      loading.remove();
      registerRating(headingEl, { rating: null, reviewCount: 0 });
      console.error(`[HungerHub Enhanced] Error for "${name}":`, err);
      const errEl = createErrorIndicator("Rating unavailable");
      headingEl.parentElement.insertBefore(errEl, headingEl.nextSibling);
    }
  }

  function injectRating(headingEl, data) {
    const badge = createBadge(data);
    const panel = createPanel(data);

    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.classList.toggle("hhe-panel--open");
    });

    headingEl.parentElement.insertBefore(badge, headingEl.nextSibling);
    badge.parentElement.insertBefore(panel, badge.nextSibling);
  }

  // ── MutationObserver & Scanning ────────────────────────────────────────────

  function scanPage() {
    const selector = getConfig("SELECTOR");
    const headings = document.querySelectorAll(selector);
    const promises = [];
    headings.forEach((el) => {
      if (!el.hasAttribute(PROCESSED_ATTR) && isRestaurantHeading(el)) {
        promises.push(enhanceRestaurant(el));
      }
    });
    if (promises.length > 0) {
      Promise.allSettled(promises).then(() => sortRestaurants());
    }
  }

  let scanTimeout = null;
  function debouncedScan() {
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(scanPage, 300);
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        debouncedScan();
        break;
      }
    }
  });

  function init() {
    observer.observe(document.body, { childList: true, subtree: true });
    scanPage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
