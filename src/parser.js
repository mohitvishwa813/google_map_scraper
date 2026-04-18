/**
 * parseProfileData
 * Extracts account name, bio, and all available info from an Instagram profile page.
 * Uses multiple strategies (JSON-LD, meta tags, DOM selectors) for resilience.
 */
export async function parseProfileData(page, url, source) {
  const username = url.split('/').filter(Boolean).pop();

  return page.evaluate((args) => {
    const { url, source, username } = args;
    const result = {
      username: username || '',
      fullName: '',
      bio: '',
      website: '',
      followersCount: null,
      followingCount: null,
      postsCount: null,
      isVerified: false,
      isPrivate: false,
      profileImageUrl: '',
      email: '',
      phone: '',
      category: '',
      externalUrl: '',
      source,
      scrapedAt: new Date().toISOString(),
      profileUrl: url,
    };

    // ── Strategy 1: Parse __additionalDataLoaded / window._sharedData ────────
    try {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const script of scripts) {
        const text = script.textContent || '';

        // Try to find inline JSON with profile data
        if (text.includes('"biography"') && text.includes('"username"')) {
          const match = text.match(/\{.*"biography".*\}/s);
          if (match) {
            try {
              // Walk JSON to find the user node
              const findUser = (obj) => {
                if (!obj || typeof obj !== 'object') return null;
                if (obj.biography !== undefined && obj.username) return obj;
                for (const val of Object.values(obj)) {
                  const found = findUser(val);
                  if (found) return found;
                }
                return null;
              };
              const parsed = JSON.parse(match[0]);
              const user = findUser(parsed);
              if (user) {
                result.username = user.username || result.username;
                result.fullName = user.full_name || '';
                result.bio = user.biography || '';
                result.website = user.external_url || '';
                result.isVerified = user.is_verified || false;
                result.isPrivate = user.is_private || false;
                result.profileImageUrl = user.profile_pic_url_hd || user.profile_pic_url || '';
                result.followersCount = user.edge_followed_by?.count ?? user.follower_count ?? null;
                result.followingCount = user.edge_follow?.count ?? user.following_count ?? null;
                result.postsCount = user.edge_owner_to_timeline_media?.count ?? user.media_count ?? null;
                result.category = user.category_name || user.category || '';
                result.email = user.business_email || user.public_email || '';
                result.phone = user.business_phone_number || user.contact_phone_number || '';
                result.externalUrl = user.bio_links?.[0]?.url || user.external_url || '';
              }
            } catch { /* continue */ }
          }
        }
      }
    } catch { /* continue to next strategy */ }

    // ── Strategy 2: Meta tags ─────────────────────────────────────────────────
    if (!result.fullName) {
      const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
      // og:title is usually "Full Name (@username) • Instagram..."
      const titleMatch = ogTitle.match(/^(.+?)\s*[@•(]/);
      if (titleMatch) result.fullName = titleMatch[1].trim();
    }

    if (!result.bio) {
      const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
      // og:description: "X Followers, Y Following, Z Posts - See Instagram photos and videos from Full Name (@username)"
      // The bio is NOT in og:description on public pages, but we can try
      const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      if (metaDesc && !metaDesc.startsWith('See Instagram')) {
        result.bio = metaDesc;
      }
    }

    // ── Strategy 3: DOM selectors ─────────────────────────────────────────────
    // Full name
    if (!result.fullName) {
      const nameEl = document.querySelector('h1, header h2, [data-testid="user-name"]');
      if (nameEl) result.fullName = nameEl.innerText.trim();
    }

    // Bio text
    if (!result.bio) {
      // Common bio containers
      const bioSelectors = [
        'header section > div:last-child span',
        '[data-testid="user-bio"]',
        'div.-vDIg span',
        'section > div > span',
      ];
      for (const sel of bioSelectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText.trim().length > 0) {
          result.bio = el.innerText.trim();
          break;
        }
      }
    }

    // Website from bio area
    if (!result.website) {
      const links = Array.from(document.querySelectorAll('header a[rel~="nofollow"], header a[target="_blank"]'));
      for (const a of links) {
        const href = a.href;
        if (href && !href.includes('instagram.com') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
          result.website = href;
          break;
        }
      }
    }

    // Email from bio (regex)
    if (!result.email && result.bio) {
      const emailMatch = result.bio.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) result.email = emailMatch[0];
    }

    // Follower / following / posts counts
    if (result.followersCount === null) {
      const statEls = Array.from(document.querySelectorAll('header ul li, header section ul li'));
      for (const li of statEls) {
        const text = li.innerText.trim();
        const num = text.replace(/[^0-9.KkMm]/g, '');
        const lower = text.toLowerCase();
        const parsed = parseCount(num);
        if (lower.includes('follower')) result.followersCount = parsed;
        else if (lower.includes('following')) result.followingCount = parsed;
        else if (lower.includes('post')) result.postsCount = parsed;
      }
    }

    // Verified badge
    if (!result.isVerified) {
      result.isVerified = !!document.querySelector('[aria-label*="Verified"], [title*="Verified"], .coreSpriteVerifiedBadge');
    }

    return result;

    // ── Helper: parse "1.2M" → 1200000 ───────────────────────────────────────
    function parseCount(str) {
      if (!str) return null;
      str = str.trim().toUpperCase();
      if (str.endsWith('M')) return Math.round(parseFloat(str) * 1_000_000);
      if (str.endsWith('K')) return Math.round(parseFloat(str) * 1_000);
      const n = parseInt(str.replace(/,/g, ''), 10);
      return isNaN(n) ? null : n;
    }
  }, { url, source, username });
}
