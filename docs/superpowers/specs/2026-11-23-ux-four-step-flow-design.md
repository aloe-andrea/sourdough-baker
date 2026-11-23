# Sourdough Baker: four-step UX flow, design

Date: 2026-11-23. Owner: Andrea. Size: a project (new flow across most screens, one new small module).

Reference: the current flow with real screens and the friction notes are in the FigJam board https://www.figma.com/board/VAsxZ0PjKllwiwPlB8Cz8S (sections "Flusso attuale con schermate reali" and the diagram "proposed UX flow in 4 steps").

## Intent

Andrea finds the app confusing. The cause is the flow, not the planning logic: an intro and a "same recipe?" question before anything useful, a Home screen with six decisions at once, a heavy recipe review before the first plan, and a set of small links (Plan, Ingredients, Edit) that lead to screens with inconsistent Back behaviour. The choice to convert a yeast recipe to sourdough is only reachable after the plan has started. The goal is a linear flow a person understands without reading anything: recipe, when, confirm, cook.

## Goals

- A new user gets from "paste a link" to a running plan in four obvious steps, and a returning user in two (when, confirm).
- A running plan opens directly on the current step.
- Every capability that exists today stays reachable (feeds preset, loaf size, room temperature, dough temperature, quiet hours, calendar export, reset, recipe list, recipe editing, language, help).
- The yeast to sourdough switch is visible on the recipe card, at the moment the recipe is chosen.
- One consistent way to move between the cooking screens, and no Back button that goes to a different place depending on state.

## Non-goals

- Copy tone and i18n (English and Italian) stay. The visual style does change, see "Visual language" below (Andrea, 2026-11-23: clearer and more typical of an app).
- No change to `planner.js`, `recipe.js`, `calc.js`, `convert.js`, `recipeimport.js`, `ics.js`, the relay worker or the plan maths.
- No new storage format. Saved state must keep working; unknown or removed view names fall back to Home.

## Anti-goals (would be a failure even if it works)

- A capability that becomes impossible or hidden so deep that nobody finds it.
- More taps than today for a returning user.
- A wizard that traps the user: every step can go back, and the cooking screens never show wizard chrome.

## Approaches considered

- **A. Re-wire the existing screens (chosen).** Keep each current screen and its logic, add two small screens (recipe card, confirm), a bottom tab bar for the cooking screens, and a pure routing function. Lowest risk, reuses tested code, can ship in pieces.
- B. Rewrite the UI as a step-wizard component. Cleaner in theory, but replaces most of `app.js` (about 900 lines) and loses working behaviour. Rejected.
- C. Only reorder buttons and rename. Cheapest, does not fix the flow. Rejected.

Andrea handed the how ("parti"), so A is my call.

## The flow (screens and rules)

Routing on open, in order:
1. A plan is running (a saved target in the future and the plan computes): open **Now**.
2. A recipe is saved: open **When** (step 2), with the recipe chip on top.
3. No recipe: open **Recipe** (step 1, import).

No intro screen on first launch and no "same recipe?" screen. The `?` button still opens the intro as help and returns to where the user was. The one-line explainer already used under the import title stays.

**Step 1 Recipe.**
- Import screen as today (paste link or text, AI route behind its toggle).
- After reading, the user lands on the new **Recipe card** (not the review screen): recipe name, loaf weight, the dough ingredients in grams with baker's percentages, the yeast conversion note and switch when the recipe uses yeast, and three actions: **Continue** (to step 2), **Edit details** (opens the current review screen, which saves back to the card), **Choose another recipe** (the saved-recipes list).
- The card reuses the rendering of the current Ingredients screen, so the Ingredients tab and the card show the same content.

**Step 2 When.** The current Home screen, simplified:
- Top: the recipe chip (name, tap opens the saved-recipes list or the card) and the ready-time field with the quick chips.
- "Start now" is a chip next to the quick chips. Tapping it sets the ready time to the earliest possible and goes to step 3. It no longer shows its own preview block.
- Feeds preset, loaf size, room temperature, dough temperature and quiet hours move into one collapsed section "Advanced" (the current "Details" toggle, now holding all of them). Defaults are as today.
- One primary button **Continue** to step 3.

**Step 3 Confirm** (new screen). Shows what will happen: first action (time and what, normally the first feed), bread ready time, how many nights the plan crosses and the quiet hours in force, the feeds preset, the plan notices that exist today (for example "starts later than wanted"). Buttons: **Start the plan** (goes to Now) and **Back** (to step 2). A step indicator "1 Recipe, 2 When, 3 Confirm" is shown on steps 1 to 3 only.

**Step 4 Cook.** Now, Plan and Ingredients share a fixed bottom tab bar with three tabs (**Now**, **Plan**, **Ingredients**), plus a small menu button with: change recipe (to the saved-recipes list), change time (to step 2), reset the plan, calendar export (also on the Plan tab as today), help, language stays where it is. The existing buttons "Plan", "Ingredients", "Edit" on Now, the Back buttons on Plan and Ingredients, and the duplicate Ingredients button on Plan are removed. The bottom quote footer is hidden while the tab bar is shown.

Every change of recipe or time from the menu goes back through step 2 and 3, so the plan is always confirmed. Changing the recipe resets `useStarter` to true (as today).

## What the builder decides

Exact text of the new strings (English and Italian, same tone as the existing ones), the visual treatment of the tab bar and step indicator within the current CSS variables, the structure of the menu (a small sheet or a popover), and which existing CSS to reuse for the card and the confirm screen.

## Constraints

- Vanilla JS, same module pattern, no build step, no new dependency.
- A new pure module `flow.js` (UMD, like `calc.js`) holds the routing decision: `Flow.startView(state, planOk) -> 'now' | 'home' | 'import'`, and the confirm summary: `Flow.summary(plan, state) -> { firstAt, firstName, readyAt, nights, notices }`. It is unit tested with `node tests\flow.test.js`.
- Add `flow.js` to `C:\Claude_Projects\Sourdough_Baker\index.html` and to `CORE` in `C:\Claude_Projects\Sourdough_Baker\sw.js`, bump `VERSION`.
- `S.view` values from older saves (`intro`, `again`, `review`, `ingredients`) must map to a valid view on load.
- English and Italian for every string. No em dash anywhere.
- Public repo: no web photos, no personal data.
- Browser checks headless, server bound to 127.0.0.1, not on port 8765 (taken by the dashboard hub).

## Test plan

- `tests\flow.test.js`: routing for each state (running plan, recipe saved, nothing saved, saved target in the past, old view names), summary for a plan with and without quiet-hour nights.
- All existing suites stay green (calc, import, recipe, planner, convert, relay).
- Headless browser walk-throughs, each ending with a screenshot read: first launch with no recipe, returning user with a saved recipe, a running plan, "Start now", the yeast switch on the card, the tab bar on all three cooking screens, menu actions (change recipe, change time, reset), old saved states opening on a valid view.
- Compare the new screens with the FigJam proposal before calling it done.

## Open calls I made (Andrea can reverse)

- "Start now" stays as a chip in step 2 and continues to the Confirm step.
- Tabs at the bottom of the screen.
- "Edit details" keeps the current review screen as it is.
- Size and feeds move into "Advanced" in step 2.

## Builder-check answers (my calls, settled before planning)

- **Plan running:** a new saved flag `S.started`, set by "Start the plan" and cleared by reset. Routing opens Now only when `S.started` is true and the plan computes. Old saves with view `now`, `plan` or `ingredients` and a plan that computes count as started on load. `S.target` alone never means started.
- **Progress on a time or recipe change:** changing the recipe resets `S.done` as today. Changing the time from the menu asks the existing "clear the steps marked as done?" confirmation when any step is done, and wipes them if accepted; if refused, nothing changes and the user stays on Now.
- **Start now:** sets `S.target` to the earliest possible finish (as today, with the same toast when the target moves) and goes to Confirm. A delayed start shows as a Confirm notice, and Confirm shows the actual (pushed) ready time. The original wish is not kept.
- **Back and Cancel:** Import "Cancel" goes to the recipe card when a recipe is saved and is hidden otherwise. Review "Back" goes to the card when a recipe is saved, otherwise to Import; Review "Save" goes to the card. The saved-recipes list is the old `again` list kept as a view named `recipes`, with a "New recipe" action, reached from the recipe chip, the card ("Choose another recipe") and the menu. The `?` help returns to the view the user came from.
- **`Flow.startView(state, planOk)`** returns `'now' | 'home' | 'import'`; the card, Confirm and list are reached only by user action, never by routing. Old view names on load: `intro` and `again` map to `home` (or `import` with no recipe), `review` maps to `home` (or `import`) because the review state lives only in memory, `ingredients` and `plan` map to their tab only when started, otherwise to `home`. `S.intro` is ignored.
- **Confirm summary:** `firstName` and `firstAt` come from the first plan step that is not done (a feed, or the first dough step for recipes without feeds, or when the yeast switch is off); `readyAt` from the plan's end; `nights` counts quiet-hour periods the plan crosses, derived from the plan steps and `state.quiet`. `Flow.summary` returns `{ firstAt, firstName, readyAt, nights, notices }` where `notices` are the plan's existing notices.
- **Card and loaf size:** the card shows the recipe as built for the current loaf size (default: as written) and re-renders when Advanced changes the size. The yeast switch on the card flips the same persisted `S.useStarter` as the Ingredients tab.

## Night hours decision (Andrea, 2026-11-23, supersedes the quiet-hours behaviour above)

Andrea's ruling: the app must not forbid night steps up front. It plans first, then tells whether night hours are touched, shows the plan, and lets Andrea decide to go ahead or to replan without night hours.

- **Ideal plan first.** The plan shown on Confirm is computed without quiet hours, so it reaches the wanted ready time exactly.
- **Night check.** A step touches the night when its action moment (the time the plan tells you to act, not the waiting that follows) falls inside the quiet window (`S.quiet`, default 23:00 to 07:00). `Flow.summary(plan, state)` returns `nightSteps: [{ at, name }]` (empty when none), replacing `nights`.
- **Confirm screen when the night is touched:** a clear notice "The plan touches night hours: N steps between 23:00 and 07:00", the list of those steps with time and name, and two choices: **Start this plan** (ideal plan, as shown) and **Replan without night hours** (the existing planner run with the quiet window on). After replanning, Confirm shows the new first-action time and, if the ready time had to move, the new ready time as a notice (the existing "delayed" notice). A **Back to the original plan** action returns to the ideal plan. Nothing starts until Andrea presses Start.
- **When the night is not touched:** no notice, same Confirm as before.
- The "quiet hours" switch and times in Advanced stay: they define what counts as night and are what the replan uses. Default window unchanged.
- `S.started` is set by whichever plan Andrea starts, and the chosen plan is the one stored for Now and Plan.
- Applies to every recipe, not only long ones.
- Tests: `tests\flow.test.js` gains cases for a plan with steps inside the window, a plan with steps only at the window edges (07:00 exactly is not night, 23:00 exactly is), and a plan with no night steps.

## Visual language (Andrea approved the direction on 2026-11-23, "ok per ora")

Reference mockups: FigJam board https://www.figma.com/board/VAsxZ0PjKllwiwPlB8Cz8S, section "Design in stile app (proposta)"; tokens and components in `C:\Claude_Projects\Sourdough_Baker\docs\superpowers\specs\assets\2026-11-23-ui-mockup.css`. This supersedes the earlier photo-and-glass mockups ("Flusso proposto con schermate").

- Warm light surface (cream background, white cards with a thin warm border, rounded corners), crust-brown primary colour, dark brown text. Sora stays the font. The big serif step name and the full-screen photo backdrops are dropped on the main screens; a small thumbnail of the recipe photo appears on the recipe chip.
- Every screen has a top bar: back on the left when there is somewhere to go back to, title in the centre, menu on the right. Steps 1 to 3 show a three-segment progress bar and "Step N of 3".
- One primary button, full width, fixed at the bottom of the screen; secondary actions are an outlined button or a text button below it.
- Settings are grouped list rows, switches for on/off, a segmented control for the feeds preset, chips for quick choices, a slider for temperatures.
- Cook screens have the bottom tab bar (icons and labels) and the sheet menu from the top bar.
- A night-hours notice is an orange card, an all-clear is a green card, information is a sand card.
- The language switch EN/IT moves into the menu sheet and the Advanced screen (it no longer floats over every screen). The peek-at-the-photo button is removed.
- Photos: the rotating backdrop images and their credits are no longer shown on the main screens. The photo modules (`images.js`, `images.local.js`) stay in the repo, unused by default, because they may return as an optional setting.

## Final decisions (Andrea, 2026-11-23 and 2026-11-24, override earlier text)

- **Visual direction:** mustard for Recipe, Quando and the AI help; burgundy with orange and a mustard photo card for Confirm, Now, Plan and the menu; cream with a mustard band for Personalizza, recipes list and Ingredients. Tokens in `C:\Claude_Projects\Sourdough_Baker\docs\superpowers\specs\assets\2026-11-23-ui-final.css`. Fonts Bricolage Grotesque (titles) and DM Sans (text). No blue. Mockups: FigJam section "Flusso UX finale (senape, borgogna, panna)".
- **Leaven choice both ways:** a segmented control "Con quale lievito?" (fresh yeast | starter) on the recipe card and the Ingredients tab. A yeast recipe converts to starter (existing rules). A starter recipe converts to fresh yeast: yeast = 1% of the flour (rounded, at least 1 g), the starter is replaced by half its weight in flour and half in water, the written bulk and proof times are divided by 3 (4 for enriched doughs) with floors of 60 min for the bulk and 30 min for the proof, no feeds. State `S.leaven` (`'starter'`, `'yeast'` or null meaning starter), reset when the recipe changes.
- **"Parto adesso"** is a large option tile, equal to "Scelgo quando lo voglio", with the ready time already computed.
- **"Avanzate" becomes "Personalizza"**, in kitchen language: how much bread, how is your kitchen (cool 18, normal 22, warm 26 degrees), starter feeds (classic two feeds, or quick single feed), night warning with the window. No dough temperature or ratios in the UI (defaults kept in state).
- **AI import** is a screen with three numbered steps, reached from "Non riesce a leggerla? Chiedi aiuto a un'AI".
- **Confirm** shows "Va bene cosi, avvia" and "Evita la notte" when night steps exist.
- **Future, not now:** a built-in "create your starter from scratch" routine (daily steps over about a week, readiness check, forward plan). It reuses the stages model of the panettone project.
