/* vcode.js - the reply code, and the reader for it.
   -------------------------------------------------
   The invite is a real QR, because the device that reads it is a phone using
   the camera app it came with, and that app only knows standard formats.
   The reply travels the other way: from the receiver's screen into *this*
   page, through a camera this code drives. Nothing standard has to read it,
   so it does not have to be a QR, and a QR is the wrong shape of problem to
   take on: reading one means Reed-Solomon correction, format recovery and
   five mask patterns, all to survive damage that a screen a foot away does
   not inflict.

   What a screen does inflict is perspective, blur, glare and noise, and none
   of those need error correction to beat. They need geometry, and they need
   the good sense to throw a bad frame away. A camera hands over thirty
   frames a second; exactly one has to be clean. So this format carries a
   CRC and no correction at all: a frame either checksums or it is dropped,
   and the next one is along in 33 milliseconds. That single decision is what
   makes a hand-written reader a reasonable thing to write.

   The layout is fixed, which removes the other half of the work. Always 64
   squares across. Four finders in the corners, each the 1:1:3:1:1 bullseye
   that run-length detection was invented for, at known grid positions, which
   gives four point correspondences and therefore the homography. No version
   to determine, no format block to read first, nothing to negotiate. And
   because the four finders are identical the orientation is ambiguous, which
   costs nothing: try all four rotations and keep whichever one checksums. */
(function (global) {
'use strict';

var SIZE = 64;          /* squares across, always */
var FIN = 7;            /* finder is 7x7 */
var QUIET = 2;

/* finder centres, in grid coordinates */
var CORNERS = [
  [FIN / 2, FIN / 2],
  [SIZE - FIN / 2, FIN / 2],
  [SIZE - FIN / 2, SIZE - FIN / 2],
  [FIN / 2, SIZE - FIN / 2]
];

/* ---------- CRC32, the whole error strategy ---------- */
var CRC_TABLE = (function () {
  var t = new Uint32Array(256), i, j, c;
  for (i = 0; i < 256; i++) {
    c = i;
    for (j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  var c = 0xffffffff, i;
  for (i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------- where a cell is, and whether it is structure ---------- */

function isFinder(x, y) {
  return (x < FIN && y < FIN) || (x >= SIZE - FIN && y < FIN) ||
         (x < FIN && y >= SIZE - FIN) || (x >= SIZE - FIN && y >= SIZE - FIN);
}

/* One square of separator round each finder, so a finder never touches data
   and its run lengths stay clean. */
function isReserved(x, y) {
  return (x <= FIN && y <= FIN) || (x >= SIZE - FIN - 1 && y <= FIN) ||
         (x <= FIN && y >= SIZE - FIN - 1) || (x >= SIZE - FIN - 1 && y >= SIZE - FIN - 1);
}

function finderPixel(dx, dy) {
  var d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
  return (d === 0 || d === 1 || d === 3) ? 1 : 0;   /* 3x3 core, ring, outer edge */
}

/* A fixed scramble, so a run of zero bytes does not become a field of white
   that the threshold has nothing to bite on. */
function maskBit(i) {
  var x = (i * 1103515245 + 12345) & 0x7fffffff;
  return (x >>> 16) & 1;
}

function capacityBits() {
  var n = 0, x, y;
  for (y = 0; y < SIZE; y++) for (x = 0; x < SIZE; x++) if (!isReserved(x, y)) n++;
  return n;
}

var CAPACITY_BYTES = Math.floor(capacityBits() / 8) - 6;   /* 2 length + 4 crc */

/* ---------- making one ---------- */

function encode(bytes) {
  if (bytes.length > CAPACITY_BYTES) {
    throw new Error('reply is ' + bytes.length + ' bytes, the code holds ' + CAPACITY_BYTES);
  }
  var body = [bytes.length >> 8 & 0xff, bytes.length & 0xff];
  var i;
  for (i = 0; i < bytes.length; i++) body.push(bytes[i]);
  var c = crc32(body);
  body.push(c >>> 24 & 0xff, c >>> 16 & 0xff, c >>> 8 & 0xff, c & 0xff);

  var bits = [];
  for (i = 0; i < body.length; i++) {
    for (var b = 7; b >= 0; b--) bits.push((body[i] >> b) & 1);
  }

  var grid = [], x, y;
  for (y = 0; y < SIZE; y++) { grid.push([]); for (x = 0; x < SIZE; x++) grid[y].push(0); }

  /* the four finders */
  CORNERS.forEach(function (c2) {
    var ox = Math.floor(c2[0] - FIN / 2), oy = Math.floor(c2[1] - FIN / 2);
    for (var dy = 0; dy < FIN; dy++) for (var dx = 0; dx < FIN; dx++) {
      grid[oy + dy][ox + dx] = finderPixel(dx, dy);
    }
  });

  var at = 0;
  for (y = 0; y < SIZE; y++) {
    for (x = 0; x < SIZE; x++) {
      if (isReserved(x, y)) continue;
      var v = at < bits.length ? bits[at] : 0;
      grid[y][x] = v ^ maskBit(at);
      at++;
    }
  }
  return grid;
}

/* ---------- reading one ----------
   Grey, threshold, find the four bullseyes, undo the perspective, sample,
   try four rotations, keep whatever checksums. */

function grey(img) {
  var g = new Uint8ClampedArray(img.width * img.height), d = img.data, i, p;
  for (i = 0, p = 0; p < g.length; i += 4, p++) {
    g[p] = (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8;
  }
  return g;
}

/* One cut for the whole picture cannot survive a lamp in one corner: the
   bright side goes all-paper and takes a finder with it. So the cut is made
   per block against that block's own neighbourhood, which is what a glare
   gradient needs, and a block with nothing in it borrows from its
   neighbours rather than inventing an edge out of sensor noise. */
function binarize(g, w, h) {
  var B = 16;
  var bw = Math.max(1, Math.ceil(w / B)), bh = Math.max(1, Math.ceil(h / B));
  var point = new Float32Array(bw * bh);
  var bx, by, x, y;

  for (by = 0; by < bh; by++) {
    for (bx = 0; bx < bw; bx++) {
      var sum = 0, n = 0, lo = 255, hi = 0;
      for (y = by * B; y < Math.min(h, (by + 1) * B); y++) {
        for (x = bx * B; x < Math.min(w, (bx + 1) * B); x++) {
          var v = g[y * w + x];
          sum += v; n++;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      var t;
      if (hi - lo > 24) {
        t = sum / n;                    /* the block has ink and paper in it */
      } else {
        /* Nothing but background. Half the darkest pixel puts the cut below
           everything present, so the block comes out white instead of being
           split down the middle and turned into speckle, which is what
           drowns the finder search. */
        t = lo / 2;
        if (by > 0 && bx > 0) {
          var near = (point[(by - 1) * bw + bx] + 2 * point[by * bw + bx - 1] +
                      point[(by - 1) * bw + bx - 1]) / 4;
          if (lo < near) t = near;
        }
      }
      point[by * bw + bx] = t;
    }
  }

  /* Smooth over a 5x5 of blocks, so the cut drifts with the light rather
     than stepping at every block edge. */
  var bin = new Uint8Array(w * h);
  for (by = 0; by < bh; by++) {
    for (bx = 0; bx < bw; bx++) {
      var x0 = Math.min(Math.max(bx, 2), bw - 3), y0 = Math.min(Math.max(by, 2), bh - 3);
      var acc = 0, dy, dx;
      for (dy = -2; dy <= 2; dy++) {
        for (dx = -2; dx <= 2; dx++) acc += point[(y0 + dy) * bw + (x0 + dx)];
      }
      var cut = acc / 25;
      for (y = by * B; y < Math.min(h, (by + 1) * B); y++) {
        for (x = bx * B; x < Math.min(w, (bx + 1) * B); x++) {
          bin[y * w + x] = g[y * w + x] < cut ? 1 : 0;
        }
      }
    }
  }
  return bin;
}

function otsu(g) {
  var t = threshold(g), bin = new Uint8Array(g.length), i;
  for (i = 0; i < g.length; i++) bin[i] = g[i] < t ? 1 : 0;
  return bin;
}

/* One cut for the whole picture: steadier on a soft frame, hopeless on an
   unevenly lit one, which is why both are tried. */
function threshold(g) {
  var hist = new Uint32Array(256), i;
  for (i = 0; i < g.length; i++) hist[g[i]]++;
  var total = g.length, sum = 0;
  for (i = 0; i < 256; i++) sum += i * hist[i];
  var sumB = 0, wB = 0, best = 0, bestT = 128;
  for (i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    var wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    var mB = sumB / wB, mF = (sum - sumB) / wF;
    var between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; bestT = i; }
  }
  return bestT;
}

/* The 1:1:3:1:1 run, the reason the corners look like that. */
function ratioOk(runs) {
  var total = runs[0] + runs[1] + runs[2] + runs[3] + runs[4];
  if (total < 7) return false;
  var unit = total / 7, tol = unit * 0.6;
  return Math.abs(runs[0] - unit) < tol && Math.abs(runs[1] - unit) < tol &&
         Math.abs(runs[2] - unit * 3) < tol * 2 && Math.abs(runs[3] - unit) < tol &&
         Math.abs(runs[4] - unit) < tol;
}

/* Walk out from a point along one axis, measuring the five runs of the
   bullseye, and give back the centre if they are in proportion. A finder
   found on a horizontal scan is only a candidate until the vertical agrees,
   which is what keeps a code that is not square to the camera readable: a
   horizontal slice through a tilted bullseye has the wrong proportions on
   its own, but the two axes together still cross at the middle. */
function crossCheck(bin, w, h, cx, cy, vertical) {
  var runs = [0, 0, 0, 0, 0];
  var maxI = vertical ? h : w;
  function at(i) { return vertical ? bin[i * w + cx] : bin[cy * w + i]; }
  var start = vertical ? cy : cx;
  if (!at(start)) return -1;

  var i = start;
  while (i >= 0 && at(i)) { runs[2]++; i--; }
  while (i >= 0 && !at(i)) { runs[1]++; i--; }
  while (i >= 0 && at(i)) { runs[0]++; i--; }
  var lowEnd = i;

  i = start + 1;
  while (i < maxI && at(i)) { runs[2]++; i++; }
  while (i < maxI && !at(i)) { runs[3]++; i++; }
  while (i < maxI && at(i)) { runs[4]++; i++; }
  var highEnd = i;

  if (!runs[0] || !runs[1] || !runs[3] || !runs[4]) return -1;
  if (!ratioOk(runs)) return -1;
  /* the centre of the middle run, which is the centre of the bullseye */
  return (lowEnd + runs[0] + runs[1] + runs[2] / 2 + 0.5);
}

function findCandidates(bin, w, h) {
  var hits = [], x, y;
  for (y = 0; y < h; y++) {
    var runs = [0, 0, 0, 0, 0], state = 0, last = 0;
    for (x = 0; x < w; x++) {
      var v = bin[y * w + x];
      if (x === 0) { last = v; runs[0] = 1; state = 0; continue; }
      if (v === last) { runs[state]++; }
      else {
        if (state < 4) { state++; runs[state] = 1; }
        else {
          if (last === 1 && ratioOk(runs)) {
            var span = runs[0] + runs[1] + runs[2] + runs[3] + runs[4];
            var cx = Math.round(x - runs[4] - runs[3] - runs[2] / 2);
            /* confirm down the other axis, and take the centre from it */
            var cyR = crossCheck(bin, w, h, cx, y, true);
            if (cyR >= 0) {
              var cxR = crossCheck(bin, w, h, cx, Math.round(cyR), false);
              if (cxR >= 0) hits.push({ x: cxR, y: cyR, size: span / 7 });
            }
          }
          runs = [runs[1], runs[2], runs[3], runs[4], 1];
          state = 4;
        }
        last = v;
      }
    }
  }
  return hits;
}

/* Rows alone give many hits down one finder; collapse them. */
function cluster(hits) {
  var groups = [];
  hits.forEach(function (p) {
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (Math.abs(g.x - p.x) < g.size * 1.5 && Math.abs(g.y - p.y) < g.size * 1.5) {
        g.x = (g.x * g.n + p.x) / (g.n + 1);
        g.y = (g.y * g.n + p.y) / (g.n + 1);
        g.size = (g.size * g.n + p.size) / (g.n + 1);
        g.n++;
        return;
      }
    }
    groups.push({ x: p.x, y: p.y, size: p.size, n: 1 });
  });
  return groups.filter(function (g) { return g.n >= 2; });
}

/* Four points, ordered round the quad, from however many survived. */
function pickQuad(groups) {
  if (groups.length < 4) return null;
  groups = groups.slice().sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
  var cx = 0, cy = 0;
  groups.forEach(function (g) { cx += g.x; cy += g.y; });
  cx /= groups.length; cy /= groups.length;
  var byAngle = groups.slice().sort(function (a, b) {
    return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
  });
  if (byAngle.length === 4) return byAngle;
  /* more than four: keep the four furthest from the centre, still in order */
  var far = groups.slice().sort(function (a, b) {
    return ((b.x - cx) * (b.x - cx) + (b.y - cy) * (b.y - cy)) -
           ((a.x - cx) * (a.x - cx) + (a.y - cy) * (a.y - cy));
  }).slice(0, 4);
  return far.sort(function (a, b) {
    return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
  });
}

/* Solve the 8 unknowns of a homography from four correspondences. */
function homography(src, dst) {
  var a = [], b = [], i;
  for (i = 0; i < 4; i++) {
    var sx = src[i][0], sy = src[i][1], dx = dst[i][0], dy = dst[i][1];
    a.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]); b.push(dx);
    a.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]); b.push(dy);
  }
  /* Gaussian elimination with partial pivoting */
  var n = 8, j, k;
  for (i = 0; i < n; i++) {
    var piv = i;
    for (k = i + 1; k < n; k++) if (Math.abs(a[k][i]) > Math.abs(a[piv][i])) piv = k;
    if (Math.abs(a[piv][i]) < 1e-9) return null;
    var tmp = a[i]; a[i] = a[piv]; a[piv] = tmp;
    var tb = b[i]; b[i] = b[piv]; b[piv] = tb;
    for (k = i + 1; k < n; k++) {
      var f = a[k][i] / a[i][i];
      for (j = i; j < n; j++) a[k][j] -= f * a[i][j];
      b[k] -= f * b[i];
    }
  }
  var h = new Array(n);
  for (i = n - 1; i >= 0; i--) {
    var s = b[i];
    for (j = i + 1; j < n; j++) s -= a[i][j] * h[j];
    h[i] = s / a[i][i];
  }
  h.push(1);
  return h;
}

function project(h, x, y) {
  var d = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d];
}

function readGrid(bin, w, h, quadPts, rotation) {
  var dst = [];
  for (var i = 0; i < 4; i++) dst.push(CORNERS[(i + rotation) % 4]);
  var hm = homography(dst, quadPts);
  if (!hm) return null;

  var grid = [], x, y;
  for (y = 0; y < SIZE; y++) {
    grid.push([]);
    for (x = 0; x < SIZE; x++) {
      /* majority of a small cross, so one stray pixel cannot flip a cell */
      var on = 0, seen = 0;
      var offs = [[0.5, 0.5], [0.3, 0.5], [0.7, 0.5], [0.5, 0.3], [0.5, 0.7]];
      for (var o = 0; o < offs.length; o++) {
        var p = project(hm, x + offs[o][0], y + offs[o][1]);
        var px = Math.round(p[0]), py = Math.round(p[1]);
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        seen++;
        on += bin[py * w + px];
      }
      if (!seen) return null;
      grid[y].push(on * 2 > seen ? 1 : 0);
    }
  }
  return grid;
}

function gridToBytes(grid) {
  var bits = [], x, y, at = 0;
  for (y = 0; y < SIZE; y++) {
    for (x = 0; x < SIZE; x++) {
      if (isReserved(x, y)) continue;
      bits.push(grid[y][x] ^ maskBit(at));
      at++;
    }
  }
  var bytes = [], i, j;
  for (i = 0; i + 8 <= bits.length; i += 8) {
    var v = 0;
    for (j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    bytes.push(v);
  }
  var len = (bytes[0] << 8) | bytes[1];
  if (len < 1 || len + 6 > bytes.length) return null;
  var body = bytes.slice(0, 2 + len);
  var want = ((bytes[2 + len] << 24) | (bytes[3 + len] << 16) |
              (bytes[4 + len] << 8) | bytes[5 + len]) >>> 0;
  if (crc32(body) !== want) return null;
  return new Uint8Array(bytes.slice(2, 2 + len));
}

/* Returns the bytes, or null for "not this frame, try the next one". */
function decode(img) {
  var w = img.width, h = img.height;
  var g = grey(img);

  /* Two ways of deciding what is ink, tried in turn. The local cut is what
     survives a lamp in one corner; the single global cut is steadier when
     the picture is soft, because a blurred edge inside one block can drag
     that block's own threshold across it. Neither wins everywhere, and
     trying the second costs one frame of a stream that has thirty a
     second. */
  var attempts = [binarize(g, w, h), otsu(g)];

  for (var a = 0; a < attempts.length; a++) {
    var bin = attempts[a];
    var quad = pickQuad(cluster(findCandidates(bin, w, h)));
    if (!quad) continue;
    var pts = quad.map(function (p) { return [p.x, p.y]; });
    for (var rot = 0; rot < 4; rot++) {
      var grid = readGrid(bin, w, h, pts, rot);
      if (!grid) continue;
      var out = gridToBytes(grid);
      if (out) return out;
    }
  }
  return null;
}

/* ---------- drawing ---------- */

function draw(ctx, grid, pixel) {
  var span = (SIZE + QUIET * 2) * pixel;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, span, span);
  ctx.fillStyle = '#000';
  for (var y = 0; y < SIZE; y++) {
    for (var x = 0; x < SIZE; x++) {
      if (grid[y][x]) ctx.fillRect((x + QUIET) * pixel, (y + QUIET) * pixel, pixel, pixel);
    }
  }
}

function svg(bytes) {
  var grid = encode(bytes), span = SIZE + QUIET * 2, d = '', x, y;
  for (y = 0; y < SIZE; y++) {
    for (x = 0; x < SIZE; x++) {
      if (grid[y][x]) d += 'M' + (x + QUIET) + ' ' + (y + QUIET) + 'h1v1h-1z';
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + span + ' ' + span + '" ' +
    'shape-rendering="crispEdges" stroke="none" fill="none" role="img" aria-label="Reply code">' +
    '<rect width="' + span + '" height="' + span + '" fill="#ffffff" stroke="none"/>' +
    '<path d="' + d + '" fill="#000000" stroke="none"/></svg>';
}

global.RLVCode = {
  SIZE: SIZE, QUIET: QUIET, capacity: CAPACITY_BYTES,
  encode: encode, decode: decode, draw: draw, svg: svg, crc32: crc32,
  _internals: { threshold: threshold, binarize: binarize, findCandidates: findCandidates, cluster: cluster,
                pickQuad: pickQuad, homography: homography, isReserved: isReserved,
                gridToBytes: gridToBytes, readGrid: readGrid }
};
})(window);
