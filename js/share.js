/* share.js - sending your recipes straight to another device.
   -----------------------------------------------------------
   This is the PairDrop idea with the one piece PairDrop has that a site on
   GitHub Pages cannot have: a server.

   What a server buys PairDrop is *discovery*. Its devices find each other
   because each one holds a WebSocket open to pairdrop.net, which groups them
   by the public IP they arrived from and passes the WebRTC handshake between
   them. None of that is possible here, and not for want of trying: a page
   cannot open a UDP socket, cannot listen for a connection, cannot ask mDNS
   anything, and is not even told its own address on the network (Chrome hands
   out an obfuscated `<uuid>.local` ICE candidate precisely so that a page
   cannot enumerate the LAN). BroadcastChannel is one browser on one machine.
   There is no arrangement of those parts that finds another device by itself.

   What *is* possible is everything after discovery. Two browsers can talk
   directly over WebRTC once they have swapped a handshake, and the handshake
   is small: about 780 characters each way. So the person is the signalling
   server. You carry one code across and one code back, by whatever you
   already use to send a line of text between your own devices, and from then
   on the recipes go straight from one browser to the other and touch nothing
   in between.

   The honest shape of the trade: if you can move 780 characters, you could
   have moved the file. This earns its place when the cookbook is large (the
   handshake stays 780 characters whether you send one recipe or four hundred)
   and when file handling is the annoying part, which on a phone it usually
   is. It is not magic, and it is not PairDrop. It is the part of PairDrop
   that works without anyone running a server. */
(function (global) {
'use strict';

/* 16KB is under every implementation's maximum message size. */
var CHUNK = 16 * 1024;
/* One byte in front of every message, so a chunk that happens to look like a
   header or a terminator cannot be mistaken for one. */
var HEAD = 'H', DATA = 'D', END = 'E';
var OPEN_TIMEOUT = 45000;

function supported() {
  return typeof global.RTCPeerConnection === 'function';
}

/* No STUN and no TURN. Both devices are on one network, which is the whole
   premise, so the host candidate is the one that matters; asking a STUN
   server would tell a third party that this is happening and would not help
   the case this is for. */
function peer() {
  return new global.RTCPeerConnection({ iceServers: [] });
}

/* An SDP is worth gathering in full before it is handed over: with no
   trickle channel to send later candidates through, whatever is in the blob
   is all the other side will ever know. */
function gathered(pc) {
  return new Promise(function (resolve) {
    if (pc.iceGatheringState === 'complete') return resolve();
    var t = setTimeout(resolve, 5000);      /* a slow interface must not hang the pairing */
    pc.addEventListener('icegatheringstatechange', function () {
      if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); }
    });
  });
}

/* ---------- the code the user carries ----------
   Deflated where the browser can, plain where it cannot, with the marker
   saying which so a code made on one device is read correctly on the other
   even when the two browsers do not agree about CompressionStream. */

/* base64url rather than base64: a code goes into a link as it stands, with
   no escaping to inflate it and nothing for a mail client to mangle. */
function b64url(s) {
  return global.btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s) {
  var t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return global.atob(t);
}

function bytesToB64(bytes) {
  var s = '', i;
  for (i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return b64url(s);
}

function b64ToBytes(b64) {
  var s = unb64url(b64), out = new Uint8Array(s.length), i;
  for (i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/* The reply goes into a visual code as bytes, so it never becomes text at
   all. Fewer bytes means fatter squares on the screen and an easier read. */
function deflate(sdp) {
  if (typeof global.CompressionStream !== 'function') {
    return Promise.resolve(null);
  }
  var stream = new global.Blob([sdp]).stream().pipeThrough(new global.CompressionStream('deflate-raw'));
  return new global.Response(stream).arrayBuffer().then(function (buf) {
    return new Uint8Array(buf);
  }).catch(function () { return null; });
}

function inflate(bytes) {
  if (typeof global.DecompressionStream !== 'function') return Promise.reject(damaged());
  var stream = new global.Blob([bytes]).stream()
    .pipeThrough(new global.DecompressionStream('deflate-raw'));
  return new global.Response(stream).text().then(checkSdp, function () { throw damaged(); });
}

function encode(sdp) {
  if (typeof global.CompressionStream !== 'function') {
    return Promise.resolve('R0' + b64url(sdp));
  }
  var stream = new global.Blob([sdp]).stream().pipeThrough(new global.CompressionStream('deflate-raw'));
  return new global.Response(stream).arrayBuffer().then(function (buf) {
    return 'R1' + bytesToB64(new Uint8Array(buf));
  }).catch(function () {
    return 'R0' + b64url(sdp);
  });
}

function decode(code) {
  var body = String(code).replace(/\s+/g, '');
  var mark = body.slice(0, 2);
  body = body.slice(2);
  if (mark === 'R0') {
    try { return Promise.resolve(checkSdp(unb64url(body))); }
    catch (e) { return Promise.reject(damaged()); }
  }
  if (mark !== 'R1') return Promise.reject(new Error('That does not look like a code from this app.'));
  if (typeof global.DecompressionStream !== 'function') {
    return Promise.reject(new Error('This browser cannot read a compressed code. Send from this device instead.'));
  }
  var bytes;
  try { bytes = b64ToBytes(body); }
  catch (e) { return Promise.reject(damaged()); }
  var stream = new global.Blob([bytes]).stream()
    .pipeThrough(new global.DecompressionStream('deflate-raw'));
  /* A half-copied code fails deep inside the decompressor, where the error
     says "Failed to fetch" and means nothing to anyone. */
  return new global.Response(stream).text().then(checkSdp, function () { throw damaged(); });
}

function damaged() {
  return new Error('That code is incomplete. Copy the whole of it, from beginning to end, and try again.');
}

/* Every SDP starts "v=0". Anything else and setRemoteDescription throws
   something even less helpful than the code that got us here. */
function checkSdp(text) {
  if (String(text).slice(0, 3) !== 'v=0') throw damaged();
  return text;
}

/* ---------- moving the payload ----------
   Ordered and reliable, so the far side can simply glue the chunks back
   together in the order they arrive. */

function sendPayload(ch, text, onProgress) {
  var chunks = [], i;
  for (i = 0; i < text.length; i += CHUNK) chunks.push(text.slice(i, i + CHUNK));
  ch.send(HEAD + JSON.stringify({ bytes: text.length, chunks: chunks.length }));

  return new Promise(function (resolve, reject) {
    var at = 0;
    function pump() {
      try {
        while (at < chunks.length) {
          /* Handing the whole cookbook over in one loop can outrun the
             channel. Stop at a megabyte in flight and pick up again when it
             has drained. */
          if (ch.bufferedAmount > 1048576) {
            ch.bufferedAmountLowThreshold = 262144;
            ch.onbufferedamountlow = function () { ch.onbufferedamountlow = null; pump(); };
            return;
          }
          ch.send(DATA + chunks[at]);
          at++;
          if (onProgress) onProgress(at, chunks.length);
        }
        ch.send(END);
        resolve(text.length);
      } catch (err) { reject(err); }
    }
    pump();
  });
}

function receivePayload(ch, handlers) {
  var parts = [], expected = 0, seen = 0;
  ch.onmessage = function (e) {
    var msg = typeof e.data === 'string' ? e.data : '';
    var tag = msg.charAt(0), body = msg.slice(1);
    if (tag === HEAD) {
      try { expected = JSON.parse(body).chunks || 0; } catch (err) { expected = 0; }
      if (handlers.onstatus) handlers.onstatus('Receiving…');
      return;
    }
    if (tag === DATA) {
      parts.push(body);
      seen++;
      if (handlers.onprogress) handlers.onprogress(seen, expected);
      return;
    }
    if (tag === END && handlers.ondata) handlers.ondata(parts.join(''));
  };
}

function waitOpen(ch) {
  return new Promise(function (resolve, reject) {
    if (ch.readyState === 'open') return resolve();
    var t = setTimeout(function () {
      reject(new Error('No answer from the other device. Both need this page open, on the same network.'));
    }, OPEN_TIMEOUT);
    ch.addEventListener('open', function () { clearTimeout(t); resolve(); });
    ch.addEventListener('error', function () { clearTimeout(t); reject(new Error('The connection failed.')); });
  });
}

/* ---------- the two sides ----------
   Each returns an object the page drives, rather than running the whole
   exchange itself, because between the two steps is a human walking a code
   from one device to the other and that can take as long as it takes. */

function startSend(getPayload, handlers) {
  handlers = handlers || {};
  var pc = peer();
  var ch = pc.createDataChannel('recipes', { ordered: true });
  var live = true;

  pc.addEventListener('connectionstatechange', function () {
    if (!live) return;
    if (pc.connectionState === 'failed' && handlers.onerror) {
      handlers.onerror(new Error('The two devices could not reach each other. Some networks stop devices talking directly; a phone hotspot usually works.'));
    }
  });

  var codePromise = pc.createOffer().then(function (offer) {
    return pc.setLocalDescription(offer);
  }).then(function () {
    return gathered(pc);
  }).then(function () {
    return encode(pc.localDescription.sdp);
  });

  return {
    code: function () { return codePromise; },
    /* Step two, by camera: the reply arrives as bytes off the other screen. */
    replyBytes: function (bytes) {
      return inflate(bytes).then(function (sdp) {
        return pc.setRemoteDescription({ type: 'answer', sdp: sdp });
      });
    },
    open: function () { return waitOpen(ch); },
    send: function (text) { return sendPayload(ch, text, handlers.onprogress); },
    /* Step two: the reply code comes back from the other device. */
    reply: function (replyCode) {
      return decode(replyCode).then(function (sdp) {
        return pc.setRemoteDescription({ type: 'answer', sdp: sdp });
      }).then(function () {
        if (handlers.onstatus) handlers.onstatus('Connecting…');
        return waitOpen(ch);
      }).then(function () {
        if (handlers.onstatus) handlers.onstatus('Sending…');
        return sendPayload(ch, getPayload(), handlers.onprogress);
      });
    },
    close: function () { live = false; try { pc.close(); } catch (e) {} }
  };
}

function startReceive(handlers) {
  handlers = handlers || {};
  var pc = peer();
  var live = true;

  pc.addEventListener('datachannel', function (e) {
    receivePayload(e.channel, handlers);
  });
  pc.addEventListener('connectionstatechange', function () {
    if (!live) return;
    if (pc.connectionState === 'failed' && handlers.onerror) {
      handlers.onerror(new Error('The two devices could not reach each other. Some networks stop devices talking directly; a phone hotspot usually works.'));
    }
  });

  return {
    /* The reply as bytes for the visual code, rather than as something to
       read out or paste. */
    replyBytes: function () { return deflate(pc.localDescription.sdp); },
    /* Step one: the invite code arrives from the other device, and the reply
       code goes back. */
    offer: function (offerCode) {
      return decode(offerCode).then(function (sdp) {
        return pc.setRemoteDescription({ type: 'offer', sdp: sdp });
      }).then(function () {
        return pc.createAnswer();
      }).then(function (answer) {
        return pc.setLocalDescription(answer);
      }).then(function () {
        return gathered(pc);
      }).then(function () {
        return encode(pc.localDescription.sdp);
      });
    },
    close: function () { live = false; try { pc.close(); } catch (e) {} }
  };
}

global.RLShare = {
  supported: supported,
  startSend: startSend,
  startReceive: startReceive,
  encode: encode,
  decode: decode
};
})(window);
