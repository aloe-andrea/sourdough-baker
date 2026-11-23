# Four-step flow and app-style UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current screens with the four-step flow (Recipe, When, Confirm, Cook) in an app-style UI, with the night-hours decision on the Confirm screen.

**Architecture:** A new pure module `flow.js` decides routing, migrates old saved views, finds night steps and builds the Confirm summary. `index.html` and `styles.css` are rewritten for the new screens (no photo backdrops); `app.js` keeps its logic (build, compute, import, review, convert, calendar) and gets new view routing, a bottom tab bar, a menu sheet and the Confirm step. Planner, recipe, calc, convert, recipeimport and ics are not changed.

**Tech Stack:** Vanilla JS (UMD modules), node `assert` tests, headless Playwright (Python) for walk-throughs.

**Spec:** `C:\Claude_Projects\Sourdough_Baker\docs\superpowers\specs\2026-11-23-ux-four-step-flow-design.md` (sections "Night hours decision", "Builder-check answers" and "Visual language" override earlier text). Visual reference: `C:\Claude_Projects\Sourdough_Baker\docs\superpowers\specs\assets\2026-11-23-ui-mockup.css` and the FigJam section "Design in stile app (proposta)" at https://www.figma.com/board/VAsxZ0PjKllwiwPlB8Cz8S

## Global Constraints

- Views after the change: `import`, `card`, `review`, `recipes`, `home` (When), `advanced`, `confirm`, `now`, `plan`, `ingredients`. Removed: `intro` (kept only as the help sheet), `again`.
- `S.started` (boolean, default false) is set by "Start the plan", cleared by reset. Old saves with `S.view` in `now`, `plan`, `ingredients` and a plan that computes count as started on load.
- A step touches the night when its `inizio` (action moment) is inside the quiet window, 23:00 inclusive to 07:00 exclusive by default, wrapping midnight; uses `S.quiet`, regardless of `S.quietOn`.
- The Confirm plan is computed with quiet hours off (ideal plan). "Replan without night hours" computes with quiet on (`S.quiet`). Nothing starts until the user presses Start.
- Yeast conversion switch (`S.useStarter`) lives on the recipe card and the Ingredients tab, same persisted flag.
- English and Italian for every string; the two dictionaries must have the same keys. No em dash anywhere.
- Colours, spacing, components as in the mockup CSS; Sora font stays; no photo backdrops, no quotes footer, no floating language switch.
- Bump `VERSION` in `C:\Claude_Projects\Sourdough_Baker\sw.js` (currently `sourdough-v16`) and keep `CORE` in step with the files.
- Headless browser checks only; server bound to 127.0.0.1 on port 8781 (not 8765, taken by the dashboard hub); delete scratch files afterwards. Public repo: no web photos, no personal data.

## Review Focus

- A saved state from the old app (`view` equal to `intro`, `again`, `review`, `ingredients`, or unknown) opens on a valid view without errors.
- Plan steps exactly at 23:00 are night, exactly at 07:00 are not; a plan that starts before 23:00 and ends after 07:00 reports every step inside.
- A recipe whose ideal plan has no night step shows no night notice and no "replan" button.
- "Replan without night hours" when the planner cannot find a plan (no result): Confirm keeps the ideal plan and shows the existing "no plan" notice, nothing starts.
- Back from every screen goes to a sensible place, and the Android/iOS system back (hash or none) does not leave the app in a state with the tab bar on a wizard screen.

---

### Task 1: The flow module

**Files:**
- Create: `C:\Claude_Projects\Sourdough_Baker\flow.js`
- Test: `C:\Claude_Projects\Sourdough_Baker\tests\flow.test.js`

**Interfaces:**
- Consumes: plan object from `Planner.plan` (`ok`, `target`, `steps[]` with `nome`, `inizio`, `fine`, `fatto`, `avvisi[]`), state object `S` (`recipes`, `recipeId`, `started`, `quiet`, `view`).
- Produces (all exported on `Flow`):
  - `isNight(ms, quiet) -> boolean` (quiet is `{ start: 'HH:MM', end: 'HH:MM' }`; null quiet is never night).
  - `startView(state, planOk) -> 'now' | 'home' | 'import'`: `'now'` when `state.started && planOk`; else `'home'` when a recipe with `state.recipeId` exists in `state.recipes`; else `'import'`.
  - `migrateView(view, state, planOk) -> one of the ten views`: valid new view names pass through; `now`, `plan`, `ingredients` pass only when `state.started && planOk`, otherwise `'home'` (or `'import'` with no recipe); `intro`, `again`, `review`, unknown and empty map to `'home'` (or `'import'` with no recipe).
  - `nightSteps(plan, quiet) -> [{ at, name }]` over steps that are not `fatto`, in order, `name` taken from `nome` (an `{en,it}` object, returned untouched).
  - `summary(plan, state) -> { firstAt, firstName, readyAt, nightSteps, notices }`: `firstAt` and `firstName` from the first step not `fatto`, `readyAt` is `plan.target`, `notices` is `plan.avvisi`, `nightSteps` as above using `state.quiet`.

- [ ] **Step 1: Write the failing tests** in `tests\flow.test.js` (same `test()` harness as `tests\convert.test.js`), names and assertions:
  - `isNight: 23:00 is night, 22:59 is not, 06:59 is night, 07:00 is not` (use local-time `new Date(2026, 10, 24, h, m).getTime()`).
  - `isNight: null quiet is never night`; `isNight: a window that does not wrap (13:00 to 15:00)`.
  - `startView: started and plan ok opens now`; `started but plan not ok opens home`; `not started with a saved recipe opens home`; `no recipe opens import`; `recipeId pointing to a missing recipe opens import`.
  - `migrateView: new view names pass through`; `now/plan/ingredients when not started map to home`; `intro, again, review, unknown, undefined map to home or import by recipe presence`.
  - `nightSteps: lists only steps in the window, skips done steps, keeps order`; `a plan with no night steps returns []`; `steps at 23:00 exactly are included, 07:00 exactly are not`.
  - `summary: first step not done gives firstAt and firstName; readyAt is the target; notices are passed through`.
- [ ] **Step 2: Run** `node C:\Claude_Projects\Sourdough_Baker\tests\flow.test.js`. Expected: fails with `Cannot find module '../flow.js'`.
- [ ] **Step 3: Implement `flow.js`** as a UMD module with the signatures above, same wrapper as `convert.js`. `isNight` parses `HH:MM` to minutes and handles a window that wraps past midnight.
- [ ] **Step 4: Run the test file again.** Expected: all pass; then run the other six suites and confirm they are unchanged.
- [ ] **Step 5: Commit** `flow.js` and the test, message `Add flow module for routing and the night check`.

### Task 2: Steps 1 to 3 (Recipe, When, Confirm) in the new style

**Files:**
- Modify: `C:\Claude_Projects\Sourdough_Baker\index.html` (new markup for `import`, `card`, `review`, `recipes`, `home`, `advanced`, `confirm`, the top bar, the step indicator, the sheet menu), `C:\Claude_Projects\Sourdough_Baker\styles.css` (rewritten from the mockup CSS plus form controls and the review screen), `C:\Claude_Projects\Sourdough_Baker\app.js` (routing, steps 1 to 3, Confirm and the night decision), `C:\Claude_Projects\Sourdough_Baker\i18n.js` (new keys, EN and IT)
- Test: `C:\Claude_Projects\Sourdough_Baker\tests\i18n.test.js` (new), headless walk-through (not committed)

**Interfaces:**
- Consumes: `Flow.startView`, `Flow.migrateView`, `Flow.summary`, `Flow.nightSteps` from Task 1; existing `build()`, `compute(done)`, `recompute()`, `renderIngredients` content, `openReview`, `saveReview`, `chooseRecipe`, `Planner.earliest`.
- Produces: `show(view)` for the ten views with a `topBar(view)` that sets title, back target and step indicator (steps 1 to 3 only); `S.started` in `DEFAULTS` (false); `compute(done, withQuiet)` where `withQuiet` defaults to `false` for the Confirm plan and the replan passes `true`; `renderCard()`, `renderRecipes()`, `renderConfirm()`; menu sheet open/close helpers `openMenu()`, `closeMenu()` used by Task 3. i18n key parity between `DICT.en` and `DICT.it`.

- [ ] **Step 1: Write the failing test** `tests\i18n.test.js`: `DICT.en` and `DICT.it` have exactly the same keys; no value contains an em dash. Run it, expected FAIL only after the new keys are added to one language (add the English keys first, run, see it fail on the missing Italian ones).
- [ ] **Step 2: Rewrite `index.html` and `styles.css`** for the screens in the spec: top bar, three-segment progress, cards, list rows, switches, segmented control, chips, sticky primary button, notice cards, sheet menu. Keep `<script>` order and add `flow.js` after `convert.js`. Remove the backdrop `<div class="bg">`, the veil, the quotes footer, the floating language switch and the peek button.
- [ ] **Step 3: Wire routing in `app.js`.** Startup uses `Flow.startView` and `Flow.migrateView` (migrate the saved `S.view` first). Import "Read" goes to `card`; `card` actions: Continue to `home`, Edit details to `review`, Choose another to `recipes`; review Save and Back go to `card` (Back to `import` with no recipe); import Cancel goes to `card` when a recipe exists and is hidden otherwise; `recipes` has the saved list and "New recipe". `home` has the recipe chip, the date field, quick chips, "Start now" chip (sets the earliest target as today and goes to `confirm`), Advanced row opening `advanced` (feeds preset, loaf size, room temperature, dough temperature, quiet window switch and times, language EN/IT), Continue computes the ideal plan and goes to `confirm`.
- [ ] **Step 4: `renderConfirm()`** shows `Flow.summary` rows, the night card when `nightSteps` is not empty (list of steps with time and name, buttons "Start this plan" and "Replan without night hours"), the all-clear card after a successful replan, "Back to the original plan" after a replan, and the existing planner notices. "Start this plan" stores the chosen plan's target in `S.target`, sets `S.started = true`, resets `S.done`, and shows `now`.
- [ ] **Step 5: Run `tests\i18n.test.js`, all existing suites and `tests\flow.test.js`.** Expected: all pass.
- [ ] **Step 6: Headless walk-through** (server 127.0.0.1:8781, 390x844, `-X utf8`): first launch with no recipe reaches Import with the step indicator; paste the sample recipe, Read, land on the card, Continue, pick a time, Continue, Confirm shows a night card for a plan that has night steps and no night card for one that does not; Replan shows the green card; Start lands on Now. Read at least the Import, card, When and Confirm screenshots and compare with the FigJam section.
- [ ] **Step 7: Commit** `Rework steps 1 to 3 in the app-style UI`.

### Task 3: Cook screens, tab bar, menu, state migration

**Files:**
- Modify: `C:\Claude_Projects\Sourdough_Baker\index.html`, `C:\Claude_Projects\Sourdough_Baker\styles.css`, `C:\Claude_Projects\Sourdough_Baker\app.js` (`renderNow`, `renderPlan`, `renderIngredients`, `stepItem`, `nightRow`, `notices`, menu actions), `C:\Claude_Projects\Sourdough_Baker\i18n.js`

**Interfaces:**
- Consumes: Task 2's `show`, `openMenu`, `closeMenu`, `S.started`; existing `activeStep`, `markDone`, `unmarkDone`, `exportCalendar`.
- Produces: bottom tab bar visible only on `now`, `plan`, `ingredients`, switching between them without a back stack; menu sheet actions: Change recipe (`recipes`), Change time (`home`, with the existing "clear the steps marked as done" confirmation when any step is done and the plan is started), Add to calendar, How it works (the old intro text as a sheet), Reset the plan (confirmation, clears `S.done` and `S.started`, goes to `home`); the yeast switch and note on the Ingredients tab as in Task 2's card.

- [ ] **Step 1: Restyle `now`** as the "next step" card (name, day, large time, relative time, "you need" chips, how to and signal text, fixed Done button), `plan` as the segmented day tabs with the timeline (dots, night dot in orange), `ingredients` as the card content shared with `renderCard`. Remove the old Back, Plan, Ingredients and Edit buttons.
- [ ] **Step 2: Wire the tab bar and the menu sheet** as above. Running plan on open goes to `now`; old saves migrate through `Flow.migrateView`.
- [ ] **Step 3: Run all suites.** Expected: all pass.
- [ ] **Step 4: Headless walk-through:** returning user opens on When; a started plan opens on Now; tabs switch Now, Plan, Ingredients; menu actions work (change time with a done step shows the confirmation, dismissing keeps the plan; reset returns to When); an old saved state (`view` set to `intro`, then `again`, then `review`, then `ingredients` with and without `started`) opens on a valid view with no page errors; the yeast switch persists across reload. Read the screenshots of Now, Plan, Ingredients and the menu.
- [ ] **Step 5: Commit** `Rework the cook screens with tabs and a menu sheet`.

### Task 4: Cleanup and release

**Files:**
- Modify: `C:\Claude_Projects\Sourdough_Baker\app.js` (remove photo, palette, backdrop, quote and peek code), `C:\Claude_Projects\Sourdough_Baker\sw.js` (`VERSION`, `CORE`), `C:\Claude_Projects\Sourdough_Baker\README.md`, `C:\Claude_Projects\Sourdough_Baker\index.html` (drop the `images.js`, `images.local.js`, `quotes.js` script tags)

**Interfaces:**
- Consumes: finished Tasks 2 and 3.
- Produces: a release with no dead code paths calling removed elements; `CORE` lists exactly the files the page loads (`flow.js` added, unused ones removed from `CORE`, files kept in the repo).

- [ ] **Step 1: Remove dead code** (`IMGS`, `applyPalette`, `setBackdrop`, `imageForStep`, `homeImage`, `newQuote`, `refreshQuoteLang`, the peek and help-return logic that no longer applies) and confirm with a grep that nothing references a removed element id.
- [ ] **Step 2: Run all suites** (calc, import, recipe, planner, convert, relay, flow, i18n). Expected: all pass.
- [ ] **Step 3: Final headless pass** over every screen in Italian and English, reading one screenshot per screen; check the console has no page errors; confirm offline start works once the service worker is installed (load, go offline, reload).
- [ ] **Step 4: README section** describing the four steps and the night decision; bump `VERSION`.
- [ ] **Step 5: Commit and push** `Four-step flow with an app-style UI` (pushes to `main` are authorized for this repo); delete scratch files in the temp folder.
