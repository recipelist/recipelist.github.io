/* parse.js - turning what you pasted into a recipe.
   -------------------------------------------------
   Recipes arrive in a dozen shapes: a block copied off a web page, a photo's
   worth of typing, JSON-LD lifted from a page's source, or a plain list. All
   of them land in the same structured recipe, because the grid, the scaler
   and the shopping list all read that one shape.

   Two things this file will not do. It will not throw away a line it did not
   understand: an unclassified line is kept with its raw text intact, as an
   ingredient if the method has not started and as a step once it has, and
   the editor lets you move it either way. And it will not present a guess as
   a fact: every step-to-ingredient link it infers is a starting point the
   editor shows you rather than an answer. */
(function (global) {
'use strict';

var HEAD_ING = /^(ingredients?|you will need|what you need|shopping list)\b[:\s]*$/i;
var HEAD_STEP = /^(directions?|instructions?|method|steps?|preparation|to make|procedure)\b[:\s]*$/i;
var HEAD_NOTE = /^(notes?|tips?|to serve|variations?)\b[:\s]*$/i;
var META_SERVES = /^(serves|servings|yield|makes)\b[:\s]*(.+)$/i;
var META_TIME = /^(prep(?:aration)?\s*time|cook(?:ing)?\s*time|total\s*time|bake\s*time)\b[:\s]*(.+)$/i;
var BULLET = /^[\s]*(?:[-*•▪·]|\d+[.)])\s+/;

/* Verbs that open an instruction. A line beginning with one of these is a
   step even if it also starts with a number ("2 minutes before serving..."
   is rare enough to be worth the trade). */
var VERBS = ['add', 'bake', 'beat', 'blend', 'boil', 'break', 'bring', 'broil', 'brown', 'brush',
  'chill', 'chop', 'coat', 'combine', 'cook', 'cool', 'cover', 'crack', 'cream', 'crush', 'cut',
  'deglaze', 'dice', 'discard', 'divide', 'drain', 'drizzle', 'drop', 'dust', 'fill', 'finish', 'flip', 'fold',
  'fry', 'garnish', 'grate', 'grease', 'grill', 'heat', 'knead', 'let', 'line', 'lower', 'marinate',
  'mash', 'melt', 'mix', 'pat', 'peel', 'place', 'pour', 'preheat', 'prepare', 'press', 'process',
  'pulse', 'puree', 'put', 'reduce', 'remove', 'repeat', 'reserve', 'return', 'roast', 'roll',
  'rub', 'saute', 'scatter', 'scrape', 'season', 'serve', 'set', 'simmer', 'slice', 'spoon',
  'spread', 'sprinkle', 'stir', 'strain', 'taste', 'toast', 'top', 'toss', 'transfer', 'turn',
  'warm', 'wash', 'whisk', 'wipe', 'work'];
/* One word-boundary source, so the two verb patterns cannot drift apart. */
var WORD_END = '\\b';
var VERB_RE = new RegExp('^(?:' + VERBS.join('|') + ')' + WORD_END, 'i');

/* The same word opens an instruction or names an ingredient depending on
   what follows it: "Butter the bread on both sides" against "Butter,
   softened". These count as an instruction only once the line is long enough
   to be a sentence, so a bare ingredient line is not dragged off. */
var SOFT_VERBS = ['arrange', 'assemble', 'baste', 'blitz', 'butter', 'crumble', 'dress',
  'halve', 'layer', 'oil', 'plate', 'poach', 'sear', 'shape', 'shred', 'sift', 'steam',
  'stuff', 'sweat', 'trim', 'whip', 'wrap', 'zest'];
var SOFT_RE = new RegExp('^(?:' + SOFT_VERBS.join('|') + ')' + WORD_END, 'i');

function opensAnInstruction(s) {
  if (VERB_RE.test(s)) return true;
  return SOFT_RE.test(s) && s.split(/\s+/).length >= 4;
}

/* Verbs that mean "this step takes what the last one produced". Used only
   when nothing better is known, and always flagged as a guess. */
var CARRY_RE = /^(add|stir|fold|mix|pour|combine|whisk|beat|blend|transfer|return|top|spread|spoon|drizzle|scatter|sprinkle|put|place|toss|season|finish|garnish|cover|bake|cook|simmer|serve|repeat|remove|let|chill|cool|divide|roll|shape|knead|press|brush)\b/i;

function looksLikeIngredient(line) {
  var s = RLUnits.deVulgar(line);
  if (opensAnInstruction(s) && s.length > 26) return false;
  if (/^\d+\s*[./]?\d*\s*$/.test(s)) return false;
  if (/^(\d|a |an |one |two |three |four |half )/i.test(s)) return true;
  if (new RegExp('\\b(' + RLUnits.UNIT_PATTERN + ')\\b', 'i').test(s) && s.length < 60) return true;
  if (s.length < 44 && !/[.!?]$/.test(s) && !opensAnInstruction(s)) return true;
  return false;
}

function looksLikeStep(line) {
  var s = line.trim();
  if (opensAnInstruction(s)) return true;
  if (s.length > 70) return true;
  /* A full sentence. Four words is low enough to catch "Bake until done."
     and high enough to leave "Salt and pepper" alone, and an ingredient line
     ending in a full stop is rare enough to be worth that trade. */
  if (/[.!?]$/.test(s) && s.split(/\s+/).length >= 4) return true;
  return false;
}

function minutesIn(text) {
  var m = String(text).match(/(\d+)\s*(h|hr|hour|hours)/i), mins = 0, mm;
  if (m) mins += Number(m[1]) * 60;
  mm = String(text).match(/(\d+)\s*(m|min|mins|minute|minutes)\b/i);
  if (mm) mins += Number(mm[1]);
  if (!mins) { var only = String(text).match(/(\d+)/); if (only) mins = Number(only[1]); }
  return mins || null;
}

/* The main entry point. Give it a blob, get back a recipe you can save. */
function parseBlock(text, seed) {
  var recipe = seed || RLStore.blankRecipe();
  var lines = String(text).replace(/\r/g, '').split('\n');
  var mode = 'auto', ingLines = [], stepLines = [], noteLines = [], titleTaken = !!recipe.title;
  var i, raw, line;

  for (i = 0; i < lines.length; i++) {
    raw = lines[i];
    line = raw.trim();
    if (!line) continue;

    if (HEAD_ING.test(line)) { mode = 'ing'; continue; }
    if (HEAD_STEP.test(line)) { mode = 'step'; continue; }
    if (HEAD_NOTE.test(line)) { mode = 'note'; continue; }

    var ms = line.match(META_SERVES);
    if (ms) {
      var n = RLUnits.parseNumber(ms[2]);
      if (n) { recipe.servings = n; }
      var noun = ms[2].replace(/^[\d\s./-]+/, '').trim();
      if (noun) recipe.servingsNoun = noun;
      continue;
    }
    var mt = line.match(META_TIME);
    if (mt) {
      var mins = minutesIn(mt[2]);
      if (mins && /prep/i.test(mt[1])) recipe.prepMin = mins;
      else if (mins) recipe.cookMin = mins;
      continue;
    }

    if (!titleTaken) {
      /* The first line is the title unless it reads as a measured ingredient
         or as an instruction, which is what a paste that began mid-recipe
         looks like. Deliberately more willing than looksLikeIngredient: a
         bare noun phrase at the top of a paste is nearly always the name. */
      if (RLUnits.parseIngredient(line).qty == null && !VERB_RE.test(line) &&
          !BULLET.test(raw) && line.length < 80 && !/[.!?,]$/.test(line)) {
        recipe.title = line.replace(/^#+\s*/, '');
        titleTaken = true;
        continue;
      }
      titleTaken = true;
    }

    var body = line.replace(BULLET, '').trim();
    if (!body) continue;

    if (mode === 'note') { noteLines.push(body); continue; }
    if (mode === 'ing') { ingLines.push(body); continue; }
    if (mode === 'step') { stepLines.push(body); continue; }

    /* No headings in the paste: decide line by line, and once instructions
       have clearly started, stay in them. Recipes do not go back, so past
       that turn a line only returns to the ingredients if it opens with a
       measured quantity. */
    if (stepLines.length && !BULLET.test(raw) &&
        (looksLikeStep(body) || RLUnits.parseIngredient(body).qty == null)) {
      stepLines.push(body);
      continue;
    }
    if (looksLikeIngredient(body) && !looksLikeStep(body)) ingLines.push(body);
    else if (looksLikeStep(body)) stepLines.push(body);
    else if (stepLines.length) stepLines.push(body);   /* past the turn already */
    else ingLines.push(body);
  }

  recipe.ingredients = ingLines.map(function (l) {
    var p = RLUnits.parseIngredient(l);
    p.id = RLStore.uid('i');
    return p;
  });
  recipe.steps = splitSteps(stepLines).map(function (t) {
    return { id: RLStore.uid('s'), text: t, inputs: [] };
  });
  if (noteLines.length) recipe.notes = (recipe.notes ? recipe.notes + '\n' : '') + noteLines.join('\n');
  if (!recipe.title) recipe.title = 'Untitled recipe';

  autoLink(recipe);
  return recipe;
}

/* A pasted method is often one paragraph. Split it into sentences so each
   becomes a step you can time, tick and hang ingredients on. */
function splitSteps(lines) {
  var out = [];
  lines.forEach(function (l) {
    /* Short lines are left alone: "Cook 5 minutes. Serve." is one step, and
       breaking it would only make the grid busier without saying more. */
    if (l.length < 80) { out.push(l); return; }
    /* Split after sentence punctuation. Done by planting a marker rather
       than with a lookbehind, which older Safari cannot even parse. */
    var parts = l.replace(/([.!?])\s+(?=[A-Z])/g, '$1<|>').split('<|>');
    if (parts.length === 1) { out.push(l); return; }
    parts.forEach(function (p) { p = p.trim(); if (p) out.push(p); });
  });
  return out.map(function (s) { return s.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
}

/* ---------- the guess ----------
   Match ingredient names inside step text, first claim wins, and fall back
   to "this step takes the last one's result" for steps that name nothing.
   Everything it decides is a starting point for the editor, not an answer. */
function autoLink(recipe) {
  var claimed = {}, lastResult = null, guessed = 0;

  var names = (recipe.ingredients || []).map(function (ing) {
    var words = RLUnits.normItem(ing.item).split(' ').filter(function (w) { return w.length > 2; });
    return { id: ing.id, words: words, head: words[words.length - 1] || '' };
  });

  (recipe.steps || []).forEach(function (st) {
    var hay = ' ' + RLUnits.normItem(st.text) + ' ';
    var hits = [];
    names.forEach(function (n) {
      if (claimed[n.id] || !n.head) return;
      /* The head word must appear, and if the name has more words at least
         half of them should, so "sugar" does not swallow "brown sugar". */
      if (hay.indexOf(' ' + n.head) === -1) return;
      var seen = n.words.filter(function (w) { return hay.indexOf(w) !== -1; }).length;
      if (seen * 2 < n.words.length) return;
      hits.push(n.id);
    });
    hits.forEach(function (id) { claimed[id] = 1; });
    st.inputs = hits.slice();
    if (lastResult && (!hits.length || CARRY_RE.test(st.text))) {
      st.inputs.unshift(lastResult);
      guessed++;
    }
    lastResult = st.id;
  });

  /* Anything still unclaimed at the end joins the last step, so the grid is
     complete rather than leaving ingredients dangling in their own rows. */
  var leftovers = (recipe.ingredients || []).filter(function (i) { return !claimed[i.id]; });
  var last = (recipe.steps || [])[recipe.steps.length - 1];
  if (last && leftovers.length && leftovers.length <= 3) {
    leftovers.forEach(function (i) { last.inputs.push(i.id); guessed++; });
  }
  recipe.autoLinked = guessed > 0;
  return recipe;
}

/* ---------- JSON-LD ----------
   Pasting a page's source, or a schema.org blob, is common enough to be
   worth handling; it is the only shape that arrives already structured. */
function parseJsonLd(text) {
  var data = null;
  try { data = JSON.parse(text); } catch (e) { return null; }
  var node = findRecipeNode(data);
  if (!node) return null;

  var r = RLStore.blankRecipe();
  r.title = String(node.name || 'Untitled recipe');
  r.blurb = String(node.description || '').slice(0, 400);
  if (typeof node.image === 'string') r.photo = node.image;
  else if (Array.isArray(node.image) && typeof node.image[0] === 'string') r.photo = node.image[0];
  else if (node.image && typeof node.image.url === 'string') r.photo = node.image.url;
  if (node.recipeYield) {
    var y = RLUnits.parseNumber(String(Array.isArray(node.recipeYield) ? node.recipeYield[0] : node.recipeYield));
    if (y) r.servings = y;
  }
  r.prepMin = isoMinutes(node.prepTime);
  r.cookMin = isoMinutes(node.cookTime) || isoMinutes(node.totalTime);
  var cats = [].concat(node.recipeCategory || [], node.recipeCuisine || [], node.keywords || []);
  cats.forEach(function (c) {
    String(c).split(',').forEach(function (t) {
      t = t.trim();
      if (t && r.tags.indexOf(t) === -1 && r.tags.length < 8) r.tags.push(t);
    });
  });
  (node.recipeIngredient || node.ingredients || []).forEach(function (l) {
    var p = RLUnits.parseIngredient(String(l));
    p.id = RLStore.uid('i');
    r.ingredients.push(p);
  });
  flattenInstructions(node.recipeInstructions).forEach(function (t) {
    splitSteps([t]).forEach(function (s) { r.steps.push({ id: RLStore.uid('s'), text: s, inputs: [] }); });
  });
  autoLink(r);
  return r;
}

function findRecipeNode(data) {
  var stack = [data], cur, i, k;
  while (stack.length) {
    cur = stack.shift();
    if (!cur || typeof cur !== 'object') continue;
    var type = cur['@type'];
    if (type === 'Recipe' || (Array.isArray(type) && type.indexOf('Recipe') !== -1)) return cur;
    if (Array.isArray(cur)) { for (i = 0; i < cur.length; i++) stack.push(cur[i]); continue; }
    for (k in cur) if (cur[k] && typeof cur[k] === 'object') stack.push(cur[k]);
  }
  return null;
}

function flattenInstructions(x) {
  if (!x) return [];
  if (typeof x === 'string') return x.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
  if (Array.isArray(x)) {
    var out = [];
    x.forEach(function (item) { out = out.concat(flattenInstructions(item)); });
    return out;
  }
  if (x.itemListElement) return flattenInstructions(x.itemListElement);
  if (x.text) return flattenInstructions(x.text);
  if (x.name) return flattenInstructions(x.name);
  return [];
}

function isoMinutes(iso) {
  if (!iso || typeof iso !== 'string') return null;
  var m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return null;
  var mins = (Number(m[1] || 0) * 1440) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
  return mins || null;
}

/* Try the structured route first, because it is exact, then the text one. */
function parseAny(text, seed) {
  var trimmed = String(text).trim();
  if (/^[[{]/.test(trimmed)) {
    var fromLd = parseJsonLd(trimmed);
    if (fromLd) return fromLd;
  }
  var script = trimmed.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i);
  if (script) {
    var fromTag = parseJsonLd(script[1]);
    if (fromTag) return fromTag;
  }
  return parseBlock(trimmed, seed);
}

/* ---------- timers ----------
   A step that says how long it takes should be able to run that clock. */
var TIME_RE = /(\d+(?:\s*(?:to|-|or)\s*\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i;

function timerFor(text) {
  var m = String(text).match(TIME_RE);
  if (!m) return null;
  var nums = m[1].split(/\s*(?:to|-|or)\s*/).map(Number).filter(function (n) { return !isNaN(n); });
  if (!nums.length) return null;
  var n = nums[nums.length - 1];                 /* the longer end of a range */
  var unit = m[2].toLowerCase(), secs;
  if (/^s/.test(unit)) secs = n;
  else if (/^h/.test(unit)) secs = n * 3600;
  else secs = n * 60;
  if (secs < 5 || secs > 24 * 3600) return null;
  return { seconds: secs, text: m[0], label: String(text).slice(0, 40) };
}

function fmtClock(secs) {
  var s = Math.max(0, Math.round(secs));
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return (h ? h + ':' + p(m) : String(m)) + ':' + p(r);
}

global.RLParse = {
  parseAny: parseAny, parseBlock: parseBlock, parseJsonLd: parseJsonLd,
  autoLink: autoLink, timerFor: timerFor, fmtClock: fmtClock,
  minutesIn: minutesIn, splitSteps: splitSteps
};
})(window);
