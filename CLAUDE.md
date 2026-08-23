# Recipe List - project instructions

## Keep README.md current
Whenever features are added, changed, or removed, update README.md in the same
commit so it accurately describes the tool. Check especially the feature
bullets, the "Run it" file list, and the two-views description.

## Deploys
- The site is GitHub Pages from this repo (recipelist.github.io).
- **Never push to main.** Every change goes on a short topically named branch
  (`shopping-aisles`, `mobile-grid`), gets pushed, and lands through a pull
  request. Merging the PR is what publishes.
- Before pushing more commits to an existing PR's branch, check that the PR is
  still open. If it has been merged or closed, branch again from the updated
  main and open a new PR.
- Bump the `?v=N` query on the css/js links in index.html on every deploy that
  changes those files (cache busting). All six script tags and the stylesheet
  move together.

## Conventions
- Plain HTML/CSS/vanilla JS only; no frameworks and no build step. ES5-era
  syntax throughout, and no regex feature newer than a lookahead: a lookbehind
  fails to *parse* on older Safari, which takes the whole file down with it.
- The shell, the type scale and the spacing are lifted from the sibling
  thetricktionary.github.io: 15px body, 1.5rem body padding, a 224px sticky
  rail flush to the left edge (negative margins cancel the body padding), a
  fixed bottom bar at <=700px where `.tab-list` and `.tabs-foot` become
  `display: contents`, 10px panels, 7px controls. Only the colours are this
  project's own. **When adding UI, match those numbers rather than inventing
  new spacing.**
- The palette is a warm brown: `#d2a679` light brown as the dark-mode primary
  on a `#14110e` near-black, and a deeper `#8a5a2b` on white in light mode.
  **Dark is the default**; light is opt-in and stored under `rl-theme`.
- Three tabs, on every screen: Recipes, Kitchen, Settings. Kitchen holds Plan
  and Shopping list behind a segmented control. There is no More sheet and no
  floating add button; New recipe lives in the page head. If a fourth
  destination is ever needed, it goes inside one of the three, not beside them.
- Routing is the hash and nothing else, so every view is linkable:
  `#recipes`, `#r/<id>`, `#edit/<id>`, `#new`, `#kitchen/plan`,
  `#kitchen/shop`, `#settings`, `#cook/<id>`.
- Rendering is innerHTML plus one delegated click handler keyed on `data-act`.
  After any change the page is simply drawn again. Keep it that way: no
  partial DOM patching, so no two parts of the screen can drift apart.

## The recipe is a tree
This is the load-bearing idea and everything else depends on it.

- A step carries `inputs`: ids of ingredients and of earlier steps whose result
  it consumes. That makes a forest, and the forest is what the grid draws.
- **Nothing may be consumed twice.** The table layout has no way to draw it.
  `buildTree()` drops a second claim, and the editor moves an input rather than
  copying it when you pick something already spoken for.
- Grid geometry: an ingredient is column 0, a step is one past its deepest
  input, a cell's `rowspan` is the leaves under it, and its `colspan` reaches
  right to just before whatever consumes it (a root reaches the edge). Rows are
  ordered by a depth-first walk with the deepest input first. Gaps are real and
  are filled with blank cells; do not try to close them by shifting cells.
- The list view is the same tree in post-order, so the two views can never
  disagree. Never render one from anything but `buildTree()`.
- The link guess in `parse.js` is a *starting point*, never presented as fact.
  Anything it infers must stay visible and correctable in the editor.

## Never lose someone's recipes
There is no server copy. These have guards rather than good intentions.

- **Never rename a storage key** (`rl-recipes`, `rl-plan`, `rl-shop`,
  `rl-prefs`, `rl-theme`). A rename orphans a whole cookbook at once.
- **Never write over what you could not read.** `loadJSON()` copies an
  unparseable value to `<key>-rescued` before anything else happens. Keep that
  ordering.
- **A failed write must be visible.** `rawSet()` reads back what it wrote; a
  failure sets `storageOK`, which Settings and a toast report.
- **Import merges, it never replaces.** Same id keeps whichever side is newer;
  a title-and-shape match catches a re-import that lost its ids. Restoring an
  old backup can add recipes but must never remove one.
- **Ids are permanent.** The planner and the shopping list point at recipe ids,
  and steps point at ingredient ids. `duplicate()` remaps every id in the copy;
  anything else that clones a recipe must do the same.
- `clearDemo()` removes only samples whose `updated` still matches the frozen
  stamp in `samples.js`. Edit a sample and it is yours. Never widen that check.

## Parsing
- `parseIngredient()` keeps `raw` alongside the parsed parts, always. The parse
  serves the scaler and the shopping list; it is never allowed to replace what
  the user typed. A line it cannot read has `qty: null` and is rendered from
  `raw` verbatim, including by the scaler.
- The shopping-list merge is deliberately cautious: two lines join only when
  their names normalise identically and their units reduce to the same base.
  Listing "onion" and "red onion" separately is the correct failure; merging
  them is not.
- `tools/`-style generated data does not exist here and should not be added.
  Everything is authored by the user at runtime.

## Not built yet
- No PWA: no manifest, no service worker, no offline beyond the browser cache.
  If one is ever added it must not touch storage.
- No photo upload, by choice. `photo` is a URL, linked and never copied, so a
  recipe cannot quietly consume the storage quota.
- No import from a URL: a client-side fetch is blocked by CORS on most recipe
  sites. Pasting a page's JSON-LD covers the same ground without a proxy.
