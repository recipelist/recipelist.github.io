# Recipe List

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
  guess at what it consumes, which you then correct. A page's JSON-LD is read
  directly when you paste that instead.
- **Scaling** — servings up and down, with quantities re-rendered as kitchen
  fractions (metric stays decimal). A line that could not be parsed is passed
  through untouched rather than mangled.
- **Cook mode** — one step at a time, full screen, with the ingredients that
  step needs as a checklist, timers read out of the step text ("simmer 20
  minutes"), and the screen kept awake.
- **Kitchen** — a week planner, and a shopping list that merges duplicate
  ingredients across recipes and groups them by aisle.
- **Settings** — dark or light, default view, export and import, and the
  storage health readout.

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

## Licence

MIT, for the code. The recipes you enter are yours. The eight sample recipes
are written for this project and go with the code.
