# Recipe List

### [recipelist.github.io](https://recipelist.github.io/)

Your own recipe book, kept in your browser. Nothing is uploaded, nothing needs
an account, and there is no server to go down.

The point of it is the shape a recipe is stored in. A recipe here is a **tree,
not a list**: every step names the ingredients and earlier step results it
consumes. That one decision is what lets the same recipe be drawn two ways
without either being a re-typing of the other.

## The two views

**Grid** is the ingredients-and-operations table: ingredients run down the
left, and each operation cell spans exactly the rows it swallows, merging
rightward until one final cell. It shows at a glance what combines with what,
and what can be done in parallel.

```
1 cup butter, softened      | cream |      |                    |     |
1-1/2 cup granulated sugar  |       | beat |                    |     |
1 cup sour cream            |       |      | mix in 1 at a time | mix | fold in
2 large eggs                |       |      |                    |     |
2 cups sifted flour         | whisk to combine                  |     |
1/4 cup chopped pecans      | toast | process to crumbs               |
```

**List** is the ordinary page: ingredients, then a numbered method in cooking
order, each step showing what it uses. The order is the tree read bottom-up,
so a step can never appear before the thing it needs.

Desktop opens on the grid, phones open on the list with a Grid button that
takes it full screen with the ingredient column pinned.

## What else is in it

- **Recipes** — search across titles, ingredients, steps and notes; filter by
  tag, favourites, under 30 minutes, or not yet cooked; sort by recent, name,
  time, rating or how often you have made it.
- **Adding** — a structured editor, or paste in a block from anywhere. A paste
  is pulled apart into ingredients and steps, and each step is given a first
  guess at what it consumes, which you then correct.
- **Pasting a web page** — copy a recipe page, or its source, and paste the
  lot. It is read the way a scraper reads one: every JSON-LD block first, then
  microdata, then the words on the page with the site's furniture (jump links,
  share buttons, the 1x/2x/3x scaler, nutrition tables) left behind. A link on
  its own cannot be read, because a browser will not let this page fetch
  another site.
- **Scaling** — servings up and down, with quantities re-rendered as kitchen
  fractions (metric stays decimal). A line that could not be parsed is passed
  through untouched rather than mangled.
- **Cook mode** — one step at a time, full screen, with the ingredients that
  step needs as a checklist, timers read out of the step text ("simmer 20
  minutes"), and the screen kept awake.
- **Meal Plan** — a week planner you can page back and forth through.
  Planning from a recipe offers the next fortnight, or a calendar for any date
  beyond it.
- **Shopping** — everything the plan needs, merging duplicate ingredients
  across recipes and grouping them by aisle, plus anything else you add by
  hand. The tab carries a count of what is still to buy.
- **Sharing** — send every recipe straight to another device, browser to
  browser, with nothing passing through a server on the way.
- **Settings** — dark or light, default view, export and import, auto-save to
  a file, and the storage health readout.

Dark mode is the default. Everything you enter stays in this browser.

## Run it

No build step and no dependencies. Serve the folder:

```bash
python -m http.server 8126
```

Files:

- `index.html` — the shell: rail, bottom bar, page containers
- `css/style.css` — palette and layout, both themes
- `js/units.js` — quantity parsing, scaling, aisle map
- `js/store.js` — everything that touches localStorage
- `js/parse.js` — paste-and-parse, JSON-LD, the step-link guess, timers
- `js/qr.js` — the QR encoder, written out rather than pulled in
- `js/vcode.js` — the reply code and its reader, also written out
- `js/scan.js` — the camera viewfinder
- `js/share.js` — the device-to-device transfer
- `js/grid.js` — the tree, and the grid and list renderers
- `js/samples.js` — the eight demo recipes
- `js/app.js` — routing, pages, editor, cook mode, planner, list

## Your recipes are only as safe as this browser

localStorage is scoped to the origin. It survives deploys and reloads, but not
a cleared site history, not a different machine, and not a move to a custom
domain. Safari also evicts script-written storage after about a week without a
visit. **Export is how you carry a collection across any of those.**

Three guards sit behind that:

- Storage keys are never renamed. A rename orphans a whole cookbook at once.
- A value that cannot be parsed is copied to `<key>-rescued` *before* anything
  else is written, so a bad read can never destroy a good backup.
- Every write is read back. A failure surfaces in Settings and as a toast,
  rather than the app looking like it saved when it did not.

Import **merges**: same recipe keeps whichever side was updated later, and a
recipe the incoming file has never heard of is left alone. Restoring an old
backup can add recipes but can never take one away.

### Auto-save to a file

Settings has an **Auto-save to a file** panel. Pick a file once and the whole
collection, the planner and the shopping list are written to it whenever
anything changes. Point it at a synced folder and there is a copy of every
recipe off this machine that survives the browser entirely. The file is the
same shape Export writes, so Import already understands it.

Two honest limits. It needs the File System Access API, so it is Chromium on
a desktop only; the panel says so plainly on Firefox and on iOS, where manual
export stays the way. And browsers grant file-write permission for one visit
at a time, so after a refresh the panel shows **Paused** with a Resume button
until you pick *Allow on every visit* in the browser's own prompt.

### Sharing between your devices

Settings has a **Sharing** panel. It sends the whole collection from one
browser straight to another over WebRTC: the recipes go directly between the
two devices and nothing about them is stored anywhere in between.

The two devices cannot find each other on their own, and that is not an
oversight. Discovery is the one thing a service like PairDrop keeps a server
for, and this site has none: a page cannot open a socket, cannot listen for a
connection, cannot ask mDNS anything, and is not even told its own address on
the network. So you introduce the two devices yourself.

Nothing is typed and nothing is pasted. The sending device shows a **QR
code**; you scan it with the other device's camera, which opens this page
there. That device answers with a code of its own on screen, and the sender
reads it back with its camera. The sender then says it is connected and how
many recipes it is about to send, you press confirm, and across they go.

Two scans, one each way, because that is the floor: a connection needs two
messages and information only travels from a screen into a camera.

What arrives is **merged**, exactly as an imported backup is: the same recipe
keeps whichever side is newer, and nothing you already have is removed. Only
pair with a device you own or a person you trust.

## Licence

MIT, for the code. The recipes you enter are yours. The eight sample recipes
are written for this project and go with the code.
