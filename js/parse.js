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
var BULLET = /^[\s]*(?:[-*•▪·\u25a2\u2610\u2611\u2751]|\d+[.)])\s+/;

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
    var p = RLUnits.parseIngredient(cleanIngredient(l) || l);
    p.id = RLStore.uid('i');
    return p;
  }).filter(function (p) { return p.raw; });
  recipe.steps = splitSteps(stepLines.map(cleanInstruction)).map(function (t) {
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
       breaking it would only make the grid busier without saying more.

       Three sentences or more is a different animal: that is a whole method
       handed over as one string, which is how a great many pages write
       recipeInstructions. Left whole it becomes one enormous cook-mode card
       and one enormous row in the grid, with nowhere to hang an ingredient
       and no timer to start, so length is not the only reason to split. */
    var sentences = (l.match(/[.!?](?:\s|$)/g) || []).length;
    if (l.length < 80 && sentences < 3) { out.push(l); return; }
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
  var data = tryJson(text);
  if (!data) return null;
  var node = findRecipeNode(data);
  return node ? recipeFromNode(node) : null;
}

/* JSON.parse, then JSON.parse again with entities undone. Some publishing
   systems emit &quot; inside the ld+json block, which is not valid JSON and
   is not decoded for us either, because a <script> is raw text as far as the
   HTML parser is concerned. */
function tryJson(text) {
  try { return JSON.parse(text); } catch (e) { /* fall through */ }
  try { return JSON.parse(decodeEntities(text)); } catch (e2) { return null; }
}

var ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', ndash: '-', mdash: '-', hellip: '...' };
function decodeEntities(t) {
  return String(t).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function (whole, body) {
    if (body.charAt(0) === '#') {
      var n = (body.charAt(1) === 'x' || body.charAt(1) === 'X')
        ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return isNaN(n) ? whole : String.fromCharCode(n);
    }
    var k = body.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ENTITIES, k) ? ENTITIES[k] : whole;
  });
}

/* A schema.org Recipe node, however it arrived: a ld+json block, one of
   several ld+json blocks, or microdata attributes read off the page. */
function recipeFromNode(node) {
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
  [].concat(node.recipeIngredient || node.ingredients || []).forEach(function (l) {
    var line = cleanIngredient(String(l));
    if (!line) return;
    var p = RLUnits.parseIngredient(line);
    p.id = RLStore.uid('i');
    r.ingredients.push(p);
  });
  flattenInstructions(node.recipeInstructions).forEach(function (t) {
    var text = cleanInstruction(t);
    if (!text) return;
    splitSteps([text]).forEach(function (s) { r.steps.push({ id: RLStore.uid('s'), text: s, inputs: [] }); });
  });
  if (!r.ingredients.length && !r.steps.length) return null;
  autoLink(r);
  return r;
}

/* Recipe-plugin furniture that rides along with the text: the checkbox
   glyphs WordPress plugins put in front of every ingredient, and the 1x/2x/3x
   scaler that ends up inside the line when a page is copied whole. */
function cleanIngredient(line) {
  return String(line)
    .replace(/^[\s▢☐☑❑▫▪]+/, '')
    .replace(/\s*[123]x\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanInstruction(text) {
  return String(text)
    .replace(/^\s*step\s*\d+\s*[:.)\-]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
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

/* ---------- a whole web page ----------
   There is no fetching here and there cannot be. A browser will not let this
   page read someone else's, and recipe sites do not send the header that
   would allow it. What it can do is read a page you hand it: copy the page,
   or its source, and paste. Everything below is what a scraper would have
   done with the response anyway.

   In order of how much they can be trusted: ld+json, then microdata, then
   the words on the page. */

function looksLikeHtml(s) {
  return /<\/(?:html|body|div|p|ul|ol|li|span|h[1-6]|article|section|table)\s*>/i.test(s) ||
         /<(?:html|body|script|meta|div)[\s>]/i.test(s);
}

function parseHtml(markup) {
  if (!global.DOMParser) return null;
  /* text/html neither runs script nor fetches anything the document refers
     to, so this stays string handling from beginning to end. */
  try {
    var doc = new global.DOMParser().parseFromString(markup, 'text/html');
    return (doc && doc.body) ? doc : null;
  } catch (e) { return null; }
}

/* Every ld+json block, not the first one. A recipe page routinely carries
   four or five: the site, the breadcrumbs, the organisation, an article, and
   then the recipe. Reading only the first one found a BreadcrumbList,
   concluded the page held no recipe, and fell back to guessing at markup. */
function recipeFromLdBlocks(doc) {
  var blocks = doc.querySelectorAll('script[type="application/ld+json"]'), i, data, node, r;
  for (i = 0; i < blocks.length; i++) {
    data = tryJson(blocks[i].textContent || '');
    if (!data) continue;
    node = findRecipeNode(data);
    if (!node) continue;
    r = recipeFromNode(node);
    if (r) return r;
  }
  return null;
}

/* The older convention, still all over the web: schema.org spelled out in
   attributes rather than in a script tag. Read into the same node shape, so
   there is one route from schema.org to a recipe rather than two. */
function recipeFromMicrodata(doc) {
  var scope = doc.querySelector('[itemtype*="schema.org/Recipe"]');
  if (!scope) return null;

  function value(el) {
    if (!el) return '';
    var c = el.getAttribute && el.getAttribute('content');
    if (c) return c;
    if (el.tagName === 'IMG') return el.getAttribute('src') || '';
    if (el.tagName === 'TIME') return el.getAttribute('datetime') || el.textContent;
    return el.textContent || '';
  }
  function one(name) { return value(scope.querySelector('[itemprop="' + name + '"]')); }
  function all(name) {
    return [].map.call(scope.querySelectorAll('[itemprop="' + name + '"]'), value)
             .map(function (x) { return String(x).replace(/\s+/g, ' ').trim(); })
             .filter(Boolean);
  }

  var node = {
    '@type': 'Recipe',
    name: one('name') || one('headline'),
    description: one('description'),
    image: one('image'),
    recipeYield: one('recipeYield'),
    prepTime: one('prepTime'),
    cookTime: one('cookTime'),
    totalTime: one('totalTime'),
    recipeIngredient: all('recipeIngredient').concat(all('ingredients')),
    recipeInstructions: all('recipeInstructions').concat(all('instructions'))
  };
  if (!node.recipeIngredient.length && !node.recipeInstructions.length) return null;
  return recipeFromNode(node);
}

/* Page furniture that is not the recipe. Whole lines only, and only ones
   that are unmistakably chrome: this filters what a web page wraps a recipe
   in, and must never filter what somebody typed. */
var PAGE_JUNK = new RegExp('^(?:' + [
  'jump to( the)? (recipe|video|comments?)', 'print( recipe| this)?', 'pin (it|this|recipe)',
  'share( this)?', 'save( recipe| this)?', 'rate (this )?recipe',
  'leave a (comment|reply|review|rating)', 'advertisement', 'sponsored( content)?',
  'skip to (main )?content', 'continue to content', 'you may also like',
  'related (recipes|posts)', 'more recipes', 'reader interactions',
  'subscribe', 'sign up', 'newsletter', 'follow (us|me)', 'search', 'menu', 'home',
  'cook mode', 'prevent your screen from going dark', 'equipment',
  'nutrition( facts| information)?', '[123]x', 'us customary', 'metric',
  'add to (shopping list|collection)', 'watch', 'comments?',
  'instagram', 'facebook', 'pinterest', 'email', 'all rights reserved.*',
  '\\d+(\\.\\d+)?\\s*(from\\s*\\d+\\s*)?(votes?|reviews?|ratings?|stars?)',
  '\\d+\\s*(comments?|shares?)'
].join('|') + ')\\s*[:.]?$', 'i');

/* A nutrition table reads as a list of ingredients unless it is recognised.
   Deliberately narrow: the whole line has to be a nutrient and a number, so
   "Sugar: 200g" in somebody's own notes is left alone. Sugar and salt are
   not on the list at all, being far likelier to be food than a footnote. */
var NUTRITION = new RegExp('^(?:calories|carbohydrates?|protein|cholesterol|sodium|potassium|' +
  'fib(?:er|re)|(?:saturated |unsaturated |trans |poly|mono)?fat|vitamin [a-z0-9]+|calcium|iron)' +
  '\\s*:?\\s*[\\d.,]+\\s*(?:k?cal|kj|g|mg|mcg|iu|%)?$', 'i');

/* Plugin layouts put a label on one line and its value on the next. Joined
   up they are something parseBlock already reads; left apart the value
   drifts off and becomes an ingredient called "15 minutes". */
var META_LABEL = /^(prep(?:aration)?\s*time|cook(?:ing)?\s*time|total\s*time|bake\s*time|serves|servings|yield|makes)\s*:?$/i;

function tidyPageLines(text) {
  var lines = String(text).replace(/\r/g, '').split('\n');
  var out = [], i, line, j, val;
  for (i = 0; i < lines.length; i++) {
    /* \u00a0 spelled out: a literal non-breaking space here is invisible
       in the source and one tidy-up away from being deleted by accident. */
    line = lines[i].replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
    if (!line) continue;
    if (PAGE_JUNK.test(line) || NUTRITION.test(line)) continue;
    if (META_LABEL.test(line)) {
      j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length) {
        val = lines[j].trim();
        if (!META_LABEL.test(val) && val.length < 40) {
          out.push(line.replace(/:$/, '') + ': ' + val);
          i = j;
          continue;
        }
      }
      continue;
    }
    /* A heading repeated by the layout, once for the page and once for the
       card, should not become two ingredients. */
    if (out.length && out[out.length - 1] === line) continue;
    out.push(line);
  }
  return out.join('\n');
}

/* The words on the page, with the furniture taken off first. Block elements
   become line breaks so the page's own lines survive into the parser. */
function htmlToText(doc) {
  var junk = doc.querySelectorAll(
    'script,style,noscript,nav,header,footer,aside,form,button,select,textarea,svg,iframe,template,figcaption');
  [].forEach.call(junk, function (el) { if (el.parentNode) el.parentNode.removeChild(el); });

  /* Prefer the part of the page that says it is the recipe. */
  var root = doc.querySelector('[itemtype*="schema.org/Recipe"]') ||
             doc.querySelector('.wprm-recipe, .tasty-recipes, .recipe, #recipe') ||
             doc.querySelector('article, main') || doc.body;

  [].forEach.call(root.querySelectorAll('br'), function (br) {
    if (br.parentNode) br.parentNode.replaceChild(doc.createTextNode('\n'), br);
  });
  [].forEach.call(
    root.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,tr,section,article,dd,dt,blockquote'),
    function (el) { el.appendChild(doc.createTextNode('\n')); });

  return tidyPageLines(root.textContent || '');
}

function stripTags(markup) {
  return decodeEntities(
    String(markup)
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br[^>]*>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '));
}

/* Try the structured route first, because it is exact, then the text one. */
function parseAny(text, seed) {
  var trimmed = String(text).trim();

  if (/^[[{]/.test(trimmed)) {
    var fromLd = parseJsonLd(trimmed);
    if (fromLd) return fromLd;
  }

  if (looksLikeHtml(trimmed)) {
    var doc = parseHtml(trimmed);
    if (doc) return recipeFromLdBlocks(doc) || recipeFromMicrodata(doc) || parseBlock(htmlToText(doc), seed);

    /* No DOMParser to lean on: sweep the script tags by hand, and failing
       that read the markup with its tags knocked out. */
    var tags = trimmed.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (var i = 0; i < tags.length; i++) {
      var got = parseJsonLd(tags[i].replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, ''));
      if (got) return got;
    }
    return parseBlock(tidyPageLines(stripTags(trimmed)), seed);
  }

  /* Plain text, but a paste box is where a copied page lands, so the same
     furniture arrives with the tags already stripped off by the clipboard. */
  return parseBlock(tidyPageLines(trimmed), seed);
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
  htmlToText: htmlToText, tidyPageLines: tidyPageLines, decodeEntities: decodeEntities,
  autoLink: autoLink, timerFor: timerFor, fmtClock: fmtClock,
  minutesIn: minutesIn, splitSteps: splitSteps
};
})(window);
