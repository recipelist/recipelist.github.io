/* app.js - the shell, the pages and everything that answers a click.
   ------------------------------------------------------------------
   Routing is the hash and nothing else, so every view is linkable and the
   back button always means what it looks like it means:

     #recipes                the library
     #r/<id>                 one recipe
     #edit/<id> | #new       the editor
     #kitchen | #kitchen/shop
     #settings
     #cook/<id>              cook mode, over the top of everything

   Rendering is innerHTML plus one delegated click handler per page, keyed on
   data-act. That keeps every page a pure function of the stored data: after
   any change the page is simply drawn again, so no two parts of the screen
   can drift out of step with each other. */
(function (global) {
'use strict';

var esc = RLGrid.esc;
var $ = function (sel, root) { return (root || document).querySelector(sel); };
var $$ = function (sel, root) {
  return Array.prototype.slice.call((root || document).querySelectorAll(sel));
};

var PAGES = { recipes: null, kitchen: null, settings: null, recipe: null, edit: null };
var main, cookEl, toastEl;

var state = {
  route: { name: 'recipes', arg: '' },
  q: '',
  tag: '',
  filter: 'all',
  sort: 'updated',
  view: 'grid',          /* per-recipe view, seeded from prefs */
  factor: 1,
  servings: null,
  kitchenTab: 'plan',
  weekOffset: 0,
  editor: null,          /* the working copy while editing */
  dirty: false,
  gridFull: false
};

function isPhone() { return window.matchMedia('(max-width: 700px)').matches; }

/* ---------------- toast ---------------- */

var toastTimer = null;
function toast(msg, kind) {
  toastEl.textContent = msg;
  toastEl.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toastEl.className = 'toast'; }, 3200);
}

/* ---------------- routing ---------------- */

function parseHash() {
  var h = (location.hash || '').replace(/^#/, '');
  if (!h) return { name: 'recipes', arg: '' };
  var parts = h.split('/');
  var name = parts[0], arg = parts.slice(1).join('/');
  if (name === 'r' || name === 'edit' || name === 'cook') return { name: name, arg: arg };
  if (name === 'kitchen') return { name: 'kitchen', arg: arg || 'plan' };
  if (name === 'new' || name === 'settings' || name === 'recipes') return { name: name, arg: arg };
  return { name: 'recipes', arg: '' };
}

function go(hash) {
  if (('#' + hash) === location.hash) route();
  else location.hash = hash;
}

function route() {
  var next = parseHash();

  /* Leaving the editor with unsaved work is the one navigation worth
     interrupting; everything else is cheap to undo. */
  if (state.dirty && next.name !== 'edit' && next.name !== 'new') {
    if (!confirm('You have unsaved changes to this recipe. Leave without saving?')) {
      history.back();
      return;
    }
    state.dirty = false;
    state.editor = null;
  }

  state.route = next;

  /* Both of these cover the whole screen and neither is a route of its own,
     so navigating has to take them down. Without this the full-screen grid
     survived a back gesture and sat over the next page with the body still
     scroll-locked, which reads as the app having frozen. */
  closeGridFull();
  if (next.name === 'cook') { openCook(next.arg); return; }
  closeCook();

  var page = next.name;
  if (page === 'r') page = 'recipe';
  if (page === 'new') page = 'edit';

  Object.keys(PAGES).forEach(function (k) { PAGES[k].hidden = (k !== page); });

  var tabFor = { recipes: 'recipes', recipe: 'recipes', edit: 'recipes', kitchen: 'kitchen', settings: 'settings' };
  $$('.tabs button[data-tab]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabFor[page]);
  });

  if (page === 'recipes') renderRecipes();
  else if (page === 'recipe') renderRecipe(next.arg);
  else if (page === 'edit') renderEditor(next.name === 'new' ? null : next.arg);
  else if (page === 'kitchen') { state.kitchenTab = (next.arg === 'shop' ? 'shop' : 'plan'); renderKitchen(); }
  else if (page === 'settings') renderSettings();

  main.scrollTop = 0;
  window.scrollTo(0, 0);
  updateCounts();
}

/* ---------------- library ---------------- */

function matches(r, q) {
  if (!q) return true;
  var hay = [r.title, r.blurb, r.notes, r.tags.join(' ')];
  r.ingredients.forEach(function (i) { hay.push(i.item, i.raw); });
  r.steps.forEach(function (s) { hay.push(s.text); });
  var text = hay.join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every(function (tok) { return text.indexOf(tok) !== -1; });
}

function totalMinutes(r) { return (r.prepMin || 0) + (r.cookMin || 0); }

function sortList(list) {
  var s = state.sort;
  return list.slice().sort(function (a, b) {
    if (s === 'title') return a.title.localeCompare(b.title);
    if (s === 'time') return (totalMinutes(a) || 1e9) - (totalMinutes(b) || 1e9);
    if (s === 'rating') return (b.rating - a.rating) || a.title.localeCompare(b.title);
    if (s === 'cooked') return (b.cooked - a.cooked) || a.title.localeCompare(b.title);
    return new Date(b.updated) - new Date(a.updated);
  });
}

function visibleRecipes() {
  var list = RLStore.all().filter(function (r) { return matches(r, state.q); });
  if (state.tag) list = list.filter(function (r) { return r.tags.indexOf(state.tag) !== -1; });
  if (state.filter === 'fav') list = list.filter(function (r) { return r.fav; });
  if (state.filter === 'quick') list = list.filter(function (r) { var t = totalMinutes(r); return t && t <= 30; });
  if (state.filter === 'untried') list = list.filter(function (r) { return !r.cooked; });
  return sortList(list);
}

function timeLabel(mins) {
  if (!mins) return '';
  if (mins < 60) return mins + ' min';
  var h = Math.floor(mins / 60), m = mins % 60;
  return h + ' hr' + (m ? ' ' + m + ' min' : '');
}

function cardHTML(r) {
  var t = totalMinutes(r);
  var mark = r.photo
    ? '<span class="card-photo" style="background-image:url(' + esc(r.photo).replace(/[()]/g, '') + ')"></span>'
    : '<span class="card-mark" aria-hidden="true">' + esc((r.title || '?').trim().charAt(0).toUpperCase()) + '</span>';
  return '<article class="card" data-act="open" data-id="' + esc(r.id) + '" tabindex="0" role="button">' +
    mark +
    '<div class="card-body">' +
      '<h3 class="card-title">' + esc(r.title || 'Untitled') + '</h3>' +
      (r.blurb ? '<p class="card-blurb">' + esc(r.blurb) + '</p>' : '') +
      '<div class="card-meta">' +
        (t ? '<span class="meta-bit">' + esc(timeLabel(t)) + '</span>' : '') +
        '<span class="meta-bit">' + esc(r.servings + ' ' + r.servingsNoun) + '</span>' +
        (r.cooked ? '<span class="meta-bit">cooked ' + r.cooked + 'x</span>' : '') +
      '</div>' +
      (r.tags.length ? '<div class="card-tags">' + r.tags.slice(0, 4).map(function (tg) {
        return '<span class="tag">' + esc(tg) + '</span>';
      }).join('') + '</div>' : '') +
    '</div>' +
    '<button class="card-fav' + (r.fav ? ' on' : '') + '" data-act="fav" data-id="' + esc(r.id) +
      '" title="' + (r.fav ? 'Remove from favourites' : 'Add to favourites') + '" aria-label="Favourite">' +
      '<svg viewBox="0 0 24 24"><path d="M12 4.6l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L4.5 10l5.2-.8z"/></svg></button>' +
  '</article>';
}

function renderRecipes() {
  var list = visibleRecipes();
  var all = RLStore.all();
  var tags = RLStore.allTags();

  var html = '<header class="page-head">' +
    '<h1>Recipes</h1>' +
    '<div class="head-actions">' +
      '<button class="btn" data-act="paste"><svg viewBox="0 0 24 24" class="ic"><path d="M12 4v11"/><path d="M8 11l4 4 4-4"/><path d="M5 19h14"/></svg> Paste in</button>' +
      '<button class="btn accent" data-act="new"><svg viewBox="0 0 24 24" class="ic"><path d="M12 5v14M5 12h14"/></svg> New recipe</button>' +
    '</div>' +
  '</header>' +

  '<div class="toolbar">' +
    '<label class="search"><svg viewBox="0 0 24 24" class="ic"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>' +
      '<input type="search" id="q" placeholder="Search titles, ingredients, steps" value="' + esc(state.q) + '" autocomplete="off">' +
      (state.q ? '<button class="search-clear" data-act="clearq" aria-label="Clear search">&times;</button>' : '') +
    '</label>' +
    '<select id="sort" class="sel" aria-label="Sort by">' +
      opt('updated', 'Recently updated') + opt('title', 'A to Z') + opt('time', 'Quickest first') +
      opt('rating', 'Best rated') + opt('cooked', 'Most cooked') +
    '</select>' +
  '</div>' +

  '<div class="chips">' +
    chip('all', 'All ' + all.length, state.filter === 'all') +
    chip('fav', 'Favourites', state.filter === 'fav') +
    chip('quick', 'Under 30 min', state.filter === 'quick') +
    chip('untried', 'Not cooked yet', state.filter === 'untried') +
  '</div>' +

  (tags.length ? '<div class="chips tags-row">' +
    '<button class="chip tag-chip' + (state.tag ? '' : ' on') + '" data-act="tag" data-tag="">Every tag</button>' +
    tags.map(function (t) {
      return '<button class="chip tag-chip' + (state.tag === t.tag ? ' on' : '') + '" data-act="tag" data-tag="' +
        esc(t.tag) + '">' + esc(t.tag) + ' <span class="chip-n">' + t.count + '</span></button>';
    }).join('') + '</div>' : '');

  if (!all.length) {
    html += emptyState(
      'Nothing here yet',
      'Add a recipe by hand, or paste one in from anywhere and let it be pulled apart into ingredients and steps.',
      '<button class="btn accent" data-act="new">New recipe</button>' +
      '<button class="btn" data-act="paste">Paste one in</button>' +
      '<button class="btn ghost" data-act="demo">Load sample recipes</button>');
  } else if (!list.length) {
    html += emptyState('No matches', 'Nothing here answers to that. Try fewer words, or clear the filters.',
      '<button class="btn" data-act="reset">Clear filters</button>');
  } else {
    html += '<div class="cards">' + list.map(cardHTML).join('') + '</div>';
    html += '<p class="result-note">' + list.length + ' of ' + all.length + ' recipes</p>';
  }

  PAGES.recipes.innerHTML = html;
  var sortSel = $('#sort', PAGES.recipes);
  if (sortSel) {
    sortSel.value = state.sort;
    sortSel.onchange = function () { state.sort = this.value; renderRecipes(); };
  }
  var qEl = $('#q', PAGES.recipes);
  if (qEl) {
    qEl.oninput = debounce(function () {
      state.q = qEl.value;
      var at = qEl.selectionStart;
      renderRecipes();
      var again = $('#q', PAGES.recipes);
      if (again) { again.focus(); try { again.setSelectionRange(at, at); } catch (e) {} }
    }, 160);
  }

  function opt(v, label) { return '<option value="' + v + '">' + label + '</option>'; }
  function chip(v, label, on) {
    return '<button class="chip' + (on ? ' on' : '') + '" data-act="filter" data-filter="' + v + '">' + label + '</button>';
  }
}

function emptyState(title, body, actions) {
  return '<div class="empty"><div class="empty-mark"><svg viewBox="0 0 24 24">' +
    '<path d="M5 8h14v9a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M5 12H3M19 12h2"/><path d="M12 5c2-1.4 2-2.8 0-4.2"/>' +
    '</svg></div><h2>' + esc(title) + '</h2><p>' + esc(body) + '</p><div class="empty-actions">' + actions + '</div></div>';
}

/* ---------------- one recipe ---------------- */

/* The scale currently in force, which belongs to one recipe and must not be
   inherited by the next. Cook mode used to read `state.servings` directly,
   so opening a recipe, scaling it, then jumping straight to #cook/<other>
   cooked the second recipe at the first one's servings: a 6-serving chili
   read out at 2 because the oats before it had been scaled to 2. Every
   reader goes through here now, and the scale resets whenever the recipe
   under it changes. */
function servingsFor(r) {
  if (state.lastId !== r.id || state.servings == null) {
    state.lastId = r.id;
    state.servings = r.servings;
  }
  return state.servings;
}

function renderRecipe(id) {
  var r = RLStore.get(id);
  if (!r) {
    PAGES.recipe.innerHTML = emptyState('Not found', 'That recipe is not in this browser.',
      '<button class="btn" data-act="back">Back to recipes</button>');
    return;
  }
  state.servings = servingsFor(r);
  state.factor = r.servings ? (state.servings / r.servings) : 1;

  var prefView = RLStore.getPrefs().view;
  var view = isPhone() ? 'list' : (state.view || prefView);
  var t = totalMinutes(r);
  var tree = RLGrid.buildTree(r);

  var html = '<div class="crumb"><button class="linky" data-act="back">' +
    '<svg viewBox="0 0 24 24" class="ic"><path d="M15 5l-7 7 7 7"/></svg> Recipes</button></div>' +

  '<header class="recipe-head">' +
    (r.photo ? '<div class="recipe-photo"><img src="' + esc(r.photo) + '" alt="" loading="lazy" onerror="this.parentNode.style.display=\'none\'"></div>' : '') +
    '<div class="rh-text">' +
      '<h1>' + esc(r.title) + '</h1>' +
      (r.blurb ? '<p class="rh-blurb">' + esc(r.blurb) + '</p>' : '') +
      '<div class="rh-meta">' +
        (r.prepMin ? '<span class="meta-bit">' + esc(timeLabel(r.prepMin)) + ' prep</span>' : '') +
        (r.cookMin ? '<span class="meta-bit">' + esc(timeLabel(r.cookMin)) + ' cooking</span>' : '') +
        (t ? '<span class="meta-bit strong">' + esc(timeLabel(t)) + ' in all</span>' : '') +
        (r.cooked ? '<span class="meta-bit">cooked ' + r.cooked + ' time' + (r.cooked > 1 ? 's' : '') + '</span>' : '') +
      '</div>' +
      '<div class="stars" data-act="rate-row">' + [1, 2, 3, 4, 5].map(function (n) {
        return '<button class="star' + (r.rating >= n ? ' on' : '') + '" data-act="rate" data-n="' + n +
          '" aria-label="Rate ' + n + '"><svg viewBox="0 0 24 24"><path d="M12 4.6l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L4.5 10l5.2-.8z"/></svg></button>';
      }).join('') + (r.rating ? '<button class="linky tiny" data-act="rate" data-n="0">clear</button>' : '') + '</div>' +
      (r.tags.length ? '<div class="card-tags">' + r.tags.map(function (tg) {
        return '<button class="tag" data-act="tagjump" data-tag="' + esc(tg) + '">' + esc(tg) + '</button>';
      }).join('') + '</div>' : '') +
    '</div>' +
  '</header>' +

  '<div class="actionbar">' +
    '<button class="btn accent" data-act="cook"><svg viewBox="0 0 24 24" class="ic"><path d="M6 10a6 6 0 0 1 12 0"/><path d="M4 10h16"/><path d="M6 14h12l-1 5H7z"/></svg> Cook</button>' +
    '<button class="btn" data-act="tolist"><svg viewBox="0 0 24 24" class="ic"><path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg> Add to list</button>' +
    '<button class="btn" data-act="toplan"><svg viewBox="0 0 24 24" class="ic"><path d="M4 6h16v14H4z"/><path d="M4 10h16"/><path d="M9 3v4M15 3v4"/></svg> Plan</button>' +
    '<button class="btn" data-act="edit"><svg viewBox="0 0 24 24" class="ic"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg> Edit</button>' +
    '<button class="btn icon-only" data-act="fav" data-id="' + esc(r.id) + '" title="Favourite" aria-label="Favourite">' +
      '<svg viewBox="0 0 24 24" class="ic' + (r.fav ? ' filled' : '') + '"><path d="M12 4.6l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L4.5 10l5.2-.8z"/></svg></button>' +
    '<div class="menu-wrap"><button class="btn icon-only" data-act="menu" title="More" aria-label="More">' +
      '<svg viewBox="0 0 24 24" class="ic"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>' +
      '<div class="menu" id="rmenu" hidden>' +
        '<button data-act="copytext">Copy as text</button>' +
        '<button data-act="dup">Duplicate</button>' +
        '<button data-act="print">Print</button>' +
        '<button data-act="del" class="danger">Delete</button>' +
      '</div></div>' +
  '</div>' +

  '<div class="viewbar">' +
    '<div class="scaler">' +
      '<button class="step-btn" data-act="serv-" aria-label="Fewer servings">&minus;</button>' +
      '<span class="serv"><strong>' + esc(fmtServings(state.servings)) + '</strong> ' + esc(r.servingsNoun) + '</span>' +
      '<button class="step-btn" data-act="serv+" aria-label="More servings">+</button>' +
      (Math.abs(state.factor - 1) > 0.001 ? '<button class="linky tiny" data-act="serv0">reset</button>' : '') +
    '</div>' +
    '<div class="seg">' +
      '<button class="' + (view === 'grid' ? 'on' : '') + '" data-act="view" data-view="grid">Grid</button>' +
      '<button class="' + (view === 'list' ? 'on' : '') + '" data-act="view" data-view="list">List</button>' +
    '</div>' +
  '</div>';

  if (view === 'grid') {
    html += '<div class="gridnote-wrap">' + gridNote(tree) + '</div>';
    html += RLGrid.renderGrid(r, state.factor, { timers: true });
  } else {
    html += RLGrid.renderList(r, state.factor, { timers: true });
    if (!isPhone()) html += '';
  }

  if (r.notes) html += '<section class="notes"><h3>Notes</h3><p>' + esc(r.notes).replace(/\n/g, '<br>') + '</p></section>';
  if (r.source) {
    var isUrl = /^https?:\/\//i.test(r.source);
    html += '<section class="notes"><h3>Source</h3><p>' +
      (isUrl ? '<a href="' + esc(r.source) + '" rel="noreferrer noopener" target="_blank">' + esc(r.source) + '</a>' : esc(r.source)) +
      '</p></section>';
  }

  PAGES.recipe.innerHTML = html;
}

function fmtServings(n) {
  return RLUnits.formatQty(n, '');
}

function gridNote(tree) {
  if (!tree.cells.length) return '';
  if (tree.unassigned === 0) return '';
  return '<p class="gridnote">' + tree.unassigned + ' step' + (tree.unassigned > 1 ? 's are' : ' is') +
    ' not yet linked to what it uses, so the grid draws them plainly. ' +
    '<button class="linky" data-act="edit">Link them up</button></p>';
}

/* ---------------- the editor ---------------- */

function renderEditor(id) {
  var r;
  if (state.editor && state.editor.id === (id || state.editor.id) && state.dirty) {
    r = state.editor;
  } else {
    r = id ? JSON.parse(JSON.stringify(RLStore.get(id) || RLStore.blankRecipe())) : RLStore.blankRecipe();
    state.editor = r;
    state.dirty = false;
  }
  state.editor = r;

  var known = RLStore.allTags().map(function (t) { return t.tag; });

  var html = '<div class="crumb"><button class="linky" data-act="cancel">' +
    '<svg viewBox="0 0 24 24" class="ic"><path d="M15 5l-7 7 7 7"/></svg> Cancel</button></div>' +
  '<header class="page-head"><h1>' + (id ? 'Edit recipe' : 'New recipe') + '</h1>' +
    '<div class="head-actions">' +
      '<button class="btn" data-act="paste">Paste in</button>' +
      '<button class="btn accent" data-act="save">Save</button>' +
    '</div></header>' +

  '<div class="form">' +
    '<div class="form-main">' +
    field('Title', '<input id="f-title" type="text" value="' + esc(r.title) + '" placeholder="What is it called?">') +
    field('One line about it', '<input id="f-blurb" type="text" value="' + esc(r.blurb) + '" placeholder="Optional">') +
    '<div class="form-row">' +
      field('Serves', '<input id="f-serv" type="number" min="0.25" step="0.25" value="' + esc(r.servings) + '">', 'sm') +
      field('Unit', '<input id="f-servnoun" type="text" value="' + esc(r.servingsNoun) + '">', 'sm') +
      field('Prep (min)', '<input id="f-prep" type="number" min="0" value="' + (r.prepMin == null ? '' : r.prepMin) + '">', 'sm') +
      field('Cooking (min)', '<input id="f-cook" type="number" min="0" value="' + (r.cookMin == null ? '' : r.cookMin) + '">', 'sm') +
    '</div>' +
    field('Tags', '<input id="f-tags" type="text" list="taglist" value="' + esc(r.tags.join(', ')) +
      '" placeholder="dinner, quick, vegetarian"><datalist id="taglist">' +
      known.map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>',
      '', 'Separated by commas.') +

    field('Ingredients', '<textarea id="f-ings" rows="9" placeholder="One per line, as you would write them:&#10;1 cup (225 g) butter, softened&#10;2 large eggs">' +
      esc((r.ingredients || []).map(function (i) { return i.raw; }).join('\n')) + '</textarea>', '',
      'One per line. Quantities are read off the front so the scaler and the shopping list can do their work; anything unreadable is kept exactly as typed.') +

    '</div>' +

    '<div class="form-steps">' +
    '<div class="field"><label class="lbl">Steps</label>' +
      '<div class="steps-editor" id="steps-editor">' + stepsEditorHTML(r) + '</div>' +
      '<button class="btn small" data-act="addstep">Add a step</button>' +
      '<p class="hint">Tick what each step uses and the grid draws itself. A step can take ingredients, the result of an earlier step, or both. Nothing can be used twice.</p>' +
    '</div>' +
    '</div>' +

    '<div class="form-more">' +
    field('Photo URL', '<input id="f-photo" type="url" value="' + esc(r.photo) + '" placeholder="https://...">', '',
      'Optional, and only ever linked, never copied into this browser.') +
    field('Source', '<input id="f-source" type="text" value="' + esc(r.source) + '" placeholder="A book, a person, a link">') +
    field('Notes', '<textarea id="f-notes" rows="3" placeholder="Oven temperature, what to serve it with, what went wrong last time">' + esc(r.notes) + '</textarea>') +

    '</div>' +

    '<div class="form-foot">' +
      '<button class="btn accent" data-act="save">Save recipe</button>' +
      '<button class="btn" data-act="cancel">Cancel</button>' +
      (id ? '<button class="btn ghost danger" data-act="del">Delete</button>' : '') +
    '</div>' +
  '</div>';

  PAGES.edit.innerHTML = html;
  bindEditorInputs();

  function field(label, control, cls, hint) {
    return '<div class="field ' + (cls || '') + '"><label class="lbl">' + esc(label) + '</label>' + control +
      (hint ? '<p class="hint">' + esc(hint) + '</p>' : '') + '</div>';
  }
}

/* Each step shows what it uses as a summary, and opens a picker on demand.
   The picker lists every ingredient and every other step; whatever is
   already spoken for is shown with its claimant, and choosing it moves it,
   because the grid can only be drawn if nothing is consumed twice. */
function stepsEditorHTML(r) {
  if (!r.steps.length) return '<p class="hint">No steps yet.</p>';
  var claim = {};
  r.steps.forEach(function (s) {
    (s.inputs || []).forEach(function (x) { if (!claim[x]) claim[x] = s.id; });
  });
  var labelOf = {};
  r.ingredients.forEach(function (i) { labelOf[i.id] = i.item || i.raw; });
  r.steps.forEach(function (s, n) { labelOf[s.id] = 'step ' + (n + 1) + (s.text ? ': ' + s.text.slice(0, 24) : ''); });

  return r.steps.map(function (s, n) {
    var uses = (s.inputs || []).map(function (x) { return labelOf[x] || '?'; });
    var open = (state.pickerFor === s.id);
    return '<div class="step-row" data-step="' + esc(s.id) + '">' +
      '<div class="step-line">' +
        '<span class="step-n">' + (n + 1) + '</span>' +
        '<input class="step-text" type="text" data-step="' + esc(s.id) + '" value="' + esc(s.text) +
          '" placeholder="cream / fold in / bake 40 minutes">' +
        '<button class="step-btn" data-act="stepup" data-step="' + esc(s.id) + '" title="Move up" aria-label="Move up">&uarr;</button>' +
        '<button class="step-btn" data-act="stepdown" data-step="' + esc(s.id) + '" title="Move down" aria-label="Move down">&darr;</button>' +
        '<button class="step-btn danger" data-act="stepdel" data-step="' + esc(s.id) + '" title="Remove" aria-label="Remove">&times;</button>' +
      '</div>' +
      '<div class="step-uses">' +
        '<button class="linky" data-act="pick" data-step="' + esc(s.id) + '">' +
          (open ? 'Done choosing' : 'Uses') + '</button> ' +
        '<span class="uses-text">' + (uses.length ? esc(uses.join(', ')) : '<em>nothing chosen yet</em>') + '</span>' +
      '</div>' +
      (open ? '<div class="picker">' + pickerHTML(r, s, claim, labelOf) + '</div>' : '') +
    '</div>';
  }).join('');
}

function pickerHTML(r, step, claim, labelOf) {
  var out = '<div class="picker-group"><span class="picker-label">Ingredients</span>';
  out += r.ingredients.map(function (i) {
    return pickChip(i.id, labelOf[i.id]);
  }).join('') || '<span class="hint">Add ingredients first.</span>';
  out += '</div>';
  var others = r.steps.filter(function (s) { return s.id !== step.id; });
  if (others.length) {
    out += '<div class="picker-group"><span class="picker-label">Results of</span>' +
      others.map(function (s) { return pickChip(s.id, labelOf[s.id]); }).join('') + '</div>';
  }
  return out;

  function pickChip(id, label) {
    var mine = (step.inputs || []).indexOf(id) !== -1;
    var takenBy = claim[id];
    var taken = takenBy && takenBy !== step.id;
    return '<button class="pick' + (mine ? ' on' : '') + (taken ? ' taken' : '') + '" data-act="pickone" data-step="' +
      esc(step.id) + '" data-target="' + esc(id) + '"' + (taken ? ' title="Used by ' + esc(labelOf[takenBy] || 'another step') + '; choosing it moves it here"' : '') +
      '>' + esc(label) + (taken ? ' <span class="pick-taken">taken</span>' : '') + '</button>';
  }
}

function bindEditorInputs() {
  var root = PAGES.edit;
  function on(sel, prop, fn) {
    var el = $(sel, root);
    if (el) el.addEventListener(prop, fn);
  }
  var r = state.editor;
  function mark() { state.dirty = true; }

  on('#f-title', 'input', function () { r.title = this.value; mark(); });
  on('#f-blurb', 'input', function () { r.blurb = this.value; mark(); });
  on('#f-serv', 'input', function () { r.servings = Number(this.value) || 1; mark(); });
  on('#f-servnoun', 'input', function () { r.servingsNoun = this.value; mark(); });
  on('#f-prep', 'input', function () { r.prepMin = this.value === '' ? null : Number(this.value); mark(); });
  on('#f-cook', 'input', function () { r.cookMin = this.value === '' ? null : Number(this.value); mark(); });
  on('#f-photo', 'input', function () { r.photo = this.value.trim(); mark(); });
  on('#f-source', 'input', function () { r.source = this.value; mark(); });
  on('#f-notes', 'input', function () { r.notes = this.value; mark(); });
  on('#f-tags', 'input', function () {
    r.tags = this.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    mark();
  });

  /* Ingredients are edited as text and re-parsed on blur, not on every
     keystroke: re-parsing mid-word would keep pulling the step links out
     from under whatever is already ticked. Ids are kept for lines whose
     text has not changed, so ticking survives an edit elsewhere. */
  on('#f-ings', 'blur', function () {
    var lines = this.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    /* A queue per line of text, not one entry per line of text. Two identical
       lines are two ingredients with two ids, and the second has to find its
       own id here: matching both to the first one left the second rebuilt as
       a stranger on every blur, and every step pointing at it quietly let go.
       The '#' keeps a line reading "constructor" off Object.prototype. */
    var oldByRaw = {};
    r.ingredients.forEach(function (i) {
      var k = '#' + i.raw;
      if (!oldByRaw[k]) oldByRaw[k] = [];
      oldByRaw[k].push(i);
    });
    r.ingredients = lines.map(function (l) {
      var q = oldByRaw['#' + l];
      if (q && q.length) return q.shift();
      var p = RLUnits.parseIngredient(l);
      p.id = RLStore.uid('i');
      return p;
    });
    var live = {};
    r.ingredients.forEach(function (i) { live[i.id] = 1; });
    r.steps.forEach(function (s) { live[s.id] = 1; });
    r.steps.forEach(function (s) {
      s.inputs = (s.inputs || []).filter(function (x) { return live[x]; });
    });
    state.dirty = true;
    redrawSteps();
  });

  $$('.step-text', root).forEach(function (inp) {
    inp.addEventListener('input', function () {
      var id = this.getAttribute('data-step');
      r.steps.forEach(function (s) { if (s.id === id) s.text = inp.value; });
      state.dirty = true;
    });
  });
}

function redrawSteps() {
  var host = $('#steps-editor', PAGES.edit);
  if (!host) return;
  host.innerHTML = stepsEditorHTML(state.editor);
  $$('.step-text', host).forEach(function (inp) {
    inp.addEventListener('input', function () {
      var id = this.getAttribute('data-step');
      state.editor.steps.forEach(function (s) { if (s.id === id) s.text = inp.value; });
      state.dirty = true;
    });
  });
}

function commitIngredientsField() {
  var el = $('#f-ings', PAGES.edit);
  if (el) el.dispatchEvent(new Event('blur'));
}

function saveEditor() {
  commitIngredientsField();
  var r = state.editor;
  if (!r.title.trim()) { toast('Give it a title first.', 'bad'); var f = $('#f-title', PAGES.edit); if (f) f.focus(); return; }
  r.steps = r.steps.filter(function (s) { return s.text.trim() || (s.inputs || []).length; });
  var saved = RLStore.put(r);
  state.dirty = false;
  state.editor = null;
  toast('Saved.');
  go('r/' + saved.id);
}

/* ---------------- paste-in ---------------- */

function openPaste() {
  var wrap = document.createElement('div');
  wrap.className = 'modal-scrim';
  wrap.innerHTML = '<div class="modal" role="dialog" aria-label="Paste a recipe">' +
    '<h2>Paste a recipe in</h2>' +
    '<p class="hint">Anything goes: a whole recipe page copied off the web, that page\'s source, ' +
    'your own notes, or a page\'s JSON-LD. A page is read the way a scraper reads one, structured ' +
    'data first, and the site\'s own furniture is left behind. It is pulled apart into ingredients ' +
    'and steps, and each step is given a first guess at what it uses. ' +
    'Nothing is saved until you look it over.</p>' +
    '<p class="hint">A link on its own cannot be read: a browser will not let this page fetch ' +
    'another site. Open the page, select all, copy, and paste that here instead.</p>' +
    '<textarea id="paste-box" rows="12" placeholder="Chocolate chip cookies&#10;Serves 24&#10;&#10;Ingredients&#10;2 cups flour&#10;1 tsp salt&#10;&#10;Method&#10;Whisk the dry ingredients together.&#10;Bake 12 minutes."></textarea>' +
    '<div class="modal-foot">' +
      '<button class="btn accent" data-act="do-paste">Pull it apart</button>' +
      '<button class="btn" data-act="close-modal">Cancel</button>' +
    '</div></div>';
  document.body.appendChild(wrap);
  var box = $('#paste-box', wrap);
  box.focus();
  wrap.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (e.target === wrap) { wrap.remove(); return; }
    if (!b) return;
    if (b.getAttribute('data-act') === 'close-modal') { wrap.remove(); return; }
    if (b.getAttribute('data-act') === 'do-paste') {
      var text = box.value.trim();
      if (!text) { toast('Nothing to read there.', 'bad'); return; }
      /* A bare link is the one thing people will certainly try and the one
         thing that cannot work, so say why rather than shrugging and making
         a recipe called "https". */
      if (/^https?:\/\/\S+$/i.test(text)) {
        toast('That is a link, and this page is not allowed to fetch another site. Open it, select all, copy, then paste that.', 'bad');
        return;
      }
      /* A paste always lands in a *new* recipe, so doing this from inside the
         editor throws away whatever is unsaved there. Everywhere else that
         loses work asks first; this used to be the one place that did not. */
      if (state.dirty && !confirm('This makes a new recipe from what you paste. Your unsaved changes to the one you are editing will be lost. Carry on?')) return;
      var parsed;
      try { parsed = RLParse.parseAny(text); }
      catch (err) { toast('That could not be read: ' + err.message, 'bad'); return; }
      wrap.remove();
      state.editor = parsed;
      state.dirty = true;
      go('new');
      renderEditor(null);
      toast(parsed.ingredients.length + ' ingredients and ' + parsed.steps.length +
            ' steps found. Check the links before saving.');
    }
  });
}

/* ---------------- kitchen: plan and shopping list ---------------- */

function dayKey(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function pad(n) { return (n < 10 ? '0' : '') + n; }

function weekStart(offset) {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  var day = (d.getDay() + 6) % 7;             /* Monday = 0 */
  d.setDate(d.getDate() - day + (offset || 0) * 7);
  return d;
}

var DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function renderKitchen() {
  var html = '<header class="page-head"><h1>Kitchen</h1></header>' +
    '<div class="seg seg-wide">' +
      '<button class="' + (state.kitchenTab === 'plan' ? 'on' : '') + '" data-act="ktab" data-k="plan">Plan</button>' +
      '<button class="' + (state.kitchenTab === 'shop' ? 'on' : '') + '" data-act="ktab" data-k="shop">Shopping list</button>' +
    '</div>';
  html += (state.kitchenTab === 'plan' ? planHTML() : shopHTML());
  PAGES.kitchen.innerHTML = html;
}

function planHTML() {
  var plan = RLStore.getPlan(), start = weekStart(state.weekOffset), today = dayKey(new Date());
  var end = new Date(start); end.setDate(end.getDate() + 6);
  var html = '<div class="week-nav">' +
    '<button class="btn small" data-act="week" data-d="-1">&larr;</button>' +
    '<span class="week-label">' + MONTHS[start.getMonth()] + ' ' + start.getDate() + ' to ' +
      MONTHS[end.getMonth()] + ' ' + end.getDate() + (state.weekOffset === 0 ? ' <span class="pill">this week</span>' : '') + '</span>' +
    '<button class="btn small" data-act="week" data-d="1">&rarr;</button>' +
    (state.weekOffset !== 0 ? '<button class="linky tiny" data-act="week" data-d="0">today</button>' : '') +
  '</div><div class="week">';

  var any = false;
  for (var i = 0; i < 7; i++) {
    var d = new Date(start); d.setDate(d.getDate() + i);
    var k = dayKey(d), entries = plan.days[k] || [];
    if (entries.length) any = true;
    html += '<div class="day' + (k === today ? ' today' : '') + '">' +
      '<div class="day-head"><span class="day-name">' + DAY_NAMES[i] + '</span>' +
        '<span class="day-date">' + MONTHS[d.getMonth()] + ' ' + d.getDate() + '</span>' +
        '<button class="step-btn" data-act="planadd" data-day="' + k + '" title="Add a recipe" aria-label="Add a recipe">+</button></div>' +
      '<div class="day-body">' +
        (entries.length ? entries.map(function (e) {
          var r = RLStore.get(e.recipe);
          if (!r) return '';
          return '<div class="plan-item"><button class="linky" data-act="open" data-id="' + esc(r.id) + '">' +
            esc(r.title) + '</button><span class="plan-serv">' + esc(fmtServings(e.servings)) + '</span>' +
            '<button class="step-btn danger" data-act="planrm" data-day="' + k + '" data-id="' + esc(r.id) +
            '" aria-label="Remove">&times;</button></div>';
        }).join('') : '<p class="day-empty">nothing planned</p>') +
      '</div></div>';
  }
  html += '</div>';
  html += '<div class="plan-foot">' +
    '<button class="btn accent" data-act="week2list"' + (any ? '' : ' disabled') + '>Send this week to the shopping list</button>' +
    (any ? '<button class="btn ghost" data-act="weekclear">Clear the week</button>' : '') +
  '</div>';
  if (!RLStore.all().length) html += '<p class="hint">Add a recipe or two first and they will show up here to plan with.</p>';
  return html;
}

/* The merge is the whole value of the list, so it is deliberately cautious:
   two lines join only when their names normalise identically and their units
   reduce to the same base. Everything else is listed separately, which is
   noisier but never wrong. */
function buildShopping() {
  var shop = RLStore.getShop(), buckets = {}, order = [];

  (shop.recipes || []).forEach(function (entry) {
    var r = RLStore.get(entry.recipe);
    if (!r) return;
    var factor = r.servings ? (entry.servings / r.servings) : 1;
    r.ingredients.forEach(function (ing) {
      var key, line;
      if (ing.qty == null) {
        key = 'raw|' + ing.raw.toLowerCase();
        line = { key: key, text: ing.raw, qty: null, unit: '', item: ing.item, from: [] };
      } else {
        var base = RLUnits.toBase(ing.qty * factor, ing.unit);
        key = RLUnits.normItem(ing.item) + '|' + base.unit;
        line = { key: key, qty: base.qty, unit: base.unit, item: ing.item, from: [] };
      }
      if (!buckets[key]) { buckets[key] = line; order.push(key); }
      else if (buckets[key].qty != null) buckets[key].qty += line.qty;
      if (buckets[key].from.indexOf(r.title) === -1) buckets[key].from.push(r.title);
    });
  });

  var items = order.map(function (k) {
    var b = buckets[k];
    var text;
    if (b.qty == null) text = b.text;
    else {
      var q = b.qty, u = b.unit;
      if (u === 'g' && q >= 1000) { q = q / 1000; u = 'kg'; }
      if (u === 'ml' && q >= 1000) { q = q / 1000; u = 'l'; }
      if (u === 'tsp' && q >= 3) { q = q / 3; u = 'tbsp'; }
      text = (RLUnits.formatQty(q, u) + ' ' + RLUnits.pluralUnit(u, q) + ' ' + b.item).replace(/\s+/g, ' ').trim();
    }
    return { key: k, text: text, aisle: RLUnits.aisleFor(b.item || b.text), from: b.from };
  });

  (shop.extras || []).forEach(function (x) {
    items.push({ key: 'x|' + x.id, text: x.text, aisle: RLUnits.aisleFor(x.text), from: [], extra: x.id });
  });
  return items;
}

function shopHTML() {
  var shop = RLStore.getShop();
  var items = buildShopping();
  var byAisle = {};
  items.forEach(function (it) { (byAisle[it.aisle] = byAisle[it.aisle] || []).push(it); });

  var html = '<div class="shop-sources">';
  if ((shop.recipes || []).length) {
    html += '<div class="chips">' + shop.recipes.map(function (e) {
      var r = RLStore.get(e.recipe);
      if (!r) return '';
      return '<span class="chip src-chip">' + esc(r.title) +
        ' <span class="chip-n">' + esc(fmtServings(e.servings)) + '</span>' +
        '<button class="chip-x" data-act="shoprm" data-id="' + esc(r.id) + '" aria-label="Remove">&times;</button></span>';
    }).join('') + '</div>';
  } else {
    html += '<p class="hint">Nothing on the list yet. Add a recipe from its page, or send a week over from the plan.</p>';
  }
  html += '</div>';

  html += '<form class="add-extra" data-act="extra-form"><input type="text" id="extra" placeholder="Add something else: dish soap, a lemon" autocomplete="off">' +
    '<button class="btn" type="submit">Add</button></form>';

  var done = shop.done || {}, remaining = 0;
  RLUnits.AISLE_ORDER.forEach(function (aisle) {
    var list = byAisle[aisle];
    if (!list || !list.length) return;
    html += '<section class="aisle"><h3>' + esc(aisle) + '</h3><ul class="shop-list">';
    list.forEach(function (it) {
      var isDone = !!done[it.key];
      if (!isDone) remaining++;
      html += '<li class="' + (isDone ? 'done' : '') + '">' +
        '<label><input type="checkbox" data-act="shoptick" data-key="' + esc(it.key) + '"' + (isDone ? ' checked' : '') + '>' +
        '<span class="shop-text">' + esc(it.text) + '</span></label>' +
        (it.from.length > 1 ? '<span class="shop-from">' + esc(it.from.length + ' recipes') + '</span>' :
         it.from.length ? '<span class="shop-from">' + esc(it.from[0]) + '</span>' : '') +
        (it.extra ? '<button class="step-btn danger" data-act="extrarm" data-id="' + esc(it.extra) + '" aria-label="Remove">&times;</button>' : '') +
        '</li>';
    });
    html += '</ul></section>';
  });

  if (items.length) {
    html += '<div class="shop-foot"><span class="hint">' + remaining + ' still to get, ' +
      (items.length - remaining) + ' in the basket</span>' +
      '<button class="btn" data-act="shopcopy">Copy list</button>' +
      '<button class="btn" data-act="shopclearticked">Clear ticked</button>' +
      '<button class="btn ghost danger" data-act="shopclear">Empty the list</button></div>';
  }
  return html;
}

/* ---------------- settings ---------------- */

function renderSettings() {
  var prefs = RLStore.getPrefs(), health = RLStore.health(), all = RLStore.all();
  var ings = 0, steps = 0;
  all.forEach(function (r) { ings += r.ingredients.length; steps += r.steps.length; });

  PAGES.settings.innerHTML =
  '<header class="page-head"><h1>Settings</h1></header>' +

  '<section class="panel"><h2>Look</h2>' +
    '<div class="row"><div><strong>Theme</strong><p class="hint">Dark is the default. The choice is remembered in this browser.</p></div>' +
      '<div class="seg"><button class="' + (RLStore.getTheme() === 'dark' ? 'on' : '') + '" data-act="theme" data-t="dark">Dark</button>' +
      '<button class="' + (RLStore.getTheme() === 'light' ? 'on' : '') + '" data-act="theme" data-t="light">Light</button></div></div>' +
    '<div class="row"><div><strong>Default recipe view</strong><p class="hint">Phones always open the list first; the grid is a tap away.</p></div>' +
      '<div class="seg"><button class="' + (prefs.view === 'grid' ? 'on' : '') + '" data-act="defview" data-v="grid">Grid</button>' +
      '<button class="' + (prefs.view === 'list' ? 'on' : '') + '" data-act="defview" data-v="list">List</button></div></div>' +
  '</section>' +

  '<section class="panel"><h2>Your recipes</h2>' +
    '<p class="stat"><strong>' + all.length + '</strong> recipes, <strong>' + ings + '</strong> ingredient lines, <strong>' + steps + '</strong> steps.</p>' +
    '<div class="btn-row">' +
      '<button class="btn" data-act="export">Export a backup</button>' +
      '<button class="btn" data-act="import">Import a backup</button>' +
      '<input type="file" id="importfile" accept="application/json,.json" hidden>' +
    '</div>' +
    '<p class="hint">Everything lives in this browser and nothing is sent anywhere. That also means it is only as safe as this browser: a different machine, a cleared site history or a new domain all start empty. Export is how you carry it across. Importing merges, so restoring an old backup can add recipes but never remove one.</p>' +
    '<div class="btn-row">' +
      (prefs.demoLoaded
        ? '<button class="btn ghost" data-act="undemo">Remove the sample recipes</button>'
        : '<button class="btn ghost" data-act="demo">Load sample recipes</button>') +
    '</div>' +
    '<p class="hint">' + (prefs.demoLoaded
      ? 'Clearing them leaves alone any sample you have since edited: once you change one, it is yours.'
      : 'Eight recipes to look around with, including the coffee cake the grid format is usually shown with.') + '</p>' +
  '</section>' +

  autosavePanelHTML() +

  '<section class="panel"><h2>Storage</h2>' +
    '<p class="stat ' + (health.ok ? 'ok' : 'bad') + '">' +
      (health.ok ? 'Saving works in this browser.' : 'Saving is failing: ' + esc(health.error)) + '</p>' +
    (health.ok ? '' : '<p class="hint">Private windows and full storage both cause this. Export what you can see now, before adding anything else.</p>') +
  '</section>' +

  '<section class="panel"><h2>About</h2>' +
    '<p>A recipe book that lives in your browser. Recipes are held as a tree, not a list: each step names what it consumes, which is what lets the same recipe be drawn either as the ingredients-and-operations grid or as an ordinary ingredients-then-method page.</p>' +
    '<p class="hint">The code is MIT licensed. The recipes you enter are yours; the sample set is written for this project.</p>' +
  '</section>';
}

/* ---------------- cook mode ---------------- */

var cook = { id: null, seq: [], i: 0, checked: {}, wake: null, timers: [], tick: null };

function openCook(id) {
  var r = RLStore.get(id);
  if (!r) { go('recipes'); return; }
  cook.id = id;
  cook.seq = RLGrid.cookSequence(r);
  cook.i = 0;
  cook.checked = {};
  cookEl.hidden = false;
  document.body.classList.add('cooking');
  requestWake();
  drawCook();
}

function closeCook() {
  if (cookEl.hidden) return;
  cookEl.hidden = true;
  document.body.classList.remove('cooking');
  releaseWake();
}

function requestWake() {
  try {
    if (navigator.wakeLock && navigator.wakeLock.request) {
      navigator.wakeLock.request('screen').then(function (w) { cook.wake = w; }).catch(function () {});
    }
  } catch (e) {}
}
function releaseWake() {
  try { if (cook.wake) { cook.wake.release(); cook.wake = null; } } catch (e) {}
}

function drawCook() {
  var r = RLStore.get(cook.id);
  if (!r) { closeCook(); return; }
  var factor = r.servings ? (servingsFor(r) / r.servings) : 1;
  var n = cook.seq.length;
  var done = cook.i >= n;
  var cur = done ? null : cook.seq[cook.i];

  var html = '<div class="cook-head">' +
    '<button class="cook-x" data-act="cookclose" aria-label="Leave cook mode"><svg viewBox="0 0 24 24" class="ic"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
    '<div class="cook-title">' + esc(r.title) + '</div>' +
    '<div class="cook-count">' + (done ? 'done' : (cook.i + 1) + ' of ' + n) + '</div>' +
  '</div>' +
  '<div class="cook-bar"><span style="width:' + Math.round((done ? n : cook.i) / Math.max(1, n) * 100) + '%"></span></div>' +
  timersHTML() +
  '<div class="cook-body">';

  if (done) {
    html += '<div class="cook-done"><h2>That is everything.</h2>' +
      '<p>Cooked it? It will be counted, and the date kept, so the library can tell you what you actually make.</p>' +
      '<div class="btn-row"><button class="btn accent big" data-act="cookdone">I cooked it</button>' +
      '<button class="btn big" data-act="cookclose">Just leave</button></div></div>';
  } else {
    html += '<p class="cook-step">' + esc(cur.step.text) + '</p>';
    var timer = RLParse.timerFor(cur.step.text);
    if (timer) {
      html += '<button class="btn accent timer-start" data-act="timer" data-seconds="' + timer.seconds +
        '" data-label="' + esc(cur.step.text.slice(0, 30)) + '">Start a timer for ' + esc(timer.text) + '</button>';
    }
    if (cur.ingredients.length) {
      html += '<ul class="cook-ings">' + cur.ingredients.map(function (ing) {
        var on = cook.checked[ing.id];
        return '<li class="' + (on ? 'on' : '') + '"><label><input type="checkbox" data-act="cooktick" data-id="' +
          esc(ing.id) + '"' + (on ? ' checked' : '') + '><span>' +
          esc(RLUnits.renderIngredient(ing, factor)) + '</span></label></li>';
      }).join('') + '</ul>';
    } else {
      html += '<p class="hint">This step uses what the one before it made.</p>';
    }
  }
  html += '</div>' +
  '<div class="cook-foot">' +
    '<button class="btn big" data-act="cookprev"' + (cook.i === 0 ? ' disabled' : '') + '>Back</button>' +
    (done ? '' : '<button class="btn accent big" data-act="cooknext">' + (cook.i === n - 1 ? 'Finish' : 'Next') + '</button>') +
  '</div>';

  cookEl.innerHTML = html;
}

/* ---------------- timers ---------------- */

function timersHTML() {
  if (!cook.timers.length) return '';
  return '<div class="timers">' + cook.timers.map(function (t, i) {
    var left = Math.max(0, Math.round((t.endsAt - Date.now()) / 1000));
    return '<div class="timer' + (left === 0 ? ' rang' : '') + '">' +
      '<span class="timer-clock">' + RLParse.fmtClock(left) + '</span>' +
      '<span class="timer-label">' + esc(t.label) + '</span>' +
      '<button class="step-btn" data-act="timerstop" data-i="' + i + '" aria-label="Stop timer">&times;</button></div>';
  }).join('') + '</div>';
}

function startTimer(seconds, label) {
  cook.timers.push({ endsAt: Date.now() + seconds * 1000, label: label || 'timer', rang: false });
  if (!cook.tick) cook.tick = setInterval(tickTimers, 1000);
  drawCook();
  toast('Timer started: ' + RLParse.fmtClock(seconds));
}

function tickTimers() {
  var changed = false;
  cook.timers.forEach(function (t) {
    if (!t.rang && Date.now() >= t.endsAt) { t.rang = true; ring(t.label); changed = true; }
  });
  if (!cookEl.hidden) drawCook();
  if (!cook.timers.length && cook.tick) { clearInterval(cook.tick); cook.tick = null; }
  return changed;
}

/* A short two-tone chime, synthesised so nothing has to be downloaded. */
function ring(label) {
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      var ctx = new Ctx();
      [0, 0.28, 0.56].forEach(function (t, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = i % 2 ? 660 : 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.24);
      });
      setTimeout(function () { try { ctx.close(); } catch (e) {} }, 1500);
    }
  } catch (e) {}
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
  toast('Timer finished: ' + label);
}

/* ---------------- shared actions ---------------- */

function addToShopping(r, servings) {
  var shop = RLStore.getShop();
  var found = false;
  shop.recipes.forEach(function (e) {
    if (e.recipe === r.id) { e.servings = servings; found = true; }
  });
  if (!found) shop.recipes.push({ recipe: r.id, servings: servings });
  RLStore.setShop(shop);
  updateCounts();
  toast(found ? 'Updated on the shopping list.' : 'Added to the shopping list.');
}

function planPicker(dayK) {
  var list = RLStore.all();
  if (!list.length) { toast('No recipes to plan with yet.', 'bad'); return; }
  var wrap = document.createElement('div');
  wrap.className = 'modal-scrim';
  wrap.innerHTML = '<div class="modal" role="dialog" aria-label="Choose a recipe">' +
    '<h2>Add to ' + esc(prettyDay(dayK)) + '</h2>' +
    '<input type="search" id="pick-q" placeholder="Search" autocomplete="off">' +
    '<div class="pick-list" id="pick-list"></div>' +
    '<div class="modal-foot"><button class="btn" data-act="close-modal">Cancel</button></div></div>';
  document.body.appendChild(wrap);

  function draw(q) {
    var items = list.filter(function (r) { return matches(r, q); }).slice(0, 60);
    $('#pick-list', wrap).innerHTML = items.length ? items.map(function (r) {
      return '<button class="pick-row" data-id="' + esc(r.id) + '"><strong>' + esc(r.title) + '</strong>' +
        '<span>' + esc(r.servings + ' ' + r.servingsNoun) + '</span></button>';
    }).join('') : '<p class="hint">Nothing matches.</p>';
  }
  draw('');
  $('#pick-q', wrap).addEventListener('input', function () { draw(this.value); });
  $('#pick-q', wrap).focus();

  wrap.addEventListener('click', function (e) {
    if (e.target === wrap || (e.target.closest('[data-act="close-modal"]'))) { wrap.remove(); return; }
    var row = e.target.closest('.pick-row');
    if (!row) return;
    var r = RLStore.get(row.getAttribute('data-id'));
    var plan = RLStore.getPlan();
    plan.days[dayK] = plan.days[dayK] || [];
    plan.days[dayK].push({ recipe: r.id, servings: r.servings });
    RLStore.setPlan(plan);
    wrap.remove();
    renderKitchen();
    toast(r.title + ' added to ' + prettyDay(dayK) + '.');
  });
}

function prettyDay(k) {
  var p = k.split('-'), d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return DAY_NAMES[(d.getDay() + 6) % 7] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
}

function recipeToText(r, factor) {
  var t = RLGrid.buildTree(r);
  var lines = [r.title];
  if (r.blurb) lines.push(r.blurb);
  lines.push('Serves ' + fmtServings(r.servings * (factor || 1)) + ' ' + r.servingsNoun);
  lines.push('', 'Ingredients');
  r.ingredients.forEach(function (i) { lines.push('- ' + RLUnits.renderIngredient(i, factor)); });
  lines.push('', 'Method');
  var seq = t.order.slice();
  r.steps.forEach(function (s) { if (seq.indexOf(s.id) === -1) seq.push(s.id); });
  seq.forEach(function (id, n) {
    var st = null;
    r.steps.forEach(function (s) { if (s.id === id) st = s; });
    if (st) lines.push((n + 1) + '. ' + st.text);
  });
  if (r.notes) lines.push('', 'Notes', r.notes);
  if (r.source) lines.push('', 'Source: ' + r.source);
  return lines.join('\n');
}

function copyText(text, what) {
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast(what + ' copied.'); }
    catch (e) { toast('Could not copy here.', 'bad'); }
    ta.remove();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { toast(what + ' copied.'); }, fallback);
  } else fallback();
}

function download(name, text) {
  var blob = new Blob([text], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function updateCounts() {
  var n = RLStore.all().length;
  var c = $('#recipeCount');
  if (c) { c.textContent = n ? String(n) : ''; }
  var shop = RLStore.getShop();
  var left = buildShopping().filter(function (i) { return !shop.done[i.key]; }).length;
  var s = $('#shopCount');
  if (s) { s.textContent = left ? String(left) : ''; }
}

/* ---------------- the delegated click handler ---------------- */

function handleClick(e) {
  var btn = e.target.closest('[data-act]');
  if (!btn) { closeMenus(); return; }
  var act = btn.getAttribute('data-act');
  var id = btn.getAttribute('data-id');
  var r = state.route.name === 'r' ? RLStore.get(state.route.arg) : null;

  switch (act) {
    case 'open': go('r/' + id); break;
    /* Both buttons wearing this act say "Recipes", so they go to the recipe
       list. history.back() went wherever you happened to come from, which
       after arriving from the planner, the shopping list or a bookmark was
       not the recipe list at all. */
    case 'back': go('recipes'); break;
    case 'new': state.editor = null; state.dirty = false; go('new'); break;
    case 'paste': openPaste(); break;
    case 'demo':
      RLStore.loadDemo(RLSamples);
      toast('Sample recipes loaded.');
      route();
      break;
    case 'undemo':
      var removed = RLStore.clearDemo(RLSamples);
      toast(removed ? removed + ' sample recipes removed.' : 'Nothing left to remove; the samples have all been edited, so they are yours now.');
      renderSettings(); updateCounts();
      break;
    case 'reset':
      state.q = ''; state.tag = ''; state.filter = 'all'; renderRecipes();
      break;
    case 'clearq': state.q = ''; renderRecipes(); break;
    case 'filter': state.filter = btn.getAttribute('data-filter'); renderRecipes(); break;
    case 'tag': state.tag = btn.getAttribute('data-tag'); renderRecipes(); break;
    case 'tagjump': state.tag = btn.getAttribute('data-tag'); state.q = ''; go('recipes'); break;

    case 'fav': {
      var target = RLStore.get(id);
      if (target) { target.fav = !target.fav; RLStore.put(target); }
      if (state.route.name === 'r') renderRecipe(state.route.arg); else renderRecipes();
      e.stopPropagation();
      break;
    }
    case 'rate': {
      if (!r) break;
      var n = Number(btn.getAttribute('data-n'));
      r.rating = (r.rating === n ? 0 : n);
      RLStore.put(r);
      renderRecipe(r.id);
      break;
    }

    case 'view':
      state.view = btn.getAttribute('data-view');
      if (isPhone() && state.view === 'grid') { openGridFull(); state.view = 'list'; }
      else renderRecipe(state.route.arg);
      break;
    case 'gridfullclose': closeGridFull(); break;

    case 'serv+': state.servings = round2(state.servings + servStep()); renderRecipe(state.route.arg); break;
    case 'serv-': state.servings = Math.max(servStep(), round2(state.servings - servStep())); renderRecipe(state.route.arg); break;
    case 'serv0': state.servings = r ? r.servings : 4; renderRecipe(state.route.arg); break;

    case 'cook': go('cook/' + state.route.arg); break;
    case 'edit': go('edit/' + (state.route.arg || id)); break;
    case 'tolist': if (r) addToShopping(r, state.servings || r.servings); break;
    case 'toplan': if (r) planPickerForRecipe(r); break;
    case 'menu': {
      var m = $('#rmenu');
      if (m) m.hidden = !m.hidden;
      e.stopPropagation();
      break;
    }
    case 'copytext': if (r) copyText(recipeToText(r, state.factor), 'Recipe'); closeMenus(); break;
    case 'dup': {
      if (!r) break;
      var copy = RLStore.duplicate(r.id);
      toast('Duplicated.');
      go('edit/' + copy.id);
      break;
    }
    case 'print': closeMenus(); window.print(); break;
    case 'del': {
      var delId = state.route.arg;
      var victim = RLStore.get(delId);
      if (!victim) break;
      if (!confirm('Delete "' + victim.title + '"? This cannot be undone, and it is only stored here.')) break;
      RLStore.remove(delId);
      state.dirty = false; state.editor = null;
      toast('Deleted.');
      go('recipes');
      break;
    }

    /* editor */
    case 'save': saveEditor(); break;
    case 'cancel':
      state.dirty = false; state.editor = null;
      go(state.route.name === 'edit' && state.route.arg ? 'r/' + state.route.arg : 'recipes');
      break;
    case 'addstep':
      state.editor.steps.push({ id: RLStore.uid('s'), text: '', inputs: [] });
      state.dirty = true;
      redrawSteps();
      break;
    case 'stepdel':
      removeStep(btn.getAttribute('data-step'));
      break;
    case 'stepup': moveStep(btn.getAttribute('data-step'), -1); break;
    case 'stepdown': moveStep(btn.getAttribute('data-step'), 1); break;
    case 'pick':
      state.pickerFor = (state.pickerFor === btn.getAttribute('data-step')) ? null : btn.getAttribute('data-step');
      redrawSteps();
      break;
    case 'pickone': togglePick(btn.getAttribute('data-step'), btn.getAttribute('data-target')); break;

    /* kitchen */
    case 'ktab': go('kitchen/' + btn.getAttribute('data-k')); break;
    case 'week': {
      var d = btn.getAttribute('data-d');
      state.weekOffset = (d === '0') ? 0 : state.weekOffset + Number(d);
      renderKitchen();
      break;
    }
    case 'planadd': planPicker(btn.getAttribute('data-day')); break;
    case 'planrm': {
      var plan = RLStore.getPlan(), k = btn.getAttribute('data-day');
      plan.days[k] = (plan.days[k] || []).filter(function (x) { return x.recipe !== btn.getAttribute('data-id'); });
      RLStore.setPlan(plan);
      renderKitchen();
      break;
    }
    case 'week2list': weekToList(); break;
    case 'weekclear': {
      if (!confirm('Clear every meal planned for this week?')) break;
      var p2 = RLStore.getPlan(), s2 = weekStart(state.weekOffset);
      for (var i = 0; i < 7; i++) { var dd = new Date(s2); dd.setDate(dd.getDate() + i); delete p2.days[dayKey(dd)]; }
      RLStore.setPlan(p2);
      renderKitchen();
      break;
    }
    case 'shoprm': {
      var sh = RLStore.getShop();
      sh.recipes = sh.recipes.filter(function (x) { return x.recipe !== id; });
      RLStore.setShop(sh);
      renderKitchen(); updateCounts();
      break;
    }
    case 'shoptick': {
      var sh2 = RLStore.getShop(), key = btn.getAttribute('data-key');
      if (sh2.done[key]) delete sh2.done[key]; else sh2.done[key] = 1;
      RLStore.setShop(sh2);
      renderKitchen(); updateCounts();
      break;
    }
    case 'extrarm': {
      var sh3 = RLStore.getShop();
      sh3.extras = sh3.extras.filter(function (x) { return x.id !== id; });
      RLStore.setShop(sh3);
      renderKitchen(); updateCounts();
      break;
    }
    case 'shopcopy': {
      var lines = [];
      var byA = {};
      buildShopping().forEach(function (it) { (byA[it.aisle] = byA[it.aisle] || []).push(it.text); });
      RLUnits.AISLE_ORDER.forEach(function (a) {
        if (!byA[a]) return;
        lines.push(a);
        byA[a].forEach(function (t) { lines.push('- ' + t); });
        lines.push('');
      });
      copyText(lines.join('\n').trim(), 'Shopping list');
      break;
    }
    case 'shopclearticked': {
      var sh4 = RLStore.getShop();
      var doneKeys = sh4.done || {};
      sh4.extras = sh4.extras.filter(function (x) { return !doneKeys['x|' + x.id]; });
      sh4.done = {};
      /* A recipe whose every line is ticked has been shopped for. */
      sh4.recipes = sh4.recipes.filter(function (e) {
        var r2 = RLStore.get(e.recipe);
        if (!r2) return false;
        return !r2.ingredients.every(function (ing) {
          var k2 = (ing.qty == null) ? 'raw|' + ing.raw.toLowerCase()
                 : RLUnits.normItem(ing.item) + '|' + RLUnits.toBase(ing.qty, ing.unit).unit;
          return doneKeys[k2];
        });
      });
      RLStore.setShop(sh4);
      renderKitchen(); updateCounts();
      toast('Ticked items cleared.');
      break;
    }
    case 'shopclear': {
      if (!confirm('Empty the whole shopping list?')) break;
      RLStore.setShop({ recipes: [], extras: [], done: {} });
      renderKitchen(); updateCounts();
      break;
    }

    /* settings */
    case 'theme': RLStore.setTheme(btn.getAttribute('data-t')); renderSettings(); break;
    case 'defview': RLStore.setPref('view', btn.getAttribute('data-v')); state.view = btn.getAttribute('data-v'); renderSettings(); break;
    case 'export': {
      var stamp = new Date().toISOString().slice(0, 10);
      download('recipes-' + stamp + '.json', JSON.stringify(RLStore.exportData(), null, 2));
      toast('Backup downloaded.');
      break;
    }
    case 'import': $('#importfile').click(); break;
    case 'as-pick': autosavePick(); break;
    case 'as-now': autosaveWrite(true); break;
    case 'as-reconnect': autosaveReconnect(); break;
    case 'as-stop':
      if (!confirm('Stop writing to ' + autosave.name + '? The file stays where it is, it just stops being updated.')) break;
      autosaveStop();
      break;

    /* cook mode */
    case 'cookclose': go('r/' + cook.id); break;
    case 'cooknext': cook.i = Math.min(cook.seq.length, cook.i + 1); drawCook(); break;
    case 'cookprev': cook.i = Math.max(0, cook.i - 1); drawCook(); break;
    case 'cooktick': break;   /* handled on change */
    case 'cookdone': {
      var rc = RLStore.get(cook.id);
      if (rc) { rc.cooked = (rc.cooked || 0) + 1; rc.lastCooked = new Date().toISOString(); RLStore.put(rc); }
      toast('Counted. That is ' + (rc ? rc.cooked : 1) + ' time' + (rc && rc.cooked > 1 ? 's' : '') + '.');
      go('r/' + cook.id);
      break;
    }
    case 'timer': startTimer(Number(btn.getAttribute('data-seconds')), btn.getAttribute('data-label') || 'timer'); break;
    case 'timerstop':
      cook.timers.splice(Number(btn.getAttribute('data-i')), 1);
      if (!cook.timers.length && cook.tick) { clearInterval(cook.tick); cook.tick = null; }
      drawCook();
      break;

    default: break;
  }
}

function servStep() {
  var r = RLStore.get(state.route.arg);
  return (r && r.servings <= 2) ? 0.5 : 1;
}
function round2(n) { return Math.round(n * 100) / 100; }

function closeMenus() {
  var m = $('#rmenu');
  if (m) m.hidden = true;
}

function removeStep(sid) {
  var r = state.editor;
  r.steps = r.steps.filter(function (s) { return s.id !== sid; });
  r.steps.forEach(function (s) {
    s.inputs = (s.inputs || []).filter(function (x) { return x !== sid; });
  });
  state.dirty = true;
  redrawSteps();
}

function moveStep(sid, dir) {
  var r = state.editor, i = -1;
  r.steps.forEach(function (s, n) { if (s.id === sid) i = n; });
  var j = i + dir;
  if (i < 0 || j < 0 || j >= r.steps.length) return;
  var tmp = r.steps[i]; r.steps[i] = r.steps[j]; r.steps[j] = tmp;
  state.dirty = true;
  redrawSteps();
}

/* Choosing something already spoken for moves it, rather than refusing:
   the invariant the grid needs is that nothing is used twice, and quietly
   taking it from the other step is what the user meant by clicking it. */
function togglePick(sid, targetId) {
  var r = state.editor, step = null;
  r.steps.forEach(function (s) { if (s.id === sid) step = s; });
  if (!step) return;
  var at = (step.inputs || []).indexOf(targetId);
  if (at !== -1) step.inputs.splice(at, 1);
  else {
    r.steps.forEach(function (s) {
      if (s.id === sid) return;
      s.inputs = (s.inputs || []).filter(function (x) { return x !== targetId; });
    });
    step.inputs.push(targetId);
  }
  state.dirty = true;
  redrawSteps();
}

/* Planning from a recipe. The next fortnight is the common case and stays
   one tap, but the fortnight was also the only case: anything further out
   could not be planned from here at all. A calendar sits behind a button
   for the rest of the year, and remembers nothing, so reopening the picker
   always starts back at the quick list. */
function planPickerForRecipe(r) {
  var wrap = document.createElement('div');
  wrap.className = 'modal-scrim';
  var mode = 'soon';
  var cursor = new Date();
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);

  draw();
  document.body.appendChild(wrap);

  wrap.addEventListener('click', function (e) {
    if (e.target === wrap || e.target.closest('[data-act="close-modal"]')) { wrap.remove(); return; }
    var b = e.target.closest('[data-act]');
    var act = b && b.getAttribute('data-act');
    if (act === 'cal-open') { mode = 'cal'; draw(); return; }
    if (act === 'cal-soon') { mode = 'soon'; draw(); return; }
    if (act === 'cal-month') {
      cursor.setMonth(cursor.getMonth() + Number(b.getAttribute('data-d')));
      draw();
      return;
    }
    var row = e.target.closest('[data-day]');
    if (!row || row.disabled) return;
    plan(row.getAttribute('data-day'));
  });

  function plan(k) {
    var p = RLStore.getPlan();
    p.days[k] = p.days[k] || [];
    p.days[k].push({ recipe: r.id, servings: state.servings || r.servings });
    RLStore.setPlan(p);
    wrap.remove();
    toast('Planned for ' + prettyDay(k) + '.');
  }

  function draw() {
    wrap.innerHTML = '<div class="modal" role="dialog" aria-label="Choose a day">' +
      '<h2>Plan ' + esc(r.title) + '</h2>' +
      (mode === 'soon' ? soonHTML() : calHTML()) +
      '<div class="modal-foot">' +
        (mode === 'soon'
          ? '<button class="btn" data-act="cal-open">Another date&hellip;</button>'
          : '<button class="btn" data-act="cal-soon">Back to the next fortnight</button>') +
        '<button class="btn" data-act="close-modal">Cancel</button>' +
      '</div></div>';
  }

  function soonHTML() {
    var start = weekStart(0), days = [], i;
    for (i = 0; i < 14; i++) { var d = new Date(start); d.setDate(d.getDate() + i); days.push(d); }
    return '<div class="pick-list">' + days.map(function (d) {
      var k = dayKey(d);
      return '<button class="pick-row" data-day="' + k + '"><strong>' + DAY_NAMES[(d.getDay() + 6) % 7] + '</strong>' +
        '<span>' + MONTHS[d.getMonth()] + ' ' + d.getDate() + '</span></button>';
    }).join('') + '</div>';
  }

  function calHTML() {
    var plan = RLStore.getPlan();
    var todayK = dayKey(new Date());
    var year = cursor.getFullYear(), month = cursor.getMonth();
    var first = new Date(year, month, 1);
    var lead = (first.getDay() + 6) % 7;                 /* Monday = 0 */
    var len = new Date(year, month + 1, 0).getDate();
    var cells = '', i, d, k, n, cls;

    for (i = 0; i < lead; i++) cells += '<span class="cal-day cal-blank"></span>';
    for (i = 1; i <= len; i++) {
      d = new Date(year, month, i);
      k = dayKey(d);
      n = (plan.days[k] || []).length;
      cls = 'cal-day' + (k === todayK ? ' today' : '') + (k < todayK ? ' past' : '');
      cells += '<button class="' + cls + '" data-day="' + k + '" ' +
        'aria-label="' + DAY_NAMES[(d.getDay() + 6) % 7] + ' ' + MONTHS[month] + ' ' + i + '">' +
        i + (n ? '<span class="cal-dot" title="' + n + ' already planned"></span>' : '') + '</button>';
    }

    return '<div class="cal-head">' +
        '<button class="btn small" data-act="cal-month" data-d="-1" aria-label="Previous month">&larr;</button>' +
        '<span class="cal-label">' + MONTHS[month] + ' ' + year + '</span>' +
        '<button class="btn small" data-act="cal-month" data-d="1" aria-label="Next month">&rarr;</button>' +
      '</div>' +
      '<div class="cal">' +
        ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(function (x) {
          return '<span class="cal-dow" aria-hidden="true">' + x + '</span>';
        }).join('') +
        cells +
      '</div>' +
      '<p class="hint">A dot means something is already planned that day.</p>';
  }
}

function weekToList() {
  var plan = RLStore.getPlan(), start = weekStart(state.weekOffset), added = 0;
  var shop = RLStore.getShop();
  for (var i = 0; i < 7; i++) {
    var d = new Date(start); d.setDate(d.getDate() + i);
    (plan.days[dayKey(d)] || []).forEach(function (e) {
      var existing = null;
      shop.recipes.forEach(function (x) { if (x.recipe === e.recipe) existing = x; });
      if (existing) existing.servings += e.servings;
      else shop.recipes.push({ recipe: e.recipe, servings: e.servings });
      added++;
    });
  }
  RLStore.setShop(shop);
  state.kitchenTab = 'shop';
  go('kitchen/shop');
  toast(added ? added + ' meals sent to the shopping list.' : 'Nothing planned this week.');
}

function openGridFull() {
  var r = RLStore.get(state.route.arg);
  if (!r) return;
  closeGridFull();          /* one overlay at a time; a second tap replaces */
  var wrap = document.createElement('div');
  wrap.className = 'grid-full';
  wrap.innerHTML = '<div class="gf-head"><span>' + esc(r.title) + '</span>' +
    '<button class="cook-x" data-act="gridfullclose" aria-label="Close"><svg viewBox="0 0 24 24" class="ic"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
    '<p class="gf-hint">Swipe sideways; the ingredients column stays put.</p>' +
    RLGrid.renderGrid(r, state.factor, { timers: false });
  document.body.appendChild(wrap);
  document.body.classList.add('cooking');
  state.gridFull = true;
}
/* Removes every overlay, not just the first: the old version took one node
   at a time, so a repeated tap left a stack that outlived its own close
   button. The scroll lock is shared with cook mode, so it is only released
   when cook mode is not the one holding it. */
function closeGridFull() {
  $$('.grid-full').forEach(function (el) { el.remove(); });
  if (!cookEl || cookEl.hidden) document.body.classList.remove('cooking');
  state.gridFull = false;
}

/* ---------------- auto-save to a file ----------------
   The File System Access API hands back a handle to a file the user picked.
   The handle is structured-cloneable, so it can live in IndexedDB and outlast
   a reload, and Chrome can grant it permission for every visit. After one
   dialog the collection writes itself to that file whenever anything changes.

   Be honest about the limit: clearing site data takes the handle with it, the
   same as everything else here. What it does not take is the file, which is
   the whole point. Point it at a synced folder and there is a copy of every
   recipe off this machine that survives the browser entirely.

   Chromium desktop only. Firefox and every browser on iOS have no such API,
   so the panel simply never appears there and manual export stays the way. */

var IDB_NAME = 'recipelist';
var IDB_STORE = 'kv';
var IDB_HANDLE_KEY = 'autosave-handle';
var AUTOSAVE_DEBOUNCE = 1500;

var autosave = { handle: null, name: '', at: null, error: '', perm: 'granted', timer: null, busy: false, again: false, forgetful: false };

function autosaveSupported() {
  return !!(window.showSaveFilePicker && window.indexedDB);
}

function idb() {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = function () {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}

function idbDo(mode, fn) {
  return idb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(IDB_STORE, mode);
      var req = fn(tx.objectStore(IDB_STORE));
      tx.oncomplete = function () { resolve(req && req.result); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

function autosaveLoad() {
  if (!autosaveSupported()) return Promise.resolve();
  return idbDo('readonly', function (st) { return st.get(IDB_HANDLE_KEY); })
    .then(function (h) {
      if (!h) return;
      autosave.handle = h;
      autosave.name = h.name || 'a file';
      /* queryPermission never prompts. Asking needs a user gesture, so what
         it reports is recorded and acted on from a button rather than nagged
         about on load.

         'prompt' is the ordinary case, not a fault: browsers hand out
         file-write permission for one visit, so a refresh drops back to
         asking unless the grant was made permanent in the browser's own
         dialog. 'denied' is the real problem. They read very differently and
         must not share a message. */
      if (!h.queryPermission) return;
      return h.queryPermission({ mode: 'readwrite' }).then(function (stateName) {
        autosave.perm = stateName;
      });
    })
    .catch(function () { /* no handle, or storage refused: manual export stands */ })
    .then(renderAutosave);
}

function autosavePick() {
  if (!autosaveSupported()) return;
  window.showSaveFilePicker({
    /* Named for the site rather than just the app, so a file sitting in a
       folder months later still says where it came from. */
    suggestedName: 'recipelist-github-io.json',
    types: [{ description: 'Recipe List backup', accept: { 'application/json': ['.json'] } }]
  }).then(function (h) {
    autosave.handle = h;
    autosave.name = h.name || 'a file';
    autosave.error = '';
    autosave.perm = 'granted';
    /* Remembering the handle is the nicety; writing the file is the job. If
       IndexedDB refuses, which a private window will, auto-saving still works
       for this visit and simply has to be set up again next time. Letting the
       failure through would mean picking a file and having nothing written to
       it, which is the one outcome the user would not forgive. */
    return idbDo('readwrite', function (st) { return st.put(h, IDB_HANDLE_KEY); })
      .catch(function () { autosave.forgetful = true; })
      .then(function () { return autosaveWrite(true); });
  }).catch(function (err) {
    /* Cancelling the dialog is not a failure. */
    if (err && err.name === 'AbortError') return;
    autosave.error = (err && err.message) || 'could not use that file';
    renderAutosave();
  });
}

function autosaveStop() {
  autosave.handle = null; autosave.name = ''; autosave.at = null;
  autosave.error = ''; autosave.perm = 'granted';
  clearTimeout(autosave.timer);
  idbDo('readwrite', function (st) { return st.delete(IDB_HANDLE_KEY); })
    .catch(function () {})
    .then(renderAutosave);
}

/* Writes the same payload the export button produces, so the file is an
   ordinary backup that Import already understands. */
function autosaveWrite(loud) {
  if (!autosave.handle) return Promise.resolve();
  /* A write is already running. Queue one behind it rather than dropping this
     call, or the file would sit a change behind until the next edit happened
     to come along. */
  if (autosave.busy) { autosave.again = true; return Promise.resolve(); }
  autosave.busy = true;
  var h = autosave.handle;
  return Promise.resolve(h.queryPermission ? h.queryPermission({ mode: 'readwrite' }) : 'granted')
    .then(function (stateName) {
      autosave.perm = stateName;
      if (stateName !== 'granted') throw new Error('permission');
      return h.createWritable();
    }).then(function (w) {
      return w.write(JSON.stringify(RLStore.exportData(), null, 2)).then(function () { return w.close(); });
    }).then(function () {
      autosave.at = new Date();
      autosave.error = '';
      if (loud) toast('Auto-saving to ' + autosave.name);
    }).catch(function (err) {
      if (!autosave.error) autosave.error = (err && err.message) || 'write failed';
    }).then(function () {
      autosave.busy = false;
      if (autosave.again) { autosave.again = false; return autosaveWrite(false); }
      renderAutosave();
    });
}

/* Called on every stored change. Debounced, because one edit to a recipe can
   touch the collection, the planner and the list in the same breath. */
function autosaveSchedule() {
  if (!autosave.handle) return;
  clearTimeout(autosave.timer);
  autosave.timer = setTimeout(function () { autosaveWrite(false); }, AUTOSAVE_DEBOUNCE);
}

function autosaveReconnect() {
  if (!autosave.handle || !autosave.handle.requestPermission) return;
  autosave.handle.requestPermission({ mode: 'readwrite' }).then(function (stateName) {
    autosave.perm = stateName;
    if (stateName === 'granted') { autosave.error = ''; return autosaveWrite(true); }
    renderAutosave();
  }).catch(function () { renderAutosave(); });
}

/* The panel is drawn as part of Settings, which redraws wholesale, so this
   just redraws Settings when it happens to be the page on screen. */
function renderAutosave() {
  if (state.route.name === 'settings') renderSettings();
}

function autosavePanelHTML() {
  if (!autosaveSupported()) {
    return '<section class="panel"><h2>Auto-save to a file</h2>' +
      '<p>This browser cannot write to a file you choose, so the Export button above is the way to get a copy out. ' +
      'Chrome, Edge and other Chromium browsers on a desktop can do it; Firefox and everything on iOS cannot.</p></section>';
  }
  var on = !!autosave.handle;
  var html = '<section class="panel"><h2>Auto-save to a file</h2>' +
    '<p>Pick a file once and every recipe, the planner and the shopping list are written to it whenever anything changes. ' +
    'Point it at a synced folder and you get an off-machine copy for free, which another device can import from.</p>' +
    '<div class="btn-row">' +
      '<button class="btn" data-act="as-pick">' + (on ? 'Choose a different file' : 'Choose a file') + '</button>' +
      (on ? '<button class="btn" data-act="as-now">Save now</button>' : '') +
      (on ? '<button class="btn ghost danger" data-act="as-stop">Stop auto-saving</button>' : '') +
    '</div>';

  if (!on) {
    html += '<p class="hint">Not set up. Nothing is written anywhere until you pick a file.</p>';
  } else if (autosave.perm === 'prompt') {
    html += '<p class="hint"><strong>Paused.</strong> Browsers allow writing to a file for one visit at a time, ' +
      'so this asks again after a refresh. <button class="linky" data-act="as-reconnect">Resume</button><br>' +
      'Choosing <strong>Allow on every visit</strong> in the browser prompt stops it asking again.</p>';
  } else if (autosave.perm === 'denied') {
    html += '<p class="stat bad">This browser is blocking writes to ' + esc(autosave.name) + '.</p>' +
      '<p class="hint">Nothing is being saved to it. Allow file editing for this site in the browser settings, ' +
      'or pick the file again. <button class="linky" data-act="as-reconnect">Try again</button></p>';
  } else if (autosave.error) {
    html += '<p class="stat bad">' + esc(autosave.name) + ' could not be written: ' + esc(autosave.error) + '</p>';
  } else {
    html += '<p class="hint">Saving to <strong>' + esc(autosave.name) + '</strong>' +
      (autosave.at ? ', last written ' + esc(fmtWhen(autosave.at)) : ', not written yet') + '.' +
      (autosave.forgetful
        ? ' This browser would not remember the file, so it will need choosing again next visit. A private window does that.'
        : '') + '</p>';
  }
  return html + '</section>';
}

function fmtWhen(d) {
  var secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 10) return 'just now';
  if (secs < 60) return secs + ' seconds ago';
  var mins = Math.round(secs / 60);
  if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
  return 'at ' + d.toLocaleTimeString();
}

/* ---------------- misc ---------------- */

function debounce(fn, ms) {
  var t = null;
  return function () {
    var args = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(self, args); }, ms);
  };
}

function onImportFile(file) {
  var reader = new FileReader();
  reader.onload = function () {
    var data;
    try { data = JSON.parse(reader.result); }
    catch (e) { toast('That file is not readable JSON.', 'bad'); return; }
    var res;
    try { res = RLStore.importData(data, { withPlan: false }); }
    catch (e2) { toast(e2.message, 'bad'); return; }
    toast(res.added + ' added, ' + res.updated + ' updated, ' + res.skipped + ' already current.');
    renderSettings();
    updateCounts();
  };
  reader.readAsText(file);
}

/* ---------------- boot ---------------- */

function init() {
  main = $('#main');
  PAGES.recipes = $('#page-recipes');
  PAGES.kitchen = $('#page-kitchen');
  PAGES.settings = $('#page-settings');
  PAGES.recipe = $('#page-recipe');
  PAGES.edit = $('#page-edit');
  cookEl = $('#cook');
  toastEl = $('#toast');

  state.view = RLStore.getPrefs().view;

  document.addEventListener('click', function (e) {
    /* The rail on desktop and the bottom bar on a phone are the same three
       buttons, so one handler covers both. */
    var tab = e.target.closest('.tabs button[data-tab]');
    if (tab) {
      var name = tab.getAttribute('data-tab');
      go(name === 'kitchen' ? 'kitchen/' + state.kitchenTab : name);
      return;
    }
    handleClick(e);
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.id === 'importfile' && el.files && el.files[0]) { onImportFile(el.files[0]); el.value = ''; return; }
    var act = el.getAttribute && el.getAttribute('data-act');
    if (act === 'cooktick') { cook.checked[el.getAttribute('data-id')] = el.checked; drawCook(); }
  });

  document.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-act="extra-form"]');
    if (!form) return;
    e.preventDefault();
    var input = $('#extra', form);
    var text = input.value.trim();
    if (!text) return;
    var shop = RLStore.getShop();
    shop.extras.push({ id: RLStore.uid('x'), text: text });
    RLStore.setShop(shop);
    input.value = '';
    renderKitchen();
    updateCounts();
    var again = $('#extra');
    if (again) again.focus();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (state.gridFull) { closeGridFull(); return; }
      var modal = $('.modal-scrim');
      if (modal) { modal.remove(); return; }
      if (!cookEl.hidden) { go('r/' + cook.id); return; }
      closeMenus();
      return;
    }
    if (!cookEl.hidden) {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); cook.i = Math.min(cook.seq.length, cook.i + 1); drawCook(); }
      if (e.key === 'ArrowLeft') { cook.i = Math.max(0, cook.i - 1); drawCook(); }
      return;
    }
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (typing) return;
    if (e.key === '/') { e.preventDefault(); var q = $('#q'); if (q) q.focus(); }
    if (e.key === 'n') { state.editor = null; state.dirty = false; go('new'); }
  });

  /* Enter and Space open a card, which is a div playing the part of a link. */
  document.addEventListener('keypress', function (e) {
    var card = e.target.closest && e.target.closest('.card');
    if (card && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      go('r/' + card.getAttribute('data-id'));
    }
  });

  /* Picks up a file chosen on an earlier visit, and reports what permission
     the browser is willing to give it now. */
  autosaveLoad();

  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', function (e) {
    if (!state.dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  route();
}

global.RLApp = {
  toast: toast,
  onStorageChange: function (ok) {
    if (!ok) toast('That did not save. Check Settings.', 'bad');
  },
  onDataChanged: function () { autosaveSchedule(); }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})(window);
