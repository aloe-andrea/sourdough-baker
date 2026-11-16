# Sourdough, planned backwards

A personal web app that plans a sourdough bake backwards from the time you want your bread, or forwards from "if I start the first feed now". It keeps every step out of your rest hours (default 23:00 to 07:00), scales the timings with your house temperature, and re-plans live when a step runs late.

## What it does

- **Backwards plan.** Pick when the bread should be on the table. The app works out each feed, mix, fold, shaping, chill and bake, with an "earliest" and a "latest by" time for every step, all on :00, :15, :30 or :45.
- **If I start now.** Tells you when the bread is ready if you feed the starter now, or the best moment to start when starting now cannot avoid a night step.
- **Your recipe.** Load it once: paste the text, or use your own AI (Claude, ChatGPT) to read a link, screenshot or photo and paste its short answer. The app checks it with you, then works out the grams for the loaf size you want, the feeds backwards from the starter the dough needs, and the water temperature. Next time it asks whether to continue with the same recipe.
- **Live re-plan.** "Done now" on a step moves the following steps; if the delay makes the plan impossible it says so instead of inventing one.
- **Calendar.** Exports every step with alarms (10 minutes before and on time) as an `.ics` file.
- **English and Italian**, switchable at the top right.
- **Full-page photos** with panels that take their colours from the picture.
- **Offline.** A service worker caches the app and all photos (needs `https://` or `localhost`).

## Run it

Open `index.html`, or serve the folder:

```
python -m http.server 8080
```

`serve.bat` does the same on your local network, so you can open the app from your phone on the same Wi-Fi.

## Tests

```
node tests/planner.test.js
node tests/calc.test.js
node tests/import.test.js
node tests/recipe.test.js
```

The planner is plain JavaScript with no dependencies. It finds plans with dynamic programming on a 15 minute grid, so the "earliest" answer is the real earliest.

## Files

| File | Purpose |
|---|---|
| `planner.js` | Planning engine: backwards plan, flexibility windows, "if I start now" |
| `recipe.js` | Feed presets, standard steps, and turning an imported recipe into steps with grams |
| `recipeimport.js` | Reads pasted text or the AI's JSON, assembles the steps |
| `calc.js` | Grams, scaling, feeds worked backwards, water temperature |
| `ics.js` | Calendar export |
| `i18n.js`, `quotes.js` | Texts and quotes |
| `app.js`, `index.html`, `styles.css` | Interface |
| `images.js`, `assets/img/` | Photos with the colours of each panel |
| `sw.js`, `manifest.webmanifest` | Offline and install |
| `reference/` | Original images the app photos were cut from |

## Photos

The photos were generated with Gemini for personal use. See `CREDITS.md`.
