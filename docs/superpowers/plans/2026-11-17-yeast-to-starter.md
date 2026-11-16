# Yeast to starter conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A recipe with commercial yeast and no starter is converted automatically to a sourdough recipe (grams and times), visibly and reversibly.

**Architecture:** A new pure UMD module `convert.js` turns an imported recipe into a converted copy. `build()` in `app.js` runs it before `Recipe.fromImported` when the state flag `useStarter` is true. The ingredients screen shows a note and a switch to go back to the original. Saved recipes are never modified.

**Tech Stack:** Vanilla JS (UMD modules like `calc.js`), node `assert` tests run with `node tests\<name>.test.js`, headless Playwright for the browser check.

**Spec:** `C:\Claude_Projects\Sourdough_Baker\docs\superpowers\specs\2026-11-17-yeast-to-starter-design.md`

## Global Constraints

- Starter = 20% of total flour weight, 100% hydration; half of the starter weight is taken out of the flour and half out of the water.
- Yeast removed, every other ingredient unchanged; recipes that already have starter, or have no yeast grams, are returned unchanged.
- Time factor 3 (lean) or 4 (enriched, sugar+fat+eggs >= 12% of flour weight) applied only to `bulk` and `proof` steps that have `minMin` and `maxMin` written in the recipe. Never scaled: `chill`, `autolyse`, `fold`, `preshape`, `shape`, `preheat`, `bake`, `cool`, estimated steps.
- No AI, no network. Whole grams. English and Italian texts. No em dash in any text.
- Public repo: no web photos, no personal data in tests. Bump `VERSION` in `C:\Claude_Projects\Sourdough_Baker\sw.js` (currently `sourdough-v13`) and list `convert.js` in its `CORE`.
- Do not start any server except bound to 127.0.0.1; browser checks headless; delete scratch files afterwards.

## Review Focus

- Water or flour that would drop to 0 or below, or a milk-only dough with no water ingredient: no conversion, original shown.
- Recipe with both yeast and starter: no conversion, no note.
- Several flours (white plus whole wheat): the reduction is taken proportionally, none goes negative.
- Yeast listed at 0 g or an empty ingredient list: no crash, unchanged.
- Switch off: the recipe is built exactly as before, and the choice survives a reload.

---

### Task 1: The conversion module

**Files:**
- Create: `C:\Claude_Projects\Sourdough_Baker\convert.js`
- Test: `C:\Claude_Projects\Sourdough_Baker\tests\convert.test.js`

**Interfaces:**
- Consumes: imported recipe shape `{ name, ingredients: [{ name, g, type }], steps: [{ phase, minMin, maxMin, ... }], bake }` with `type` in flour, water, starter, yeast, salt, other.
- Produces: `Convert.yeastToStarter(recipe, starterName) -> { recipe, converted: boolean, info, reason }`. `starterName` is the display name of the added ingredient, default `'Starter'`. `recipe` is a deep copy (input never mutated). When converted, `info = { starterG, yeastG, factor, enriched }` and `reason` is null. When not converted, `recipe` is the input unchanged, `info` is null and `reason` is one of `'no-yeast'`, `'has-starter'`, `'too-little-water'`, `'too-little-flour'`. Constants `STARTER_PCT = 0.2`, `ENRICHED_PCT = 0.12`, `FACTOR_LEAN = 3`, `FACTOR_ENRICHED = 4` exported on the module for tests.

- [ ] **Step 1: Write the failing tests** in `tests\convert.test.js`, same `test()` harness as `tests\calc.test.js`. Test names and assertions:
  - `lean: 500 flour, 325 water, 3 yeast, 10 salt`: result has starter 100 g, flour 450, water 275, salt 10, no yeast ingredient; `info.factor === 3`; `info.starterG === 100`; `info.yeastG === 3`.
  - `lean: times of bulk and proof are tripled, others untouched`: steps `bulk {minMin:60,maxMin:90}` becomes 180 and 270; `proof {minMin:30,maxMin:45}` becomes 90 and 135; `chill`, `bake`, `fold` unchanged; a `bulk` step with no `minMin` stays without it.
  - `enriched: 500 flour, 100 butter, 2 eggs (100 g), 50 sugar gives factor 4`.
  - `just under the threshold stays lean` (fat+eggs+sugar = 59 g on 500 g flour gives factor 3; 60 g gives 4).
  - `has starter: unchanged` (`converted === false`, `reason === 'has-starter'`, also when yeast is present too).
  - `no yeast or yeast 0 g: unchanged` (`reason === 'no-yeast'`).
  - `two flours: reduction is proportional` (300 white + 200 whole wheat gives 270 and 180, starter 100).
  - `too little water: unchanged` (water 40 g gives `reason === 'too-little-water'`; no water ingredient at all gives the same).
  - `input is not mutated` (deep-equal to a snapshot taken before).
  - `fromImported plans feeds for the converted recipe`: `Recipe.fromImported(result.recipe, 'uno11-uno12', {}).starterG === 100` and `.steps[0].id === 'rinfresco-1-1'`; on the original yeast recipe `.starterG === 0`.
- [ ] **Step 2: Run** `node C:\Claude_Projects\Sourdough_Baker\tests\convert.test.js`. Expected: fails, `Cannot find module '../convert.js'`.
- [ ] **Step 3: Implement `yeastToStarter(recipe, starterName)` in `convert.js`** as a UMD module exporting `{ yeastToStarter, STARTER_PCT, ENRICHED_PCT, FACTOR_LEAN, FACTOR_ENRICHED }`, same wrapper style as `calc.js`. Enriched detection sums grams of `other` ingredients whose name matches (case-insensitive) Italian or English butter, oil, lard, egg and yolk, sugar, honey words (`burro|butter|olio|oil|strutto|margarina|uov|tuorl|egg|yolk|zucchero|sugar|miele|honey`), divided by flour grams. The starter ingredient is appended as `{ name: starterName || 'Starter', g, type: 'starter' }`. Round all grams to whole numbers after the proportional split.
- [ ] **Step 4: Run the test file again.** Expected: all tests pass, then run the other five suites (`calc`, `import`, `recipe`, `planner`, `relay`) and confirm none regressed (12, 20, 11, 26, 9).
- [ ] **Step 5: Commit** (`convert.js`, `tests\convert.test.js`, the spec and this plan), message `Add yeast to starter conversion module`.

### Task 2: Wire it into the app

**Files:**
- Modify: `C:\Claude_Projects\Sourdough_Baker\app.js` (DEFAULTS at line 9, `build()` at line 28, `renderIngredients()` at line 787)
- Modify: `C:\Claude_Projects\Sourdough_Baker\i18n.js` (EN and IT blocks, next to the `ing.*` keys)
- Modify: `C:\Claude_Projects\Sourdough_Baker\index.html` (script tag before `app.js`, after `recipe.js`)
- Modify: `C:\Claude_Projects\Sourdough_Baker\sw.js` (`VERSION` to `sourdough-v14`, add `'convert.js'` to `CORE`)
- Modify: `C:\Claude_Projects\Sourdough_Baker\README.md` (one short paragraph)

**Interfaces:**
- Consumes: `Convert.yeastToStarter(recipe, starterName)` from Task 1; `t('ty.starter')` already exists in `i18n.js`.
- Produces: state flag `S.useStarter` (default `true` in `DEFAULTS`, persisted by `save()`); module variable `CONV` in `app.js` holding the last `yeastToStarter` result or `null`; i18n keys `conv.note` (`{s}` starter grams, `{y}` yeast grams, `{f}` time factor), `conv.back` (switch off label), `conv.use` (switch on label), `conv.skipped` (shown when yeast recipe could not be converted).

- [ ] **Step 1: Add `convert.js` to `index.html` and `sw.js`** and bump the cache version. Verify with `grep -n "convert.js" C:\Claude_Projects\Sourdough_Baker\index.html C:\Claude_Projects\Sourdough_Baker\sw.js` (two hits).
- [ ] **Step 2: In `build()`**, when `S.useStarter` is true set `CONV = Convert.yeastToStarter(r, t('ty.starter'))` and pass `CONV.recipe` to `Recipe.fromImported`; otherwise `CONV = null` and pass `r`. `useStarter: true` joins `DEFAULTS`.
- [ ] **Step 3: In `renderIngredients()`**, at the top of `#ingBody`, when the saved recipe has yeast grams and no starter: if `CONV && CONV.converted` show a note with `conv.note` and a switch button (`conv.back`); if `CONV` exists but not converted and `reason` is `too-little-water` or `too-little-flour` show `conv.skipped`; if `S.useStarter` is false show a button (`conv.use`). Clicking the button flips `S.useStarter`, calls `save()`, `build()`, re-renders, and refreshes any plan that depends on the recipe the same way the existing preset change does (`S.done = {}` is not reset).
- [ ] **Step 4: Texts** in `i18n.js`, English and Italian:
  - `conv.note`: EN `Converted from yeast: {s} g starter instead of {y} g yeast. Rises take about {f} times longer.` IT `Convertita da lievito di birra: {s} g di pasta madre al posto di {y} g di lievito. Le lievitazioni durano circa {f} volte di più.`
  - `conv.back`: EN `Use the original yeast recipe` IT `Usa la ricetta originale con lievito di birra`
  - `conv.use`: EN `Convert to sourdough` IT `Converti a pasta madre`
  - `conv.skipped`: EN `This yeast recipe could not be converted (not enough water or flour). Shown as written.` IT `Questa ricetta con lievito di birra non si può convertire (poca acqua o farina). Mostrata com’è.`
- [ ] **Step 5: Browser check, headless, server on 127.0.0.1 only.** Serve `C:\Claude_Projects\Sourdough_Baker` with `python -m http.server 8765 --bind 127.0.0.1`, load the page headless with a recipe injected into `localStorage` key `sourdough.v2` (`recipes` and `recipeId` set; recipe: 500 g flour, 325 g water, 3 g yeast, 10 salt; steps `bulk` 60-90, `proof` 30-45, `bake` 230 °C 35 min). Confirm: the ingredients screen shows the note with 100 g starter; flour 450 g, water 275 g; the feeds list appears; the plan's first step is a feed; clicking the switch shows the original (3 g yeast, no feeds) and survives a reload; the same page with a starter recipe shows no note. Stop the server and delete scratch files.
- [ ] **Step 6: Run all six test suites** (expected 12, 20, 11, 26, 9 and the new convert count, all passing).
- [ ] **Step 7: README paragraph** under the recipe section: yeast recipes are converted to sourdough with the rules of the spec, with a switch to go back. Then commit `Convert yeast recipes to sourdough` and push to `main` (authorized for this repo).
