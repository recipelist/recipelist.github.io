/* store.js - everything that touches localStorage.
   ------------------------------------------------
   The recipes are the user's own writing and there is no server copy, so the
   rules here are stricter than the rest of the app:

   - Never rename a storage key. A rename orphans a whole cookbook at once.
   - Never write over what could not be read. An unparseable value is copied
     to <key>-rescued before anything else happens.
   - A failed write must be visible. Every write is read back; a failure sets
     storageOK, which Settings and a toast report, rather than the app
     pretending it saved.
   - Import merges, it never replaces. Restoring an old backup can add
     recipes but can never take one away. */
(function (global) {
'use strict';

var K = {
  recipes: 'rl-recipes',
  plan:    'rl-plan',
  shop:    'rl-shop',
  prefs:   'rl-prefs',
  theme:   'rl-theme'
};

var SCHEMA = 1;
var storageOK = true;
var lastError = '';

function rawGet(key) {
  try { return localStorage.getItem(key); } catch (e) { storageOK = false; lastError = String(e); return null; }
}

/* Read-back verification: a quota error on Safari private browsing throws,
   but some engines fail quietly, so trust only what reads back. */
function rawSet(key, val) {
  try {
    localStorage.setItem(key, val);
    if (localStorage.getItem(key) !== val) throw new Error('value did not read back');
    return true;
  } catch (e) {
    storageOK = false;
    lastError = String(e && e.message || e);
    return false;
  }
}

function loadJSON(key, fallback) {
  var raw = rawGet(key);
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    /* Rescue first, and only then let the caller carry on with the fallback.
       The ordering is the whole point: the bad value is preserved before any
       new write can land on top of it. */
    rawSet(key + '-rescued', raw);
    storageOK = false;
    lastError = 'stored data at ' + key + ' could not be read; a copy was kept at ' + key + '-rescued';
    return fallback;
  }
}

function saveJSON(key, value) { return rawSet(key, JSON.stringify(value)); }

/* ---------- ids ---------- */

var idSeq = 0;
function uid(prefix) {
  idSeq++;
  return (prefix || 'x') + '_' + Date.now().toString(36) + '_' + idSeq.toString(36) +
         Math.floor(Math.random() * 1296).toString(36);
}

/* ---------- the recipe shape ----------
   {
     id, schema, title, blurb, photo, source, servings, servingsNoun,
     prepMin, cookMin, tags[], notes, fav, rating, cooked, lastCooked,
     created, updated,
     ingredients: [{ id, raw, qty, unit, item, note, alt }],
     steps:       [{ id, text, inputs: [ingredientId|stepId, ...] }]
   }

   `inputs` is what makes the grid possible: a step names the ingredients and
   earlier step results it consumes, which turns a recipe into a tree rather
   than a flat list. grid.js enforces the one invariant the table layout
   needs, that nothing is consumed twice. */

function blankRecipe() {
  var now = new Date().toISOString();
  return {
    id: uid('r'), schema: SCHEMA, title: '', blurb: '', photo: '', source: '',
    servings: 4, servingsNoun: 'servings', prepMin: null, cookMin: null,
    tags: [], notes: '', fav: false, rating: 0, cooked: 0, lastCooked: null,
    created: now, updated: now, ingredients: [], steps: []
  };
}

/* Anything read from storage or from an import file goes through here, so a
   hand-edited or older file cannot put the app into an odd state. */
function normalise(r) {
  var out = blankRecipe();
  if (!r || typeof r !== 'object') return out;
  var keep = ['id', 'title', 'blurb', 'photo', 'source', 'servingsNoun', 'notes', 'created', 'updated'];
  keep.forEach(function (k) { if (typeof r[k] === 'string') out[k] = r[k]; });
  if (typeof r.servings === 'number' && r.servings > 0) out.servings = r.servings;
  if (typeof r.prepMin === 'number') out.prepMin = r.prepMin;
  if (typeof r.cookMin === 'number') out.cookMin = r.cookMin;
  if (typeof r.rating === 'number') out.rating = Math.max(0, Math.min(5, Math.round(r.rating)));
  if (typeof r.cooked === 'number') out.cooked = Math.max(0, r.cooked);
  if (typeof r.lastCooked === 'string') out.lastCooked = r.lastCooked;
  out.fav = !!r.fav;
  if (Array.isArray(r.tags)) {
    out.tags = r.tags.filter(function (t) { return typeof t === 'string' && t.trim(); })
                     .map(function (t) { return t.trim(); });
  }

  var seen = {};
  if (Array.isArray(r.ingredients)) {
    out.ingredients = r.ingredients.map(function (ing) {
      if (typeof ing === 'string') ing = RLUnits.parseIngredient(ing);
      var id = (typeof ing.id === 'string' && ing.id && !seen[ing.id]) ? ing.id : uid('i');
      seen[id] = 1;
      var base = RLUnits.parseIngredient(ing.raw || ing.item || '');
      return {
        id: id,
        raw: ing.raw || base.raw,
        qty: (typeof ing.qty === 'number' ? ing.qty : base.qty),
        unit: (typeof ing.unit === 'string' ? ing.unit : base.unit),
        item: (typeof ing.item === 'string' && ing.item ? ing.item : base.item),
        note: (typeof ing.note === 'string' ? ing.note : base.note),
        alt: (ing.alt && typeof ing.alt.qty === 'number' ? { qty: ing.alt.qty, unit: String(ing.alt.unit || '') } : base.alt)
      };
    });
  }
  if (Array.isArray(r.steps)) {
    out.steps = r.steps.map(function (st) {
      if (typeof st === 'string') st = { text: st };
      var id = (typeof st.id === 'string' && st.id && !seen[st.id]) ? st.id : uid('s');
      seen[id] = 1;
      return {
        id: id,
        text: String(st.text || ''),
        inputs: Array.isArray(st.inputs) ? st.inputs.filter(function (x) { return typeof x === 'string'; }) : []
      };
    });
    /* Drop references to things that are not in this recipe. */
    var known = {};
    out.ingredients.forEach(function (i) { known[i.id] = 1; });
    out.steps.forEach(function (s) { known[s.id] = 1; });
    out.steps.forEach(function (s) {
      s.inputs = s.inputs.filter(function (x) { return known[x] === 1 && x !== s.id; });
    });
  }
  out.schema = SCHEMA;
  return out;
}

/* ---------- the collection ---------- */

var recipes = null;

function all() {
  if (recipes === null) {
    var raw = loadJSON(K.recipes, []);
    recipes = (Array.isArray(raw) ? raw : []).map(normalise);
  }
  return recipes;
}

function persist() {
  var ok = saveJSON(K.recipes, all());
  if (global.RLApp && global.RLApp.onStorageChange) global.RLApp.onStorageChange(ok);
  return ok;
}

function get(id) {
  var list = all();
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

function put(recipe) {
  var r = normalise(recipe);
  r.updated = new Date().toISOString();
  var list = all(), i;
  for (i = 0; i < list.length; i++) {
    if (list[i].id === r.id) { r.created = list[i].created || r.created; list[i] = r; persist(); return r; }
  }
  list.push(r);
  persist();
  return r;
}

function remove(id) {
  var list = all(), i;
  for (i = 0; i < list.length; i++) {
    if (list[i].id === id) { list.splice(i, 1); break; }
  }
  /* A deleted recipe must not linger in the plan or on the list. */
  var plan = getPlan();
  Object.keys(plan.days || {}).forEach(function (d) {
    plan.days[d] = (plan.days[d] || []).filter(function (e) { return e.recipe !== id; });
  });
  setPlan(plan);
  var shop = getShop();
  shop.recipes = (shop.recipes || []).filter(function (e) { return e.recipe !== id; });
  setShop(shop);
  return persist();
}

function duplicate(id) {
  var src = get(id);
  if (!src) return null;
  var copy = JSON.parse(JSON.stringify(src));
  var map = {};
  copy.id = uid('r');
  copy.title = src.title + ' (copy)';
  copy.cooked = 0; copy.lastCooked = null;
  copy.ingredients.forEach(function (i) { var n = uid('i'); map[i.id] = n; i.id = n; });
  copy.steps.forEach(function (s) { var n = uid('s'); map[s.id] = n; s.id = n; });
  copy.steps.forEach(function (s) { s.inputs = s.inputs.map(function (x) { return map[x] || x; }); });
  copy.created = copy.updated = new Date().toISOString();
  return put(copy);
}

function allTags() {
  var counts = {};
  all().forEach(function (r) {
    r.tags.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
  });
  return Object.keys(counts).sort(function (a, b) {
    return counts[b] - counts[a] || a.localeCompare(b);
  }).map(function (t) { return { tag: t, count: counts[t] }; });
}

/* ---------- plan and shopping list ---------- */

function getPlan() {
  var p = loadJSON(K.plan, null);
  if (!p || typeof p !== 'object') p = { start: null, days: {} };
  if (!p.days || typeof p.days !== 'object') p.days = {};
  return p;
}
function setPlan(p) { return saveJSON(K.plan, p); }

/* { recipes: [{recipe, servings}], extras: [{id, text, done}], done: {key:1} } */
function getShop() {
  var s = loadJSON(K.shop, null);
  if (!s || typeof s !== 'object') s = {};
  if (!Array.isArray(s.recipes)) s.recipes = [];
  if (!Array.isArray(s.extras)) s.extras = [];
  if (!s.done || typeof s.done !== 'object') s.done = {};
  return s;
}
function setShop(s) { return saveJSON(K.shop, s); }

/* ---------- preferences ---------- */

var DEFAULT_PREFS = { view: 'grid', sort: 'updated', density: 'comfortable', demoLoaded: false };

function getPrefs() {
  var p = loadJSON(K.prefs, {});
  var out = {}, k;
  for (k in DEFAULT_PREFS) out[k] = (p && p[k] !== undefined) ? p[k] : DEFAULT_PREFS[k];
  return out;
}
function setPrefs(p) { return saveJSON(K.prefs, p); }
function setPref(key, val) { var p = getPrefs(); p[key] = val; return setPrefs(p); }

function getTheme() { return rawGet(K.theme) === 'light' ? 'light' : 'dark'; }
function setTheme(t) {
  document.documentElement.className = (t === 'light' ? 'light' : 'dark');
  return rawSet(K.theme, t === 'light' ? 'light' : 'dark');
}

/* ---------- export and import ---------- */

function exportData() {
  return {
    format: 'recipelist',
    schema: SCHEMA,
    exported: new Date().toISOString(),
    recipes: all(),
    plan: getPlan(),
    shop: getShop(),
    prefs: getPrefs()
  };
}

/* Merge, never replace. Same id keeps whichever side was updated later; a
   different id with an identical title and ingredient count is treated as
   the same recipe, so importing your own backup twice does not double it. */
function importData(data, opts) {
  opts = opts || {};
  if (!data || !Array.isArray(data.recipes)) throw new Error('That file has no recipes in it.');
  var list = all(), byId = {}, bySig = {}, added = 0, updated = 0, skipped = 0;

  function sig(r) {
    return (r.title || '').trim().toLowerCase() + '|' + r.ingredients.length + '|' + r.steps.length;
  }
  list.forEach(function (r) { byId[r.id] = r; bySig[sig(r)] = r; });

  data.recipes.map(normalise).forEach(function (inc) {
    var cur = byId[inc.id] || bySig[sig(inc)];
    if (!cur) { list.push(inc); byId[inc.id] = inc; bySig[sig(inc)] = inc; added++; return; }
    if (new Date(inc.updated) > new Date(cur.updated)) {
      inc.id = cur.id;                       /* keep the id the plan points at */
      inc.created = cur.created || inc.created;
      list[list.indexOf(cur)] = inc;
      byId[inc.id] = inc; bySig[sig(inc)] = inc;
      updated++;
    } else skipped++;
  });

  persist();
  if (opts.withPlan && data.plan) setPlan(data.plan);
  if (opts.withPlan && data.shop) setShop(data.shop);
  return { added: added, updated: updated, skipped: skipped };
}

function loadDemo(demoRecipes) {
  var res = importData({ recipes: demoRecipes }, {});
  setPref('demoLoaded', true);
  return res;
}

/* Removes only recipes that came from the sample set and were never edited,
   so a demo clear cannot take a recipe the user has since made their own. */
function clearDemo(demoRecipes) {
  var demoIds = {};
  demoRecipes.forEach(function (d) { demoIds[d.id] = d; });
  var list = all(), removed = 0, i;
  for (i = list.length - 1; i >= 0; i--) {
    var d = demoIds[list[i].id];
    if (d && list[i].updated === d.updated) { list.splice(i, 1); removed++; }
  }
  setPref('demoLoaded', false);
  persist();
  return removed;
}

global.RLStore = {
  KEYS: K, SCHEMA: SCHEMA, uid: uid,
  blankRecipe: blankRecipe, normalise: normalise,
  all: all, get: get, put: put, remove: remove, duplicate: duplicate,
  allTags: allTags, persist: persist,
  getPlan: getPlan, setPlan: setPlan, getShop: getShop, setShop: setShop,
  getPrefs: getPrefs, setPrefs: setPrefs, setPref: setPref,
  getTheme: getTheme, setTheme: setTheme,
  exportData: exportData, importData: importData,
  loadDemo: loadDemo, clearDemo: clearDemo,
  health: function () { return { ok: storageOK, error: lastError }; }
};
})(window);
