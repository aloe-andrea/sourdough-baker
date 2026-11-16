# Yeast to starter conversion: design

Date: 2026-11-17. Owner: Andrea. Size: small change (one new pure module, small hooks in `app.js`, `i18n.js`, `index.html`, `sw.js`).

## Intent

Andrea imports recipes from the web, and most use commercial yeast. He wants any such recipe to be usable with his sourdough starter ("pasta madre") right away, with no manual maths. Today a recipe with yeast is accepted but treated as if it had no starter: no feeds are planned and the rise times stay the short yeast ones.

## Goals

- A recipe with yeast and no starter is converted automatically when it is built, with grams and times that make sense for a starter.
- The conversion is visible (what changed) and reversible (one switch back to the original).
- The existing retro-planning and feed planning work on the converted recipe unchanged.

## Non-goals

- No AI step, no network, no new relay features.
- No attempt to convert recipes that already contain a starter.
- No tuning per bread type beyond "lean" and "enriched".

## Anti-goals

- Silent changes: the user must always be able to see that the recipe was converted.
- Losing the original: the saved recipe stays exactly as imported.

## Approaches considered

- **A. Fixed rules in the app (chosen by Andrea).** Offline, predictable, testable, free.
- B. AI rewrites the recipe. More flexible on odd recipes, but needs network and Workers AI, grams can be wrong, hard to test. Rejected.
- C. Convert grams only, user fixes times. Not "usable right away". Rejected.

## Rules (Andrea approved these defaults on 2026-11-17)

Applied only when the recipe has yeast grams > 0 and no starter grams.

1. **Starter amount:** 20% of the total flour weight, at 100% hydration.
2. **Compensation:** the starter holds equal parts flour and water, so take half of the starter weight out of the flour and half out of the water. The hydration stays the same and the total dough weight stays about the same.
3. **Yeast:** removed. Salt and every other ingredient unchanged.
4. **Times:** multiply the bulk and the final proof times written in the recipe by 3 (lean dough) or 4 (enriched dough). The fridge rest ("chill"), autolyse, folds, pre-shape, oven and cooling times are not scaled. Times the recipe did not give (the app's estimates) are not scaled either.
5. **Enriched dough:** sugar, fat (butter, oil) and eggs together are at least 12% of the flour weight, found from ingredient names (Italian and English). This is my call, adjustable in one constant.
6. **Feeds:** `fromImported` already plans them once the dough has a starter, using the chosen preset.

## Behaviour

- `Convert.yeastToStarter(recipe)` is a pure function in a new file `convert.js`. It returns `{ recipe, converted, info }` where `info` has the starter grams, the yeast grams removed, and the time factor. If the rules do not apply it returns the recipe unchanged with `converted: false`.
- `build()` in `app.js` calls it before `Recipe.fromImported` when the state flag `useStarter` is true (default true).
- The recipe screen shows a short note when a conversion happened: "Converted from yeast: 100 g starter instead of 3 g yeast, rises about 4 times longer", with a switch "Use the original yeast recipe". With the switch off the recipe is built exactly as before.
- The note and switch only appear for recipes that contain yeast and no starter.
- Texts in English and Italian in `i18n.js`.

## Edge cases

- Recipe has both yeast and starter: no conversion, no note.
- Water or flour would drop to 0 or below: skip the conversion and show the original with a short message.
- Several flours: take the flour reduction proportionally from each.
- Yeast given as 0 or missing: no conversion.

## Constraints

- Vanilla JS, same UMD module pattern as `calc.js`. Tests with `node tests\<name>.test.js`, as the existing ones.
- Bump `VERSION` in `C:\Claude_Projects\Sourdough_Baker\sw.js`, add `convert.js` to its `CORE` list and to `C:\Claude_Projects\Sourdough_Baker\index.html`.
- The repo is public: no web photos, no personal data in tests.

## Left to the builder

Exact regexes for sugar/fat/egg names, rounding of grams (whole grams like the rest of the app), and the layout of the note.

## Test plan

Pure-function tests in `C:\Claude_Projects\Sourdough_Baker\tests\convert.test.js`: a lean recipe (500 g flour, 325 g water, 3 g yeast gives 100 g starter, 450 g flour, 275 g water, times x3), an enriched one (x4), recipe with a starter (unchanged), no yeast (unchanged), multiple flours, water too low. Then a check that `Recipe.fromImported` on the converted recipe plans feeds, and a headless browser pass on the real app.
