/* scan.js - pointing the camera at the other device's screen.
   ----------------------------------------------------------
   Opens a viewfinder, reads frames, and hands each one to RLVCode until one
   of them checksums. Nothing here needs to be clever, because the format was
   designed so that the reader would not have to be: a frame is either right
   or it is dropped, and the next arrives in a thirtieth of a second. */
(function (global) {
'use strict';

/* Frames are scaled down before decoding. The finder search walks every row,
   so full resolution costs far more than it buys; 480 across still leaves a
   code that fills a decent part of the frame at five or six pixels a square. */
var WORK_WIDTH = 480;

function supported() {
  return !!(global.navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
         !!global.RLVCode;
}

/* Resolves with the decoded bytes, or rejects if the camera is refused or
   the user backs out. */
function scan(host, handlers) {
  handlers = handlers || {};
  var video = document.createElement('video');
  video.setAttribute('playsinline', '');      /* iOS will not inline without it */
  video.muted = true;
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d', { willReadFrequently: true });
  var stream = null, raf = 0, stopped = false;

  host.appendChild(video);

  var done, failed;
  var result = new Promise(function (resolve, reject) { done = resolve; failed = reject; });

  function stop() {
    if (stopped) return;
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    if (video.parentNode) video.parentNode.removeChild(video);
  }

  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  }).then(function (s) {
    stream = s;
    video.srcObject = s;
    return video.play();
  }).then(function () {
    if (handlers.onstart) handlers.onstart();
    tick();
  }).catch(function (err) {
    stop();
    failed(new Error(err && err.name === 'NotAllowedError'
      ? 'The camera was not allowed. Allow it for this site, or use the written code instead.'
      : 'No camera available on this device.'));
  });

  var frames = 0;
  function tick() {
    if (stopped) return;
    raf = requestAnimationFrame(tick);
    if (video.readyState < 2 || !video.videoWidth) return;

    var scale = Math.min(1, WORK_WIDTH / video.videoWidth);
    var w = Math.round(video.videoWidth * scale), h = Math.round(video.videoHeight * scale);
    if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
    ctx.drawImage(video, 0, 0, w, h);

    var img;
    try { img = ctx.getImageData(0, 0, w, h); } catch (e) { return; }
    frames++;
    if (handlers.onframe && frames % 15 === 0) handlers.onframe(frames);

    var bytes = null;
    try { bytes = RLVCode.decode(img); } catch (e) { bytes = null; }
    if (bytes) { stop(); done(bytes); }
  }

  return { result: result, cancel: function () { stop(); failed(new Error('cancelled')); } };
}

global.RLScan = { supported: supported, scan: scan };
})(window);
