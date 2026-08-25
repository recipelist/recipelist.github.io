/* beam.js - the collection, cut into frames and sent by light.
   -----------------------------------------------------------
   There is no connection here and nothing to negotiate. The sending device
   puts the whole collection on its screen as a repeating loop of codes, and
   the receiving device reads them with its camera until it has them all.
   One direction only, which is exactly why nothing has to come back: no
   reply, no handshake, no server, and no network at all. This works with
   both devices in aeroplane mode.

   The loop repeats forever, so a frame missed on one pass is picked up on
   the next and the receiver simply waits for the gaps to fill. That is also
   why there is no error correction in the frames themselves: vcode carries a
   CRC, a bad frame is discarded, and the same frame comes round again in a
   second or two.

   What this cannot do is tell the sender when the receiver has finished,
   because there is no back channel to tell it with. The sending screen keeps
   showing its loop until a person stops it. That is the price of needing
   nothing from the far end. */
(function (global) {
'use strict';

var MAGIC = 0x52;          /* 'R' */
var VERSION = 1;
var HEAD = 8;              /* magic, version, id, index, total */

function headerFor(id, index, total) {
  return [MAGIC, VERSION, (id >> 8) & 0xff, id & 0xff,
          (index >> 8) & 0xff, index & 0xff, (total >> 8) & 0xff, total & 0xff];
}

function perFrame() {
  return global.RLVCode.capacity - HEAD;
}

/* Cut a payload into the frames that will be shown in a loop. */
function frames(bytes) {
  var per = perFrame();
  var total = Math.max(1, Math.ceil(bytes.length / per));
  if (total > 0xffff) throw new Error('That is too much to send this way.');
  var id = Math.floor(Math.random() * 0xffff);
  var out = [], i, at;
  for (i = 0; i < total; i++) {
    at = i * per;
    var chunk = bytes.subarray(at, Math.min(bytes.length, at + per));
    var frame = new Uint8Array(HEAD + chunk.length);
    frame.set(headerFor(id, i, total), 0);
    frame.set(chunk, HEAD);
    out.push(frame);
  }
  return { id: id, total: total, frames: out };
}

/* Gathers frames as they are read, in whatever order they arrive. */
function collector() {
  var id = null, total = 0, parts = {}, have = 0;

  return {
    /* Returns true once every frame is in. Anything that is not one of our
       frames is ignored rather than treated as an error: the loop also
       carries the link code, and a camera sees whatever is in front of it. */
    add: function (bytes) {
      if (!bytes || bytes.length < HEAD) return false;
      if (bytes[0] !== MAGIC || bytes[1] !== VERSION) return false;
      var fid = (bytes[2] << 8) | bytes[3];
      var index = (bytes[4] << 8) | bytes[5];
      var count = (bytes[6] << 8) | bytes[7];
      if (id === null) { id = fid; total = count; }
      /* A different sending device, or the same one restarted: begin again
         rather than gluing two collections together. */
      if (fid !== id || count !== total) {
        id = fid; total = count; parts = {}; have = 0;
      }
      if (index >= total) return false;
      if (!parts[index]) { parts[index] = bytes.subarray(HEAD); have++; }
      return have === total;
    },
    have: function () { return have; },
    total: function () { return total; },
    missing: function () {
      var out = [], i;
      for (i = 0; i < total; i++) if (!parts[i]) out.push(i);
      return out;
    },
    payload: function () {
      if (!total || have !== total) return null;
      var size = 0, i;
      for (i = 0; i < total; i++) size += parts[i].length;
      var out = new Uint8Array(size), at = 0;
      for (i = 0; i < total; i++) { out.set(parts[i], at); at += parts[i].length; }
      return out;
    }
  };
}

function deflate(text) {
  if (typeof global.CompressionStream !== 'function') return Promise.resolve(null);
  var s = new global.Blob([text]).stream().pipeThrough(new global.CompressionStream('deflate-raw'));
  return new global.Response(s).arrayBuffer().then(function (b) { return new Uint8Array(b); });
}

function inflate(bytes) {
  if (typeof global.DecompressionStream !== 'function') {
    return Promise.reject(new Error('This browser cannot read the transfer.'));
  }
  var s = new global.Blob([bytes]).stream().pipeThrough(new global.DecompressionStream('deflate-raw'));
  return new global.Response(s).text();
}

global.RLBeam = {
  frames: frames, collector: collector, perFrame: perFrame,
  deflate: deflate, inflate: inflate, HEAD: HEAD
};
})(window);
