import assert from 'node:assert';
import relay, { extractRecipe, pageText, checkUrl, decode } from '../worker/relay.mjs';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; }
}

// small pages written for these tests
const JSONLD = `<html><head><title>x</title>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Site"},
{"@type":["Recipe"],"name":"Panini &amp; co","recipeYield":["12","12 panini"],"recipeIngredient":["Farina 500 g","Acqua 300 g","Sale 8 g"],
"recipeInstructions":[{"@type":"HowToSection","itemListElement":[{"@type":"HowToStep","text":"Impastate &amp; riposate 30 minuti."},{"@type":"HowToStep","text":"Cuocete a 200&deg; per 20 minuti."}]},"Servite."]}]}</script>
</head><body><p>unrelated</p></body></html>`;
const PLAIN = `<html><head><style>.x{color:red}</style><script>var a = 1;</script></head><body><nav>Menu</nav>
<h1>My bread</h1><ul><li>500 g flour</li><li>350 g water</li></ul><p>Mix.<br>Bake 40 minutes at 230&deg;C.</p><footer>Footer</footer></body></html>`;

const origFetch = globalThis.fetch;
function stub(html, status = 200) { globalThis.fetch = async () => new Response(html, { status, headers: { 'content-type': 'text/html' } }); }
const call = (url, origin = 'https://aloe-andrea.github.io') => relay.fetch(new Request('https://relay.test/?url=' + encodeURIComponent(url), { headers: origin ? { Origin: origin } : {} }));

await test('JSON-LD: ingredienti e passi, anche dentro @graph, HowToSection ed entita HTML', async () => {
  const r = extractRecipe(JSONLD);
  assert.strictEqual(r.name, 'Panini & co');
  assert.deepStrictEqual(r.ingredients, ['Farina 500 g', 'Acqua 300 g', 'Sale 8 g']);
  assert.deepStrictEqual(r.instructions, ['Impastate & riposate 30 minuti.', 'Cuocete a 200° per 20 minuti.', 'Servite.']);
});

await test('pagina senza dati strutturati: testo visibile, senza script, stili e menu', () => {
  const t = pageText(PLAIN);
  assert.ok(t.includes('500 g flour') && t.includes('Bake 40 minutes at 230°C.'));
  assert.ok(!/var a|color:red|Menu|Footer/.test(t));
  assert.strictEqual(extractRecipe(PLAIN), null);
});

await test('decode: entita nominali e numeriche', () => {
  assert.strictEqual(decode('a &amp; b &#176; &#x2019; &nbsp;c'), 'a & b ° ’  c');
});

await test('indirizzi non ammessi: locali, privati, porte strane, altri schemi', () => {
  ['http://localhost/x', 'http://127.0.0.1/x', 'http://192.168.1.5/x', 'http://10.0.0.1/', 'http://172.20.1.1/', 'http://169.254.169.254/latest', 'http://[::1]/', 'http://intranet/x',
   'file:///etc/passwd', 'ftp://example.com/x', 'https://example.com:8443/x', 'https://user:pw@example.com/', 'not a url'].forEach(u => {
    assert.ok(checkUrl(u).error, u + ' dovrebbe essere rifiutato');
  });
  assert.ok(checkUrl('https://ricette.example.com/pane.html').url);
});

await test('risposta JSON-LD completa con intestazioni CORS', async () => {
  stub(JSONLD);
  const res = await call('https://ricette.example.com/panini.html');
  const body = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(body.ok, true); assert.strictEqual(body.source, 'jsonld'); assert.strictEqual(body.ingredients.length, 3);
  assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://aloe-andrea.github.io');
});

await test('risposta con solo testo quando manca il blocco ricetta', async () => {
  stub(PLAIN);
  const body = await (await call('https://blog.example.com/pane')).json();
  assert.strictEqual(body.source, 'text'); assert.ok(body.text.includes('350 g water'));
});

await test('origine sconosciuta rifiutata, assenza di origine accettata (prova da riga di comando)', async () => {
  stub(PLAIN);
  assert.strictEqual((await call('https://blog.example.com/pane', 'https://evil.example')).status, 403);
  assert.strictEqual((await call('https://blog.example.com/pane', '')).status, 200);
});

await test('pre-flight OPTIONS, metodo non ammesso, indirizzo mancante', async () => {
  assert.strictEqual((await relay.fetch(new Request('https://relay.test/', { method: 'OPTIONS', headers: { Origin: 'https://aloe-andrea.github.io' } }))).status, 204);
  assert.strictEqual((await relay.fetch(new Request('https://relay.test/?url=https://a.example.com', { method: 'POST' }))).status, 405);
  assert.strictEqual((await relay.fetch(new Request('https://relay.test/'))).status, 400);
});

await test('errori del sito di origine passano come errori chiari', async () => {
  stub('nope', 404);
  const res = await call('https://blog.example.com/missing');
  assert.strictEqual(res.status, 502); assert.strictEqual((await res.json()).error, 'http-404');
  globalThis.fetch = async () => { throw new Error('boom'); };
  assert.strictEqual((await (await call('https://blog.example.com/x')).json()).error, 'fetch-failed');
});

globalThis.fetch = origFetch;
console.log('\n' + passed + ' test passati' + (process.exitCode ? ', con errori' : ''));
