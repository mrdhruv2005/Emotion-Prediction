/* ============================================================
   Six Channels — client for the FastAPI BiGRU emotion model
   Endpoints used:  GET /health   POST /predict
   ============================================================ */

(function () {
  'use strict';

  /* ---------- config ---------- */

  var meta = document.querySelector('meta[name="api-base"]');
  var API = ((meta && meta.content) || '').replace(/\/+$/, '');

  /* Mirrors emotion_labels + EMOTION_EMOJIS in main.py.
     Accents are CSS custom properties defined in style.css. */
  var ORDER = ['sadness', 'joy', 'love', 'anger', 'fear', 'surprise'];

  var EMOJI = {
    sadness: '😢', joy: '😄', love: '❤️',
    anger: '😠', fear: '😨', surprise: '😲'
  };

  /* Labelled by a fragment of the sentence, never by the emotion —
     the readout is what names the emotion, not the button. */
  var PRESETS = [
    { label: 'nervous but excited', text: 'i feel a little nervous but mostly excited about tomorrow' },
    { label: 'he remembered',       text: 'i cant believe he actually remembered my birthday' },
    { label: 'she stopped calling', text: 'i feel so hollow since she stopped calling me' },
    { label: 'they lied again',     text: 'i am furious that they lied to me again' },
    { label: 'holds my hand',       text: 'i feel safe whenever he holds my hand' },
    { label: 'something terrible',  text: 'i keep worrying that something terrible will happen tonight' }
  ];

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Hold the sweep on screen long enough to be read as a sweep. */
  var MIN_MS = reduceMotion ? 0 : 620;

  /* ---------- elements ---------- */

  var $ = function (id) { return document.getElementById(id); };

  var sample   = $('sample');
  var ta       = $('text');
  var btn      = $('measure');
  var count    = $('count');
  var rows     = $('channels');
  var peak     = $('peak');
  var peakName = $('peak-name');
  var peakVal  = $('peak-value');
  var peakEmo  = $('peak-emoji');
  var notice   = $('notice');
  var live     = $('live');
  var lamp     = $('lamp');
  var lampTxt  = $('lamp-label');

  var inflight = null;

  /* ---------- small helpers ---------- */

  function setLamp(state, label) {
    lamp.setAttribute('data-state', state);
    lampTxt.textContent = label;
  }

  function say(msg) {
    if (!msg) { notice.hidden = true; notice.textContent = ''; return; }
    notice.textContent = msg;
    notice.hidden = false;
  }

  function pct(n) { return (n * 100).toFixed(1); }

  function wait(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  /* ---------- readout ---------- */

  /* Build the six rows once; later measurements only reorder and
     re-set --w so the bars animate from their previous width. */
  function buildRows(order) {
    rows.textContent = '';
    order.forEach(function (name, i) {
      var tr = document.createElement('tr');
      tr.className = 'ch';
      tr.dataset.emotion = name;
      tr.style.setProperty('--i', i);
      tr.style.setProperty('--w', '0%');
      tr.style.setProperty('--ch', 'var(--' + name + ')');

      var th = document.createElement('th');
      th.scope = 'row';
      th.className = 'ch__name';
      th.textContent = name;

      var bar = document.createElement('td');
      bar.className = 'ch__bar';
      var track = document.createElement('span');
      track.className = 'ch__track';
      var fill = document.createElement('span');
      fill.className = 'ch__fill';
      track.appendChild(fill);
      bar.appendChild(track);

      var val = document.createElement('td');
      val.className = 'ch__value';
      val.textContent = '—';

      tr.appendChild(th);
      tr.appendChild(bar);
      tr.appendChild(val);
      rows.appendChild(tr);
    });
  }

  function render(data) {
    var probs = data.all_probabilites || data.all_probabilities || {};

    var sorted = ORDER.slice()
      .filter(function (n) { return typeof probs[n] === 'number'; })
      .sort(function (a, b) { return probs[b] - probs[a]; });

    if (!sorted.length) {
      say('The model returned no channel values. Measure again.');
      return;
    }

    var top = data.predicted_emotion || sorted[0];
    var conf = typeof data.confidence === 'number' ? data.confidence : probs[top];

    /* reorder existing rows, strongest first */
    sorted.forEach(function (name, i) {
      var tr = rows.querySelector('[data-emotion="' + name + '"]');
      if (!tr) return;
      rows.appendChild(tr);
      tr.style.setProperty('--i', i);
      tr.style.setProperty('--w', pct(probs[name]) + '%');
      tr.classList.toggle('ch--peak', name === top);
      tr.querySelector('.ch__value').textContent = pct(probs[name]) + '%';
    });

    /* peak card takes the measured emotion's colour */
    peak.removeAttribute('data-empty');
    peak.style.setProperty('--ch', 'var(--' + top + ')');
    peakEmo.textContent = EMOJI[top] || '';
    peakName.textContent = top;
    peakVal.textContent = pct(conf) + '%';

    live.textContent = 'Peak channel ' + top + ', ' + pct(conf) + ' percent.';
    say('');
  }

  /* ---------- network ---------- */

  function health() {
    return fetch(API + '/health', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        var up = !!d.model_loaded;
        setLamp(up ? 'ready' : 'warming', up ? 'model ready' : 'model loading');
        return up;
      })
      .catch(function () {
        setLamp('offline', 'no response');
        return false;
      });
  }

  function measure() {
    var text = ta.value.trim();

    if (!text) {
      say('Type a sentence first, then measure.');
      ta.focus();
      return;
    }

    if (inflight) inflight.abort();
    inflight = new AbortController();

    sample.setAttribute('data-state', 'measuring');
    btn.disabled = true;
    say('');

    var call = fetch(API + '/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text }),
      signal: inflight.signal
    });

    Promise.all([call, wait(MIN_MS)])
      .then(function (r) {
        var res = r[0];

        if (res.status === 503) {
          setLamp('warming', 'model loading');
          say('The model is still loading. Give it a few seconds, then measure again.');
          return null;
        }
        if (res.status === 422) {
          say('That sample is outside the accepted range — 1 to 2000 characters.');
          return null;
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);

        return res.json();
      })
      .then(function (data) {
        if (data) { render(data); setLamp('ready', 'model ready'); }
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        setLamp('offline', 'no response');
        say('No response from the model. Check that the server is running, then measure again.');
      })
      .then(function () {
        sample.setAttribute('data-state', 'idle');
        btn.disabled = false;
      });
  }

  /* ---------- wiring ---------- */

  function updateCount() {
    count.textContent = ta.value.length;
  }

  ta.addEventListener('input', updateCount);

  ta.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      measure();
    }
  });

  btn.addEventListener('click', measure);

  (function buildPresets() {
    var ul = $('presets');
    PRESETS.forEach(function (p) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = p.label;
      b.title = p.text;
      b.addEventListener('click', function () {
        ta.value = p.text;
        updateCount();
        measure();
      });
      li.appendChild(b);
      ul.appendChild(li);
    });
  })();

  /* ---------- start ---------- */

  buildRows(ORDER);
  ta.value = PRESETS[0].text;
  updateCount();

  /* Measure the prefilled sample so the page demonstrates itself.
     If the model is still loading, retry once rather than showing
     an error for something that is about to work. */
  health().then(function (up) {
    if (up) { measure(); return; }

    if (lamp.getAttribute('data-state') === 'warming') {
      say('The model is still loading. This will measure itself once it is ready.');
      wait(4000).then(health).then(function (ready) {
        if (ready) measure();
        else say('The model is taking a while to load. Measure again in a moment.');
      });
      return;
    }

    say('No response from the model. Check that the server is running, then measure again.');
  });

})();
