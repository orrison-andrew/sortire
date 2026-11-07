/**
 * personal.js: Things that belong to this device and person, kept OUT of Settings:
 * a recorded winning sound and a winning message. They live in their own
 * localStorage keys, so they are never part of settings codes, saved tunings,
 * Shuffle or Reset.
 *
 *   Personal.getMessage()            -> { on, text }   (live object, safe to read every frame)
 *   Personal.setMessage(on, text)
 *   Personal.hasSound()              -> true if a recording is saved
 *   Personal.canRecord()             -> true if this browser can record
 *   Personal.isRecording()
 *   Personal.startRecording(cb)      cb(state, text): 'recording' | 'saved' | 'error'
 *   Personal.stopRecording()
 *   Personal.deleteSound()           back to the built-in chime
 *   Personal.init(cb)                load the saved recording (call once, after SoundManager)
 *
 * Needs SoundManager (sound.js).
 */
(function (root) {
  'use strict';

  var KEY_SOUND = 'sortire_personal_sound';
  var KEY_MSG = 'sortire_personal_message';
  var MAX_MS = 3000;          // recordings stop by themselves after 3 seconds
  var MAX_CHARS = 60;
  var MAX_DATA = 600000;      // characters of base64; a 3 s clip is far below this

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    remove: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  var message = { on: false, text: '' };
  var soundSaved = false;
  var rec = null;

  try {
    var m = JSON.parse(store.get(KEY_MSG));
    if (m) { message.on = !!m.on; message.text = String(m.text || '').slice(0, MAX_CHARS); }
  } catch (e) {}

  function setMessage(on, text) {
    message.on = !!on;
    message.text = String(text || '').slice(0, MAX_CHARS);
    store.set(KEY_MSG, JSON.stringify(message));
  }

  function init(done) {
    var url = store.get(KEY_SOUND);
    if (!url) { if (done) done(); return; }
    root.SoundManager.setCustomWinner(url).then(function (ok) {
      soundSaved = ok;
      if (!ok) store.remove(KEY_SOUND);   // unreadable: fall back to the chime
      if (done) done();
    });
  }

  function canRecord() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && root.MediaRecorder);
  }

  function pickType() {
    var types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
    for (var i = 0; i < types.length; i++) {
      try { if (root.MediaRecorder.isTypeSupported(types[i])) return types[i]; } catch (e) {}
    }
    return '';
  }

  function startRecording(cb) {
    if (rec || !canRecord()) return;
    rec = { stop: function () {} };   // claim the slot while the permission prompt is open
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var type = pickType();
      var opts = { audioBitsPerSecond: 32000 };
      if (type) opts.mimeType = type;
      var mr;
      try { mr = new MediaRecorder(stream, opts); } catch (e) { mr = new MediaRecorder(stream); }
      var chunks = [];
      var timer = 0;

      function fail(text) { rec = null; cb('error', text); }

      mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = function () {
        clearTimeout(timer);
        stream.getTracks().forEach(function (t) { t.stop(); });
        var blob = new Blob(chunks, { type: mr.mimeType || type || 'audio/webm' });
        if (!blob.size) return fail('Nothing was recorded.');
        var fr = new FileReader();
        fr.onload = function () {
          var url = String(fr.result);
          if (url.length > MAX_DATA) return fail('That recording is too big. Try a shorter one.');
          root.SoundManager.setCustomWinner(url).then(function (ok) {
            if (!ok) return fail('This browser couldn\u2019t play that recording.');
            if (!store.set(KEY_SOUND, url)) {
              root.SoundManager.clearCustomWinner();
              soundSaved = false;
              return fail('Couldn\u2019t save it (storage is full or blocked).');
            }
            soundSaved = true;
            rec = null;
            cb('saved');
          });
        };
        fr.onerror = function () { fail('Couldn\u2019t read the recording.'); };
        fr.readAsDataURL(blob);
      };

      rec = { stop: function () { if (mr.state !== 'inactive') mr.stop(); } };
      mr.start();
      timer = setTimeout(function () { if (rec) rec.stop(); }, MAX_MS);
      cb('recording');
    }).catch(function (err) {
      rec = null;
      var denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      cb('error', denied ? 'Microphone access was blocked. Allow it in your browser settings.' : 'Couldn\u2019t start the microphone.');
    });
  }

  function stopRecording() { if (rec) rec.stop(); }

  function deleteSound() {
    store.remove(KEY_SOUND);
    soundSaved = false;
    root.SoundManager.clearCustomWinner();
  }

  root.Personal = {
    MAX_CHARS: MAX_CHARS,
    MAX_SECONDS: MAX_MS / 1000,
    init: init,
    getMessage: function () { return message; },
    setMessage: setMessage,
    hasSound: function () { return soundSaved; },
    canRecord: canRecord,
    isRecording: function () { return !!rec; },
    startRecording: startRecording,
    stopRecording: stopRecording,
    deleteSound: deleteSound
  };
})(typeof window !== 'undefined' ? window : this);
