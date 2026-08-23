/* units.js - quantities, scaling and the aisle map.
   ------------------------------------------------
   One rule runs through this file: an ingredient line is kept as the user
   typed it (`raw`) *and* as parsed parts. The parse is a convenience for
   scaling and the shopping list; it is never allowed to lose the original.
   If parsing fails, qty is null and everything downstream falls back to raw. */
(function (global) {
'use strict';

/* Unicode vulgar fractions get folded to ASCII before anything else looks at
   the string, so "1 1/2 cups" typed either way takes the same path. Written
   as escapes so the file stays ASCII and cannot be corrupted by a re-encode. */
var VULGAR = {
  '¼': '1/4', '½': '1/2', '¾': '3/4',
  '⅓': '1/3', '⅔': '2/3',
  '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
  '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5',
  '⅙': '1/6', '⅚': '5/6', '⅐': '1/7', '⅑': '1/9', '⅒': '1/10'
};
var VULGAR_RE = /[¼-¾⅐-⅞]/g;
var DASHES = '[-\\u2013\\u2014]';

/* Canonical unit -> the spellings that mean it. The matcher sorts by length
   so a long spelling is never shadowed by a short one it contains. */
var UNIT_WORDS = {
  cup:        ['cup', 'cups', 'c'],
  tbsp:       ['tbsp', 'tbs', 'tbl', 'tablespoon', 'tablespoons'],
  tsp:        ['tsp', 'teaspoon', 'teaspoons'],
  oz:         ['oz', 'ounce', 'ounces'],
  'fl oz':    ['fl oz', 'floz', 'fluid ounce', 'fluid ounces'],
  lb:         ['lb', 'lbs', 'pound', 'pounds'],
  g:          ['g', 'gram', 'grams', 'gr'],
  kg:         ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'],
  ml:         ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'],
  l:          ['l', 'litre', 'litres', 'liter', 'liters'],
  qt:         ['qt', 'quart', 'quarts'],
  pt:         ['pt', 'pint', 'pints'],
  gal:        ['gal', 'gallon', 'gallons'],
  clove:      ['clove', 'cloves'],
  can:        ['can', 'cans', 'tin', 'tins'],
  jar:        ['jar', 'jars'],
  pkg:        ['package', 'packages', 'pkg', 'packet', 'packets'],
  slice:      ['slice', 'slices'],
  sprig:      ['sprig', 'sprigs'],
  stick:      ['stick', 'sticks'],
  bunch:      ['bunch', 'bunches'],
  head:       ['head', 'heads'],
  stalk:      ['stalk', 'stalks'],
  pinch:      ['pinch', 'pinches'],
  dash:       ['dash', 'dashes'],
  handful:    ['handful', 'handfuls'],
  piece:      ['piece', 'pieces'],
  large:      ['large'], medium: ['medium'], small: ['small']
};

/* Units that read better as decimals than as kitchen fractions. */
var METRIC = { g: 1, kg: 1, ml: 1, l: 1, oz: 1, lb: 1 };

var UNIT_LOOKUP = (function () {
  var map = {}, canon, i, list;
  for (canon in UNIT_WORDS) {
    list = UNIT_WORDS[canon];
    for (i = 0; i < list.length; i++) map[list[i].toLowerCase()] = canon;
  }
  return map;
})();

var UNIT_PATTERN = (function () {
  var all = Object.keys(UNIT_LOOKUP).sort(function (a, b) { return b.length - a.length; });
  return all.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|');
})();

function deVulgar(s) {
  return String(s).replace(VULGAR_RE, function (ch) {
    return (VULGAR[ch] ? ' ' + VULGAR[ch] : ch);
  }).replace(/\s+/g, ' ').trim();
}

/* "1-1/2", "1 1/2", "3/4", "2.5", "2" -> a number, or null. */
function parseNumber(s) {
  if (s == null) return null;
  var t = deVulgar(s).replace(new RegExp(DASHES + '\\s*(?=\\d+\\s*/)'), ' ');
  var m = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = t.match(/^(\d+)\s*\/\s*(\d+)/);
  if (m) return Number(m[1]) / Number(m[2]);
  m = t.match(/^(\d*\.?\d+)/);
  if (m) return Number(m[1]);
  return null;
}

/* The nearest useful kitchen fraction. Eighths are as fine as a measuring
   spoon set goes, so smaller amounts are reported as a pinch, not as 1/16. */
var FRACTIONS = [
  [1 / 8, '1/8'], [1 / 4, '1/4'], [1 / 3, '1/3'], [3 / 8, '3/8'], [1 / 2, '1/2'],
  [5 / 8, '5/8'], [2 / 3, '2/3'], [3 / 4, '3/4'], [7 / 8, '7/8']
];

function formatQty(n, unit) {
  if (n == null || isNaN(n)) return '';
  if (METRIC[unit]) {
    /* Metric weights stay decimal, rounded to something a scale can show. */
    var step = (n >= 100 ? 5 : n >= 10 ? 1 : 0.1);
    var r = Math.round(n / step) * step;
    return String(Number(r.toFixed(2)));
  }
  var whole = Math.floor(n + 1e-9), rest = n - whole, best = null, bestErr = 1, i, err;
  if (rest < 1e-6) return String(whole);
  for (i = 0; i < FRACTIONS.length; i++) {
    err = Math.abs(rest - FRACTIONS[i][0]);
    if (err < bestErr) { bestErr = err; best = FRACTIONS[i]; }
  }
  if (Math.abs(rest - 1) < bestErr) return String(whole + 1);
  if (bestErr > 0.06) return String(Number(n.toFixed(2)));   /* nothing close; be literal */
  return (whole ? whole + ' ' : '') + best[1];
}

function pluralUnit(unit, n) {
  if (!unit) return '';
  if (n == null || n <= 1) return unit;
  if (/^(g|kg|ml|l|oz|lb|tsp|tbsp|fl oz|qt|pt|gal|large|medium|small)$/.test(unit)) return unit;
  if (/(ch|sh|s)$/.test(unit)) return unit + 'es';
  return unit + 's';
}

/* Parse one ingredient line into {qty, unit, item, note, alt, raw}.
   `alt` holds a parenthetical restatement ("(300 g)"), kept so the grid can
   show both and the scaler can scale both. */
function parseIngredient(line) {
  var raw = String(line).trim();
  var out = { raw: raw, qty: null, unit: '', item: raw, note: '', alt: null };
  if (!raw) return out;

  var s = deVulgar(raw);

  /* Leading quantity, possibly a range ("2 to 3 cups"): take the low end and
     keep the range wording in the note, so nothing is silently dropped. */
  var qm = s.match(new RegExp(
    '^((?:\\d+\\s+\\d+\\s*/\\s*\\d+)' +
    '|(?:\\d+\\s*' + DASHES + '\\s*\\d+\\s*/\\s*\\d+)' +
    '|(?:\\d+\\s*/\\s*\\d+)' +
    '|(?:\\d*\\.?\\d+))\\s*'));
  if (!qm) return out;
  out.qty = parseNumber(qm[1]);
  s = s.slice(qm[0].length);

  var range = s.match(new RegExp('^(?:to|or|' + DASHES + ')\\s*((?:\\d+\\s*/\\s*\\d+)|(?:\\d*\\.?\\d+))\\s*', 'i'));
  if (range) { out.note = 'up to ' + range[1]; s = s.slice(range[0].length); }

  var um = s.match(new RegExp('^(' + UNIT_PATTERN + ')(?![a-z])\\.?\\s*', 'i'));
  if (um) {
    out.unit = UNIT_LOOKUP[um[1].toLowerCase()] || um[1].toLowerCase();
    s = s.slice(um[0].length);
  }

  /* A parenthetical right after the unit is nearly always the same amount in
     other units: "1 cup (225 g) butter". Pull it out as `alt`. */
  var pm = s.match(/^\(([^)]*)\)\s*/);
  if (pm) {
    var inner = pm[1].trim();
    var iq = parseNumber(inner);
    var iu = inner.replace(/^[\d\s./-]+/, '').trim().toLowerCase();
    if (iq != null) out.alt = { qty: iq, unit: UNIT_LOOKUP[iu] || iu };
    else out.note = out.note ? out.note + '; ' + inner : inner;
    s = s.slice(pm[0].length);
  }

  s = s.replace(/^of\s+/i, '').trim();

  /* Trailing preparation note after a comma: "onion, finely chopped". */
  var cm = s.match(/^([^,]+),\s*(.+)$/);
  if (cm) { out.item = cm[1].trim(); out.note = out.note ? out.note + '; ' + cm[2].trim() : cm[2].trim(); }
  else out.item = s.trim();

  if (!out.item) { out.item = raw; out.qty = null; out.unit = ''; out.alt = null; }
  return out;
}

/* Render an ingredient at a scale factor. `raw` is used verbatim whenever
   there is no quantity to scale, so an unparsed line survives the scaler
   untouched rather than being mangled into something wrong. */
function renderIngredient(ing, factor) {
  var f = (factor == null ? 1 : factor);
  if (ing.qty == null) return ing.raw || ing.item || '';
  var parts = [], q = ing.qty * f;
  if (q < 0.115 && !METRIC[ing.unit] && ing.unit) parts.push('a pinch of');
  else parts.push(formatQty(q, ing.unit) + (ing.unit ? ' ' + pluralUnit(ing.unit, q) : ''));
  if (ing.alt) parts.push('(' + formatQty(ing.alt.qty * f, ing.alt.unit) + ' ' + ing.alt.unit + ')');
  parts.push(ing.item);
  var s = parts.join(' ');
  if (ing.note) s += ', ' + ing.note;
  return s;
}

/* Shopping-list aisles. Longest keyword match wins, so "spring onion" does
   not land in the same bucket as "onion" by accident. */
var AISLES = [
  ['Produce', ['lettuce', 'spinach', 'kale', 'tomato', 'onion', 'shallot', 'garlic', 'potato', 'carrot', 'celery', 'pepper', 'cucumber', 'zucchini', 'courgette', 'squash', 'broccoli', 'cauliflower', 'mushroom', 'lemon', 'lime', 'orange', 'apple', 'banana', 'berry', 'berries', 'avocado', 'ginger', 'parsley', 'cilantro', 'coriander', 'basil', 'thyme', 'rosemary', 'mint', 'scallion', 'leek', 'cabbage', 'corn', 'chile', 'jalapeno']],
  ['Meat & fish', ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'sausage', 'steak', 'mince', 'ground beef', 'ground turkey', 'fish', 'salmon', 'tuna', 'shrimp', 'prawn', 'cod', 'anchovy', 'chorizo', 'ham', 'pancetta']],
  ['Dairy & eggs', ['milk', 'cream', 'butter', 'cheese', 'parmesan', 'cheddar', 'mozzarella', 'yogurt', 'yoghurt', 'egg', 'eggs', 'sour cream', 'creme fraiche', 'buttermilk', 'ricotta', 'feta']],
  ['Bakery', ['bread', 'baguette', 'bun', 'roll', 'tortilla', 'pita', 'naan', 'brioche', 'sourdough']],
  ['Baking', ['flour', 'sugar', 'baking powder', 'baking soda', 'yeast', 'vanilla', 'cocoa', 'chocolate', 'cornstarch', 'cornflour', 'oats', 'honey', 'molasses', 'syrup', 'powdered sugar']],
  ['Pantry', ['rice', 'pasta', 'noodle', 'spaghetti', 'lentil', 'chickpea', 'bean', 'stock', 'broth', 'oil', 'olive oil', 'vinegar', 'soy sauce', 'fish sauce', 'mustard', 'mayonnaise', 'ketchup', 'tomato paste', 'chopped tomato', 'crushed tomato', 'tinned tomato', 'canned tomato', 'coconut milk', 'peanut butter', 'tahini', 'almond', 'walnut', 'pecan', 'sesame', 'breadcrumb']],
  ['Spices', ['salt', 'pepper', 'paprika', 'cumin', 'cinnamon', 'nutmeg', 'oregano', 'bay leaf', 'turmeric', 'curry', 'chili powder', 'cayenne', 'clove', 'cardamom', 'saffron', 'spice']],
  ['Frozen', ['frozen', 'ice cream', 'puff pastry']],
  ['Drinks', ['wine', 'beer', 'juice', 'coffee', 'tea', 'water']]
];

var AISLE_ORDER = ['Produce', 'Meat & fish', 'Dairy & eggs', 'Bakery', 'Baking', 'Pantry', 'Spices', 'Frozen', 'Drinks', 'Other'];

function aisleFor(item) {
  var t = ' ' + String(item).toLowerCase() + ' ';
  var best = null, bestLen = 0, i, j, words, w;
  for (i = 0; i < AISLES.length; i++) {
    words = AISLES[i][1];
    for (j = 0; j < words.length; j++) {
      w = words[j];
      if (w.length > bestLen && t.indexOf(w) !== -1) { best = AISLES[i][0]; bestLen = w.length; }
    }
  }
  return best || 'Other';
}

/* Two ingredients merge on the shopping list when their items normalise the
   same way and their units are compatible. Deliberately conservative: it
   would rather list "onion" and "red onion" apart than merge them wrongly. */
function normItem(item) {
  return String(item).toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(fresh|freshly|large|small|medium|ripe|chopped|minced|sliced|diced|grated|ground|softened|melted|unsalted|salted|extra|virgin|plain|all|purpose|granulated|sifted|packed|optional|taste|serving|divided)\b/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/s$/, '');
}

var CONVERT = { kg: ['g', 1000], l: ['ml', 1000], lb: ['oz', 16], tbsp: ['tsp', 3] };
function toBase(qty, unit) {
  var u = unit || '', q = qty;
  while (CONVERT[u]) { q = q * CONVERT[u][1]; u = CONVERT[u][0]; }
  return { qty: q, unit: u };
}

global.RLUnits = {
  deVulgar: deVulgar, parseNumber: parseNumber, formatQty: formatQty,
  pluralUnit: pluralUnit, parseIngredient: parseIngredient,
  renderIngredient: renderIngredient, aisleFor: aisleFor,
  AISLE_ORDER: AISLE_ORDER, normItem: normItem, toBase: toBase,
  UNIT_PATTERN: UNIT_PATTERN, UNIT_LOOKUP: UNIT_LOOKUP
};
})(window);
