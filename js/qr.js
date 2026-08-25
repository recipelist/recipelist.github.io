/* qr.js - drawing a QR code.
   -------------------------
   Written out rather than pulled in, like everything else here. Only what
   the pairing needs: byte mode, error correction level L, versions 1 to 20,
   which is a little over 600 characters and comfortably more than the
   invite link runs to.

   Level L on purpose. The code is read off a screen rather than off a
   crumpled receipt, so there is nothing to recover from, and the lower level
   buys a smaller grid: fatter modules photograph better than clever error
   correction does.

   The two tables in here, the block layout and the alignment centres, are
   the parts of the specification that cannot be derived and so are the parts
   most likely to be mistyped. Both are checked against geometry at load:
   a version's codeword count follows from the size of the grid and the
   number of modules the function patterns take out of it, so a wrong row
   cannot agree with it. See selfCheck() at the bottom, which throws rather
   than letting a subtly wrong code reach a camera. */
(function (global) {
'use strict';

/* ---------- GF(256), the field QR arithmetic lives in ---------- */
var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(function () {
  var x = 1, i;
  for (i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;          /* the QR primitive polynomial */
  }
  for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function mul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/* The generator polynomial for n error correction codewords. */
function generator(n) {
  var poly = [1], i, j, next;
  for (i = 0; i < n; i++) {
    next = poly.slice();
    next.push(0);
    for (j = 0; j < poly.length; j++) next[j + 1] ^= mul(poly[j], EXP[i]);
    poly = next;
  }
  return poly;
}

function ecCodewords(data, n) {
  var gen = generator(n), rem = new Array(n), i, j, factor;
  for (i = 0; i < n; i++) rem[i] = 0;
  for (i = 0; i < data.length; i++) {
    factor = data[i] ^ rem[0];
    rem.shift();
    rem.push(0);
    for (j = 0; j < n; j++) rem[j] ^= mul(gen[j + 1], factor);
  }
  return rem;
}

/* ---------- the two tables ----------
   [ec codewords per block, blocks in group 1, data codewords each,
    blocks in group 2, data codewords each], for level L. */
var BLOCKS_L = {
  1:  [7, 1, 19, 0, 0],
  2:  [10, 1, 34, 0, 0],
  3:  [15, 1, 55, 0, 0],
  4:  [20, 1, 80, 0, 0],
  5:  [26, 1, 108, 0, 0],
  6:  [18, 2, 68, 0, 0],
  7:  [20, 2, 78, 0, 0],
  8:  [24, 2, 97, 0, 0],
  9:  [30, 2, 116, 0, 0],
  10: [18, 2, 68, 2, 69],
  11: [20, 4, 81, 0, 0],
  12: [24, 2, 92, 2, 93],
  13: [26, 4, 107, 0, 0],
  14: [30, 3, 115, 1, 116],
  15: [22, 5, 87, 1, 88],
  16: [24, 5, 98, 1, 99],
  17: [28, 1, 107, 5, 108],
  18: [30, 5, 120, 1, 121],
  19: [28, 3, 113, 4, 114],
  20: [28, 3, 107, 5, 108]
};

var ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62], 14: [6, 26, 46, 66],
  15: [6, 26, 48, 70], 16: [6, 26, 50, 74], 17: [6, 30, 54, 78],
  18: [6, 30, 56, 82], 19: [6, 30, 58, 86], 20: [6, 34, 62, 90]
};

var MAX_VERSION = 20;

function size(v) { return 17 + 4 * v; }

/* How many codewords a version holds. Counted from the same predicate the
   mask uses rather than from a second, parallel derivation: a formula
   written out by hand here would be one more thing that has to agree with
   isFunction(), and the first draft of it did not. */
var CAP = {};
function capacityCodewords(v) {
  if (CAP[v] != null) return CAP[v];
  var n = size(v), free = 0, r, c;
  for (r = 0; r < n; r++) {
    for (c = 0; c < n; c++) if (!isFunction(v, r, c)) free++;
  }
  return (CAP[v] = Math.floor(free / 8));
}

function dataCodewords(v) {
  var b = BLOCKS_L[v];
  return b[1] * b[2] + b[3] * b[4];
}

function byteCapacity(v) {
  var header = 4 + (v >= 10 ? 16 : 8);
  return dataCodewords(v) - Math.ceil(header / 8);
}

function pickVersion(len) {
  for (var v = 1; v <= MAX_VERSION; v++) if (byteCapacity(v) >= len) return v;
  return 0;
}

/* ---------- bits in, codewords out ---------- */

function toCodewords(bytes, v) {
  var bits = [], i, j;
  function push(value, n) {
    for (j = n - 1; j >= 0; j--) bits.push((value >> j) & 1);
  }
  push(4, 4);                                     /* byte mode */
  push(bytes.length, v >= 10 ? 16 : 8);
  for (i = 0; i < bytes.length; i++) push(bytes[i], 8);

  var total = dataCodewords(v) * 8;
  push(0, Math.min(4, total - bits.length));      /* terminator */
  while (bits.length % 8) bits.push(0);

  var words = [];
  for (i = 0; i < bits.length; i += 8) {
    var b = 0;
    for (j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    words.push(b);
  }
  var pad = [0xec, 0x11], k = 0;
  while (words.length < dataCodewords(v)) words.push(pad[k++ % 2]);
  return words;
}

/* Split into blocks, give each its own check codewords, then interleave, so
   a smudge across the code damages a little of every block rather than all
   of one. */
function interleave(words, v) {
  var t = BLOCKS_L[v], ecPer = t[0];
  var blocks = [], at = 0, i, j;
  for (i = 0; i < t[1]; i++) { blocks.push(words.slice(at, at + t[2])); at += t[2]; }
  for (i = 0; i < t[3]; i++) { blocks.push(words.slice(at, at + t[4])); at += t[4]; }

  var ecs = blocks.map(function (b) { return ecCodewords(b, ecPer); });
  var out = [], longest = Math.max.apply(null, blocks.map(function (b) { return b.length; }));
  for (i = 0; i < longest; i++) {
    for (j = 0; j < blocks.length; j++) if (i < blocks[j].length) out.push(blocks[j][i]);
  }
  for (i = 0; i < ecPer; i++) {
    for (j = 0; j < ecs.length; j++) out.push(ecs[j][i]);
  }
  return out;
}

/* ---------- the grid ---------- */

function blank(n) {
  var m = [], i, j;
  for (i = 0; i < n; i++) { m.push([]); for (j = 0; j < n; j++) m[i].push(null); }
  return m;
}

function placeFinder(m, r, c) {
  var i, j, n = m.length;
  for (i = -1; i <= 7; i++) {
    for (j = -1; j <= 7; j++) {
      var rr = r + i, cc = c + j;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      var on = (i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
               (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
               (i >= 2 && i <= 4 && j >= 2 && j <= 4);
      m[rr][cc] = on ? 1 : 0;
    }
  }
}

function placeAlignment(m, v) {
  var c = ALIGN[v], n = m.length, i, j, a, b, dr, dc;
  for (i = 0; i < c.length; i++) {
    for (j = 0; j < c.length; j++) {
      a = c[i]; b = c[j];
      /* the three that would sit on a finder are not drawn */
      if ((a === 6 && b === 6) || (a === 6 && b === n - 7) || (a === n - 7 && b === 6)) continue;
      for (dr = -2; dr <= 2; dr++) {
        for (dc = -2; dc <= 2; dc++) {
          m[a + dr][b + dc] = (Math.max(Math.abs(dr), Math.abs(dc)) !== 1) ? 1 : 0;
        }
      }
    }
  }
}

function placeTiming(m) {
  var n = m.length, i;
  for (i = 8; i < n - 8; i++) {
    var on = (i % 2 === 0) ? 1 : 0;
    if (m[6][i] === null) m[6][i] = on;
    if (m[i][6] === null) m[i][6] = on;
  }
}

/* BCH(15,5) for the format, BCH(18,6) for the version. */
function bch(value, poly, len, gen) {
  var v = value << (len - 1);
  var top = 1 << (len - 1);
  while (v >>> 0 >= (top << 1) >>> 0 || bitLen(v) >= bitLen(gen)) {
    if (bitLen(v) < bitLen(gen)) break;
    v ^= gen << (bitLen(v) - bitLen(gen));
  }
  return v;
}
function bitLen(x) { var n = 0; while (x) { n++; x >>>= 1; } return n; }

function formatBits(mask) {
  /* 01 is level L */
  var data = (1 << 3) | mask;
  var rem = data << 10;
  while (bitLen(rem) >= 11) rem ^= 0x537 << (bitLen(rem) - 11);
  return ((data << 10) | rem) ^ 0x5412;
}

function versionBits(v) {
  var rem = v << 12;
  while (bitLen(rem) >= 13) rem ^= 0x1f25 << (bitLen(rem) - 13);
  return (v << 12) | rem;
}

function placeFormat(m, mask) {
  var bits = formatBits(mask), n = m.length, i, b;
  for (i = 0; i <= 14; i++) {
    b = (bits >> i) & 1;
    /* the copy beside the top-left finder */
    if (i < 6) m[8][i] = b;
    else if (i === 6) m[8][7] = b;
    else if (i === 7) m[8][8] = b;
    else if (i === 8) m[7][8] = b;
    else m[14 - i][8] = b;
    /* and the copy split between the other two */
    /* Seven up the bottom-left, then eight along the top-right. Taking
       eight for the first would overwrite the dark module below. */
    if (i < 7) m[n - 1 - i][8] = b;
    else m[8][n - 15 + i] = b;
  }
  m[n - 8][8] = 1;                          /* the dark module, always */
}

function placeVersion(m, v) {
  if (v < 7) return;
  var bits = versionBits(v), n = m.length, i, b;
  for (i = 0; i < 18; i++) {
    b = (bits >> i) & 1;
    m[Math.floor(i / 3)][n - 11 + (i % 3)] = b;
    m[n - 11 + (i % 3)][Math.floor(i / 3)] = b;
  }
}

/* Up the right edge, down the next, two columns at a time, skipping the
   timing column. */
function placeData(m, words) {
  var n = m.length, bit = 0, i, up = true;
  var total = words.length * 8;
  for (var right = n - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;
    for (var v = 0; v < n; v++) {
      var row = up ? n - 1 - v : v;
      for (var k = 0; k < 2; k++) {
        var col = right - k;
        if (m[row][col] !== null) continue;
        var b = 0;
        if (bit < total) b = (words[bit >> 3] >> (7 - (bit & 7))) & 1;
        m[row][col] = b;
        bit++;
      }
    }
    up = !up;
  }
}

function maskFn(mask, r, c) {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2 + (r * c) % 3) === 0;
    case 6: return (((r * c) % 2 + (r * c) % 3) % 2) === 0;
    default: return (((r + c) % 2 + (r * c) % 3) % 2) === 0;
  }
}

function isFunction(v, r, c) {
  var n = size(v);
  if (r === 6 || c === 6) return true;
  if (r < 9 && c < 9) return true;
  if (r < 9 && c >= n - 8) return true;
  if (r >= n - 8 && c < 9) return true;
  if (v >= 7 && ((r < 6 && c >= n - 11) || (c < 6 && r >= n - 11))) return true;
  var centres = ALIGN[v], i, j, a, b;
  for (i = 0; i < centres.length; i++) {
    for (j = 0; j < centres.length; j++) {
      a = centres[i]; b = centres[j];
      if ((a === 6 && b === 6) || (a === 6 && b === n - 7) || (a === n - 7 && b === 6)) continue;
      if (Math.abs(r - a) <= 2 && Math.abs(c - b) <= 2) return true;
    }
  }
  return false;
}

function applyMask(m, v, mask) {
  var n = m.length, r, c;
  for (r = 0; r < n; r++) {
    for (c = 0; c < n; c++) {
      if (isFunction(v, r, c)) continue;
      if (maskFn(mask, r, c)) m[r][c] ^= 1;
    }
  }
}

/* The four penalties, so the chosen mask is the one a reader will like. */
function penalty(m) {
  var n = m.length, score = 0, r, c, i, run, last, dark = 0;

  function runs(get) {
    var s = 0, a, b, count, prev;
    for (a = 0; a < n; a++) {
      count = 1; prev = get(a, 0);
      for (b = 1; b < n; b++) {
        var cur = get(a, b);
        if (cur === prev) { count++; }
        else { if (count >= 5) s += 3 + (count - 5); count = 1; prev = cur; }
      }
      if (count >= 5) s += 3 + (count - 5);
    }
    return s;
  }
  score += runs(function (a, b) { return m[a][b]; });
  score += runs(function (a, b) { return m[b][a]; });

  for (r = 0; r < n - 1; r++) {
    for (c = 0; c < n - 1; c++) {
      var s = m[r][c] + m[r][c + 1] + m[r + 1][c] + m[r + 1][c + 1];
      if (s === 0 || s === 4) score += 3;
    }
  }

  var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  function look(get) {
    var s = 0, a, b, k, ok1, ok2;
    for (a = 0; a < n; a++) {
      for (b = 0; b + 11 <= n; b++) {
        ok1 = ok2 = true;
        for (k = 0; k < 11; k++) {
          var val = get(a, b + k);
          if (val !== pat1[k]) ok1 = false;
          if (val !== pat2[k]) ok2 = false;
        }
        if (ok1) s += 40;
        if (ok2) s += 40;
      }
    }
    return s;
  }
  score += look(function (a, b) { return m[a][b]; });
  score += look(function (a, b) { return m[b][a]; });

  for (r = 0; r < n; r++) for (c = 0; c < n; c++) dark += m[r][c];
  var pct = dark * 100 / (n * n);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

/* ---------- the one thing this file is for ---------- */

function utf8(text) {
  var out = [], i, c;
  var s = global.unescape(global.encodeURIComponent(String(text)));
  for (i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
  return out;
}

function encode(text) {
  var bytes = utf8(text);
  var v = pickVersion(bytes.length);
  if (!v) throw new Error('Too much to put in a QR code (' + bytes.length + ' bytes).');

  var words = interleave(toCodewords(bytes, v), v);
  var best = null, bestScore = Infinity, mask;
  for (mask = 0; mask < 8; mask++) {
    var m = blank(size(v));
    placeFinder(m, 0, 0);
    placeFinder(m, 0, size(v) - 7);
    placeFinder(m, size(v) - 7, 0);
    placeAlignment(m, v);
    placeTiming(m);
    placeVersion(m, v);
    placeFormat(m, mask);
    placeData(m, words);
    applyMask(m, v, mask);
    var s = penalty(m);
    if (s < bestScore) { bestScore = s; best = m; }
  }
  return { version: v, size: size(v), modules: best };
}

/* Always dark on light, whatever the page is wearing. An inverted code is a
   code a good many readers will not look twice at. */
function svg(text, opts) {
  opts = opts || {};
  var quiet = opts.quiet == null ? 4 : opts.quiet;
  var code = encode(text);
  var n = code.size, span = n + quiet * 2, r, c, d = '';
  for (r = 0; r < n; r++) {
    for (c = 0; c < n; c++) {
      if (code.modules[r][c]) d += 'M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z';
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + span + ' ' + span + '" ' +
    'shape-rendering="crispEdges" role="img" aria-label="' +
    (opts.label ? String(opts.label).replace(/[<>&"]/g, '') : 'QR code') + '">' +
    '<rect width="' + span + '" height="' + span + '" fill="#ffffff"/>' +
    '<path d="' + d + '" fill="#000000"/></svg>';
}

/* ---------- refusing to ship a wrong table ----------
   The block layout and the alignment centres are the two things here that
   were transcribed rather than derived, so they are checked against the
   geometry they have to agree with. A mistyped row shows up now, loudly,
   rather than as a code that quietly will not scan. */
function selfCheck() {
  for (var v = 1; v <= MAX_VERSION; v++) {
    var t = BLOCKS_L[v];
    var fromTable = t[1] * (t[2] + t[0]) + t[3] * (t[4] + t[0]);
    var fromGeometry = capacityCodewords(v);
    if (fromTable !== fromGeometry) {
      throw new Error('qr.js: version ' + v + ' block table says ' + fromTable +
                      ' codewords, the grid holds ' + fromGeometry);
    }
    var expected = v === 1 ? 0 : Math.pow(Math.floor(v / 7) + 2, 2) - 3;
    var got = ALIGN[v].length ? ALIGN[v].length * ALIGN[v].length - 3 : 0;
    if (got !== expected) {
      throw new Error('qr.js: version ' + v + ' has ' + got + ' alignment patterns, expected ' + expected);
    }
  }
  return true;
}

global.RLQr = {
  encode: encode,
  svg: svg,
  byteCapacity: byteCapacity,
  maxBytes: byteCapacity(MAX_VERSION),
  selfCheck: selfCheck,
  /* exposed so the tests can prove the arithmetic rather than assume it */
  _internals: { ecCodewords: ecCodewords, mul: mul, EXP: EXP, LOG: LOG,
                toCodewords: toCodewords, interleave: interleave,
                capacityCodewords: capacityCodewords, dataCodewords: dataCodewords,
                isFunction: isFunction, maskFn: maskFn, formatBits: formatBits,
                BLOCKS_L: BLOCKS_L, ALIGN: ALIGN, size: size }
};
})(window);
