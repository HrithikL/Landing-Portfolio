/* =========================================================
   Mini-game: "Dogfight"
   Turn the parked plane to face north on the home podium and the pilot asks if you want to play.
   A 30-second round: enemy planes dive in from the distance on the right half of the screen,
   you aim by turning the podium (mouse, scroll wheel, swipe or arrow keys), the guns fire on their own.
   plane.js owns the plane, aiming and bullets; dogfight.js flies the enemies; this file runs the round,
   the pilot's prompt, the score panel, the countdown, the victory screen and the saved scores.
   ========================================================= */
(() => {
  const KEY = 'hl-dogfight-score';
  const ROUND = 30;
  const BEAT = 60 / 125;                 // the game music runs at 125 BPM
  const COUNT_IN = BEAT * 4;             // one bar: 3 · 2 · 1 · GO
  const pad = n => String(n).padStart(2, '0');

  function load() {
    try { return Object.assign({ best: 0, last: null, plays: 0 }, JSON.parse(localStorage.getItem(KEY))); }
    catch (e) { return { best: 0, last: null, plays: 0 }; }
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
  }
  const make = (cls, html, parent = document.body) => {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    parent.appendChild(el);
    return el;
  };

  function create(api) {
    const { lock, onStart, onDone } = api;
    const sfx = window.Sfx || null;
    const scores = load();

    // ---------- DOM ----------
    const prompt = make('game-prompt', `
      <p class="game-prompt__q">Are you ready for a dogfight?</p>
      <p class="game-prompt__sub">30 seconds. Shoot down as many planes as you can.</p>
      <div class="game-prompt__actions">
        <button type="button" class="game-btn game-btn--go">Yes, let’s fly</button>
        <button type="button" class="game-btn game-btn--no">Not now</button>
      </div>
      <p class="game-prompt__tip">Pick guns, missiles or both in the top bar (keys 1 · 2 · 3)</p>`);
    prompt.setAttribute('role', 'dialog');
    prompt.setAttribute('aria-label', 'Are you ready for a dogfight?');

    const panel = make('game-panel', `
      <div class="game-panel__row">
        <div class="game-panel__cell"><span>Score</span><b data-score>00</b></div>
        <div class="game-panel__cell"><span>Time</span><b data-time>0:30</b></div>
      </div>
      <i class="game-panel__bar"><i data-bar></i></i>
      <p class="game-panel__help">Aim with the mouse, scroll wheel, ← → keys or a swipe · Esc quits</p>`);
    panel.setAttribute('aria-live', 'polite');
    const scoreEl = panel.querySelector('[data-score]');
    const timeEl = panel.querySelector('[data-time]');
    const barEl = panel.querySelector('[data-bar]');

    const count = make('game-count', '<b></b>');
    count.setAttribute('aria-hidden', 'true');
    const countText = count.querySelector('b');

    const result = make('game-result', `
      <div class="game-result__card">
        <div class="game-result__confetti" aria-hidden="true"></div>
        <span class="game-result__eyebrow">Mission complete</span>
        <p class="game-result__title"></p>
        <div class="game-result__stars" aria-hidden="true"><i></i><i></i><i></i></div>
        <b class="game-result__score">0</b>
        <span class="game-result__label">planes shot down</span>
        <span class="game-result__best"></span>
      </div>`);
    result.setAttribute('role', 'status');
    const resScore = result.querySelector('.game-result__score');
    const resTitle = result.querySelector('.game-result__title');
    const resBest = result.querySelector('.game-result__best');
    const resStars = [...result.querySelectorAll('.game-result__stars i')];
    const confetti = result.querySelector('.game-result__confetti');

    // ---------- Weapon picker (nav) ----------
    const WEAPON_KEY = 'hl-dogfight-weapon';
    const WEAPONS = ['guns', 'missiles', 'both'];
    const nav = document.querySelector('.nav');
    const picker = document.querySelector('.nav-weapons');
    let weapon = 'guns';
    try { if (WEAPONS.includes(localStorage.getItem(WEAPON_KEY))) weapon = localStorage.getItem(WEAPON_KEY); } catch (e) { /* storage blocked */ }
    function setWeapon(w, quiet) {
      if (!WEAPONS.includes(w)) return;
      weapon = w;
      if (picker) picker.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.weapon === w)));
      try { localStorage.setItem(WEAPON_KEY, w); } catch (e) { /* storage blocked */ }
      if (!quiet && sfx) sfx.ui();
    }
    setWeapon(weapon, true);
    if (picker) picker.addEventListener('click', e => {
      const b = e.target.closest('button[data-weapon]');
      if (b) setWeapon(b.dataset.weapon);
    });
    addEventListener('keydown', e => {
      if (!(promptOn || state !== 'idle') || e.target.closest('input, textarea')) return;
      const w = WEAPONS[+e.key - 1];
      if (w) setWeapon(w);
    });
    let pickerOn = false;
    function showPicker(on) {
      if (on === pickerOn || !nav) return;
      pickerOn = on;
      nav.classList.toggle('show-weapons', on);
    }

    const pill = document.querySelector('.nav-score');
    function paintPill(bump) {
      if (!pill) return;
      if (!scores.plays) { pill.hidden = true; return; }
      pill.hidden = false;
      pill.querySelector('[data-best]').textContent = pad(scores.best);
      pill.querySelector('[data-last]').textContent = pad(scores.last || 0);
      pill.title = `Dogfight: last round ${scores.last || 0}, best ${scores.best}`;
      if (bump) {
        pill.classList.remove('is-bump');
        void pill.offsetWidth;
        pill.classList.add('is-bump');
      }
    }
    paintPill(false);

    // ---------- State ----------
    let state = 'idle', t = 0, score = 0, beat = -1, lastTick = -1;
    let promptOn = false, dismissed = false, arena = { x: innerWidth * .7, y: innerHeight * .4 };
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));

    prompt.querySelector('.game-btn--go').addEventListener('click', start);
    prompt.querySelector('.game-btn--no').addEventListener('click', () => {
      dismissed = true;
      showPrompt(false);
    });

    function showPrompt(on) {
      if (on === promptOn) return;
      promptOn = on;
      prompt.classList.toggle('is-on', on);
      if (on && sfx) sfx.ui();
    }

    function place(el, x, y) {
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }

    function start() {
      if (state !== 'idle') return;
      showPrompt(false);
      state = 'countdown';
      t = 0;
      score = 0;
      beat = -1;
      lastTick = -1;
      scoreEl.textContent = '00';
      timeEl.textContent = `0:${ROUND}`;
      barEl.style.transform = 'scaleX(1)';
      panel.classList.remove('is-warn');
      panel.classList.add('is-on');
      count.classList.add('is-on');
      lock(true);
      onStart();
      if (sfx) sfx.music.start();
    }

    function finish() {
      state = 'result';
      count.classList.remove('is-on');
      if (sfx) { sfx.music.stop(); sfx.fanfare(); }
      scores.plays += 1;
      scores.last = score;
      const best = score > scores.best;
      if (best) scores.best = score;
      save(scores);

      // Victory screen: title, stars, counting score, confetti
      const stars = score >= 14 ? 3 : score >= 8 ? 2 : score >= 3 ? 1 : 0;
      resTitle.textContent = score >= 20 ? 'Legendary ace!' : score >= 14 ? 'Ace pilot!' : score >= 8 ? 'Great shooting!' : score >= 3 ? 'Nice flying!' : 'The skies were tough';
      resStars.forEach((s, i) => s.classList.toggle('is-lit', i < stars));
      resBest.textContent = best && score > 0 ? 'New best score!' : `Best: ${scores.best}`;
      resBest.classList.toggle('is-new', best && score > 0);
      confetti.innerHTML = '';
      const colours = ['#FF8526', '#C8553D', '#F2C14E', '#2F5D8C', '#7CC6B8', '#FFF1D8'];
      for (let i = 0; i < 46; i++) {
        const c = document.createElement('i');
        c.style.setProperty('--x', `${(Math.random() * 2 - 1) * 190}px`);
        c.style.setProperty('--y', `${-60 - Math.random() * 170}px`);
        c.style.setProperty('--r', `${Math.round(Math.random() * 720 - 360)}deg`);
        c.style.setProperty('--d', `${Math.round(Math.random() * 180)}ms`);
        c.style.background = colours[i % colours.length];
        confetti.appendChild(c);
      }
      place(result, arena.x, arena.y);
      resScore.textContent = '0';
      result.classList.remove('is-out');
      result.classList.add('is-on');
      const t0 = performance.now();
      const countUp = now => {
        const k = Math.min(1, (now - t0) / 900);
        resScore.textContent = String(Math.round(score * (1 - Math.pow(1 - k, 3))));
        if (k < 1 && state === 'result') requestAnimationFrame(countUp);
      };
      requestAnimationFrame(countUp);

      // The score flies up into the nav, then the plane turns back to its resting pose
      later(3400, () => flyToNav());
      later(4300, () => {
        result.classList.add('is-out');
        panel.classList.remove('is-on');
        paintPill(true);
      });
      later(4900, () => {
        result.classList.remove('is-on', 'is-out');
        end();
      });
    }

    function flyToNav() {
      if (!pill) return;
      paintPill(false);
      const from = resScore.getBoundingClientRect();
      const to = pill.getBoundingClientRect();
      const fly = make('game-fly', resScore.textContent);
      fly.style.left = `${from.left + from.width / 2}px`;
      fly.style.top = `${from.top + from.height / 2}px`;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        fly.style.transform = `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px, ${to.top + to.height / 2 - (from.top + from.height / 2)}px) translate(-50%, -50%) scale(.28)`;
        fly.style.opacity = '.2';
      }));
      setTimeout(() => fly.remove(), 900);
    }

    function end() {
      state = 'idle';
      dismissed = true;          // wait until the plane has turned away before asking again
      lock(false);
      onDone();
    }

    function abort() {
      if (state === 'idle') return;
      timers.splice(0).forEach(clearTimeout);
      if (sfx) sfx.music.stop();
      [panel, count, result].forEach(el => el.classList.remove('is-on', 'is-out'));
      if (state === 'result') paintPill(false);
      end();
    }

    function kill(x, y) {
      if (state !== 'play') return;
      score++;
      scoreEl.textContent = pad(score);
      panel.classList.remove('is-bump');
      void panel.offsetWidth;
      panel.classList.add('is-bump');
      const pop = make('game-pop', '+1');
      place(pop, x, y);
      setTimeout(() => pop.remove(), 900);
    }

    // info: { ready, facing, away, head: {x, y}, arena: {x, y} }
    function update(dt, info) {
      if (info.arena) {
        const m = innerWidth < 860;
        arena = {
          x: m ? innerWidth / 2 : Math.min(Math.max(info.arena.x, 190), innerWidth - 190),
          y: m ? innerHeight * .42 : Math.min(Math.max(info.arena.y, 200), innerHeight - 220),
        };
      }
      if (info.away) dismissed = false;
      showPrompt(state === 'idle' && info.ready && info.facing && !dismissed);
      showPicker(promptOn || state === 'countdown' || state === 'play');
      if (promptOn && info.head) {
        const w = prompt.offsetWidth || 260;
        place(prompt, Math.min(Math.max(info.head.x, w / 2 + 12), innerWidth - w / 2 - 12), Math.max(info.head.y, prompt.offsetHeight + 90));
      }

      if (state === 'countdown') {
        t += dt;
        place(count, arena.x, arena.y);
        const b = Math.min(3, Math.floor(t / BEAT));
        if (b !== beat) {
          beat = b;
          countText.textContent = ['3', '2', '1', 'GO!'][b];
          count.classList.remove('is-pop');
          void count.offsetWidth;
          count.classList.add('is-pop');
          if (sfx) sfx.beep(b === 3);
        }
        if (t >= COUNT_IN) {
          state = 'play';
          t = 0;
          later(380, () => { if (state !== 'countdown') count.classList.remove('is-on'); });
        }
      } else if (state === 'play') {
        t += dt;
        const left = Math.max(0, ROUND - t);
        const secs = Math.ceil(left);
        timeEl.textContent = `0:${pad(secs)}`;
        barEl.style.transform = `scaleX(${(left / ROUND).toFixed(4)})`;
        if (secs <= 5 && secs !== lastTick && left > 0) {
          lastTick = secs;
          panel.classList.add('is-warn');
          if (sfx) sfx.tick();
        }
        if (left <= 0) finish();
      }
    }

    return {
      update, kill, abort, start,
      get state() { return state; },
      get aiming() { return state === 'countdown' || state === 'play'; },
      get firing() { return state === 'play'; },
      get weapon() { return weapon; },
      get score() { return score; },
    };
  }

  window.PlaneGame = { create };
})();
