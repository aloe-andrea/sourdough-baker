// Recipe relay: a tiny Cloudflare Worker that reads a recipe page for the app.
// A browser cannot fetch other sites directly (CORS), so the app asks this worker, which downloads the
// page and returns the recipe data it finds: the schema.org/Recipe block most recipe sites publish, or,
// failing that, the visible text of the page. It stores nothing.
//
// GET /?url=https://example.com/recipe  ->  { ok: true, source: 'jsonld' | 'text', ... }

const ALLOWED_ORIGINS = ['https://aloe-andrea.github.io', 'http://localhost:8765', 'http://localhost:8080', 'http://127.0.0.1:8765'];
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_TEXT = 60000;
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1?\]?|\[?f[cd][0-9a-f:]*\]?)$/i;

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, cors(origin)) });
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', deg: '°', rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—', frac12: '½', frac14: '¼', frac34: '¾' };
export function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    return Object.prototype.hasOwnProperty.call(ENT, e.toLowerCase()) ? ENT[e.toLowerCase()] : m;
  });
}

function asArray(x) { return x == null ? [] : Array.isArray(x) ? x : [x]; }
function isRecipe(n) { return n && typeof n === 'object' && asArray(n['@type']).indexOf('Recipe') >= 0; }

// every object in a JSON-LD document, including @graph and nested arrays
function walk(node, out) {
  if (Array.isArray(node)) node.forEach(n => walk(n, out));
  else if (node && typeof node === 'object') { out.push(node); if (node['@graph']) walk(node['@graph'], out); }
  return out;
}

function stepsOf(ins) {
  const out = [];
  asArray(ins).forEach(s => {
    if (typeof s === 'string') out.push(decode(s).trim());
    else if (s && typeof s === 'object') {
      if (s.itemListElement) out.push(...stepsOf(s.itemListElement));
      else if (s.text) out.push(decode(s.text).trim());
      else if (s.name) out.push(decode(s.name).trim());
    }
  });
  return out.filter(Boolean);
}

export function extractRecipe(html) {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let doc;
    try { doc = JSON.parse(b[1].trim()); } catch (e) { continue; }
    const rec = walk(doc, []).find(isRecipe);
    if (!rec) continue;
    const ingredients = asArray(rec.recipeIngredient).map(i => decode(String(i)).replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!ingredients.length) continue;
    return { name: decode(String(rec.name || '')).trim(), recipeYield: asArray(rec.recipeYield).map(String).join(' '), ingredients, instructions: stepsOf(rec.recipeInstructions) };
  }
  return null;
}

export function pageText(html) {
  let s = html.replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, ' ')
              .replace(/<!--[\s\S]*?-->/g, ' ')
              .replace(/<\/(p|div|li|tr|h[1-6]|section|article|ul|ol|table)>|<br\s*\/?>/gi, '\n')
              .replace(/<[^>]+>/g, ' ');
  s = decode(s).replace(/[ \t ]+/g, ' ').split('\n').map(l => l.trim()).filter(Boolean).join('\n');
  return s.slice(0, MAX_TEXT);
}

export function checkUrl(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { return { error: 'bad-url' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: 'bad-url' };
  if (u.username || u.password) return { error: 'bad-url' };
  if (u.port && u.port !== '80' && u.port !== '443') return { error: 'bad-url' };
  if (PRIVATE_HOST.test(u.hostname) || !u.hostname.includes('.')) return { error: 'blocked-host' };
  return { url: u };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== 'GET') return json({ ok: false, error: 'method' }, 405, origin);
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ ok: false, error: 'origin' }, 403, origin);

    const target = checkUrl(new URL(request.url).searchParams.get('url') || '');
    if (target.error) return json({ ok: false, error: target.error }, 400, origin);

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12000);
    let res;
    try {
      res = await fetch(target.url.toString(), { signal: ctl.signal, redirect: 'follow', headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'it,en;q=0.8' } });
    } catch (e) { return json({ ok: false, error: 'fetch-failed' }, 502, origin); } finally { clearTimeout(timer); }
    if (!res.ok) return json({ ok: false, error: 'http-' + res.status }, 502, origin);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) return json({ ok: false, error: 'too-big' }, 413, origin);
    const html = (await res.text()).slice(0, MAX_BYTES);

    const rec = extractRecipe(html);
    if (rec) return json(Object.assign({ ok: true, source: 'jsonld', host: target.url.hostname }, rec), 200, origin);
    return json({ ok: true, source: 'text', host: target.url.hostname, text: pageText(html) }, 200, origin);
  }
};
