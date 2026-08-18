const STEAM_BROWSE_BASE = 'https://steamcommunity.com/workshop/browse/?appid=550&browsesort=toprated&actualsort=toprated&days=-1&section=readytouseitems&requiredtags%5B0%5D=Campaigns&requiredtags%5B1%5D=Co-op&searchtext=Map&numperpage=100';

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }
  });
}

function decode(value) {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function meta(html, property) {
  const pattern = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i');
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`, 'i');
  return decode((html.match(pattern) || html.match(reverse) || [,''])[1]);
}

function pageTitle(html) {
  return meta(html, 'og:title') || decode((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [,''])[1]).replace(/^Steam Workshop::\s*/i, '').trim();
}

function pageDescription(html) {
  return meta(html, 'og:description') || decode((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [,''])[1]);
}

function elementText(html, className) {
  const match = html.match(new RegExp(`<[^>]+class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/`, 'i'));
  return decode((match ? match[1] : '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function cardData(html, id) {
  const position = html.indexOf(id);
  if (position < 0) return {};
  const fragment = html.slice(Math.max(0, position - 3500), position + 3500);
  const imageMatch = fragment.match(/(?:class=["'][^"']*(?:workshopItemPreviewImage|workshop_item_preview)[^"']*["'][^>]+(?:src|data-src)|(?:src|data-src)=["'][^"']+["'][^>]+class=["'][^"']*(?:workshopItemPreviewImage|workshop_item_preview))/i);
  const image = imageMatch ? (imageMatch[0].match(/(?:src|data-src)=["']([^"']+)/i) || [,''])[1] : '';
  return { title: elementText(fragment, 'workshopItemTitle'), description: elementText(fragment, 'workshopItemDescription'), image: decode(image) };
}

function workshopImage(html) {
  const openGraph = meta(html, 'og:image');
  if (openGraph) return openGraph;
  const matches = html.match(/https?:\/\/(?:steamuserimages-[^/"'\s<]+|shared\.(?:fastly|cloudflare)\.steamstatic\.com)[^"'\s<]+/gi) || [];
  return decode(matches[0] || '').replace(/\\\//g, '/');
}

function findIds(html) {
  const patterns = [
    /data-publishedfileid=["'](\d+)["']/gi,
    /sharedfiles\/filedetails\/\?id=(\d+)/gi,
    /publishedfileid["'=:]+\s*["']?(\d+)/gi
  ];
  const ids = [];
  for (const pattern of patterns) for (const match of html.matchAll(pattern)) ids.push(match[1]);
  return [...new Set(ids)].filter(id => id.length >= 7 && id !== '550');
}

async function publishedDetails(ids) {
  const form = new URLSearchParams({ itemcount: String(ids.length) });
  ids.forEach((id, index) => form.set(`publishedfileids[${index}]`, id));
  const result = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form
  });
  if (!result.ok) return [];
  const json = await result.json();
  return json?.response?.publishedfiledetails || [];
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin':'*', 'access-control-allow-methods':'GET, OPTIONS' } });
    if (url.pathname !== '/random') return response({ error: 'Not found' }, 404);
    try {
      let unique = [];
      let browseHtml = '';
      const pageUrls = Array.from({ length: 10 }, (_, index) => `${STEAM_BROWSE_BASE}&p=${index + 1}`);
      const pages = await Promise.all(pageUrls.map(async browseUrl => {
        const browse = await fetch(browseUrl, { headers: { 'user-agent': 'Mozilla/5.0 L4D2-Addon-Roulette/1.0' } });
        return browse.ok ? browse.text() : '';
      }));
      browseHtml = pages.join('\n');
      unique = [...new Set(pages.flatMap(findIds))];
      if (!unique.length) throw new Error('No public campaign addons were found. Steam may be temporarily blocking the search.');
      unique.sort(() => Math.random() - 0.5);
      const results = [];
      const details = await publishedDetails(unique.slice(0, 100));
      for (const detail of details) {
        const candidate = String(detail.publishedfileid || '');
        const card = cardData(browseHtml, candidate);
        const title = detail.title || card.title || `Workshop addon ${candidate}`;
        const image = detail.preview_url || card.image;
        if (!candidate || !image) continue;
        results.push({ id: candidate, title, image, description: detail.description || card.description || '', url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${candidate}` });
        if (results.length === 12) break;
      }
      if (!results.length) throw new Error('Steam returned matching addons, but no usable result data or images. Try Reroll again.');
      return response({ results });
    } catch (error) { return response({ error: error.message }, 502); }
  }
};
