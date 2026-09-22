/* =========================================================
   Page content that isn't static HTML:
   - Free resources: the shelves (rendered before main.js runs, so the burner splits their letters too)
   - Cool news: cards from data/news.json (AI / Anime / Gaming), like and dislike, and a full-screen reader
   - About me: the tiles open a panel that grows out of the middle of the screen to 75% of it
   Anything rendered after load goes through Flight.refresh(), so the page re-measures it.
   ========================================================= */
(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const refresh = el => { if (window.Flight && window.Flight.refresh) window.Flight.refresh(el); };
  const overlay = (on, opts) => { if (window.Flight && window.Flight.overlay) window.Flight.overlay(on, opts); };
  const ui = () => { if (window.Sfx && window.Sfx.ui) window.Sfx.ui(); };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ARROW = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // =========================================================
  // Free resources
  // =========================================================
  const SHELVES = [
    { id: 'wallpapers', name: 'HD wallpapers', summary: 'High-resolution backgrounds for desktops and phones, free to download and use.', items: [
      ['Unsplash Wallpapers', 'https://unsplash.com/wallpapers', 'Curated photo wallpapers for desktop and mobile, free under the Unsplash License.', 'Free'],
      ['Wallhaven', 'https://wallhaven.cc', 'A huge community library you can filter by resolution, aspect ratio and colour.', 'Free'],
      ['Wallpaper Abyss', 'https://wall.alphacoders.com', 'Millions of wallpapers sorted by games, anime, films and more, up to 4K and beyond.', 'Free'],
      ['Simple Desktops', 'https://simpledesktops.com', 'A small, hand-picked set of clean and minimal desktop wallpapers.', 'Free'],
    ] },
    { id: 'live', name: 'Live wallpapers', summary: 'Animated and interactive wallpapers: video loops, scenes and apps that play them.', items: [
      ['Lively Wallpaper', 'https://www.rocksdanister.com/lively/', 'Free, open-source Windows app for video, web-page and shader wallpapers.', 'Free · Open source'],
      ['MoeWalls', 'https://moewalls.com', 'Animated wallpapers as video loops, mostly games and anime.', 'Free'],
      ['MyLiveWallpapers', 'https://mylivewallpapers.com', 'Live wallpapers for PC and phone: games, anime, nature and more.', 'Free'],
      ['Wallpaper Engine', 'https://www.wallpaperengine.io', 'The Steam app with a giant community workshop of live wallpapers.', 'Paid app'],
    ] },
    { id: 'navs', name: 'Nav bars & menus', summary: 'Ready-made navigation bars, dropdowns and menus you can copy into a project.', items: [
      ['Uiverse', 'https://uiverse.io', 'Open-source UI elements made by the community, as HTML/CSS or Tailwind.', 'Free · Open source'],
      ['Flowbite', 'https://flowbite.com/docs/components/navbar/', 'Tailwind navbars, mega menus and dropdowns, with docs and examples.', 'Free core'],
      ['HyperUI', 'https://www.hyperui.dev', 'Free Tailwind components, including headers, footers and side menus.', 'Free'],
      ['Preline UI', 'https://preline.co', 'Open-source Tailwind components and navbars with dark mode built in.', 'Free core'],
      ['CodePen', 'https://codepen.io/search/pens?q=navbar', 'Thousands of navbar and menu experiments to learn from and remix.', 'Free'],
    ] },
    { id: 'opening', name: 'Opening sections', summary: 'Preloaders and intro animations for the first second someone sees.', items: [
      ['LottieFiles', 'https://lottiefiles.com/free-animations', 'Free Lottie animations for loaders and intros: small JSON files that scale cleanly.', 'Free tier'],
      ['Uiverse loaders', 'https://uiverse.io/loaders', 'Hundreds of pure-CSS loaders and spinners to open a site with.', 'Free · Open source'],
      ['CodePen preloaders', 'https://codepen.io/search/pens?q=preloader', 'Intro and preloader experiments, from simple fades to full-screen reveals.', 'Free'],
      ['loading.io', 'https://loading.io', 'Customisable spinners and animated icons, exported as SVG, GIF or CSS.', 'Free + paid'],
    ] },
    { id: 'hero', name: 'Hero sections', summary: 'The big first block of a landing page: animated components and real examples to study.', items: [
      ['Aceternity UI', 'https://ui.aceternity.com', 'Animated React + Tailwind components: spotlight, aurora and parallax heroes.', 'Free · Open source'],
      ['Magic UI', 'https://magicui.design', 'Animated React components (marquees, globes, text effects) for landing pages.', 'Free · Open source'],
      ['shadcn/ui blocks', 'https://ui.shadcn.com/blocks', 'Copy-paste React blocks, including hero and landing sections.', 'Free · Open source'],
      ['Land-book', 'https://land-book.com', 'A gallery of real landing pages for studying hero layouts and styles.', 'Free'],
      ['Lapa Ninja', 'https://www.lapa.ninja', 'Landing-page inspiration organised by category, plus free design resources.', 'Free'],
    ] },
    { id: 'motion', name: 'UI animations', summary: 'Libraries and tools for interactive animation, from micro-interactions to 3D.', items: [
      ['GSAP', 'https://gsap.com', 'A long-standing JavaScript animation library, now free to use, plugins included.', 'Free'],
      ['Motion', 'https://motion.dev', 'Animation for React and plain JS (formerly Framer Motion): springs, gestures, scroll.', 'Free · Open source'],
      ['Anime.js', 'https://animejs.com', 'A lightweight library for CSS, SVG and DOM animation.', 'Free · Open source'],
      ['Rive', 'https://rive.app', 'Design interactive, state-driven animations and ship them with a small runtime.', 'Free tier'],
      ['React Bits', 'https://reactbits.dev', 'An open collection of animated, interactive React components and backgrounds.', 'Free · Open source'],
      ['Three.js', 'https://threejs.org', 'The 3D library behind this site’s plane: WebGL scenes in the browser.', 'Free · Open source'],
    ] },
    { id: 'stock', name: 'Stock photos & videos', summary: 'Free photos and video clips for backgrounds, heroes and anything in between.', items: [
      ['Unsplash', 'https://unsplash.com', 'High-quality photos, free to use under the Unsplash License.', 'Free'],
      ['Pexels', 'https://www.pexels.com', 'Free stock photos and videos, no attribution required.', 'Free'],
      ['Pixabay', 'https://pixabay.com', 'Photos, illustrations, vectors, videos and music under the Pixabay Content License.', 'Free'],
      ['Coverr', 'https://coverr.co', 'Free stock video clips, well suited to background-video heroes.', 'Free'],
      ['Mixkit', 'https://mixkit.co', 'Free stock video, music, sound effects and video templates.', 'Free'],
    ] },
    { id: 'music', name: 'Music', summary: 'Royalty-free and Creative Commons music for sites and videos. Check the credit rules for each track.', items: [
      ['Pixabay Music', 'https://pixabay.com/music/', 'Royalty-free tracks for websites and videos.', 'Free'],
      ['Free Music Archive', 'https://freemusicarchive.org', 'Independent music under Creative Commons and similar licences.', 'Free · CC'],
      ['Incompetech', 'https://incompetech.com/music/', 'Kevin MacLeod’s royalty-free library, licensed CC BY with attribution.', 'Free · CC BY'],
      ['BreakingCopyright', 'https://breakingcopyright.com', 'No-copyright music collections. This site’s soundtrack came from here.', 'Free · credit'],
      ['Uppbeat', 'https://uppbeat.io', 'Music for creators, with a free tier and monthly credits.', 'Free tier'],
    ] },
    { id: 'type', name: 'Fonts & icons', summary: 'Typefaces and icon sets that are free for commercial work.', items: [
      ['Google Fonts', 'https://fonts.google.com', 'Open-source typefaces, including the three this site uses.', 'Free · OFL'],
      ['Fontshare', 'https://www.fontshare.com', 'Quality display and text fonts, free for personal and commercial use.', 'Free'],
      ['Lucide', 'https://lucide.dev', 'A clean, consistent open-source icon set.', 'Free · Open source'],
      ['Heroicons', 'https://heroicons.com', 'Hand-crafted SVG icons from the makers of Tailwind CSS.', 'Free · Open source'],
    ] },
  ];
  const tabsEl = $('[data-res-tabs]'), gridEl = $('[data-res-grid]'), sumEl = $('[data-res-summary]');
  const hostOf = url => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
  let shelf = 0;
  function renderShelf(i, live) {
    shelf = i;
    const S = SHELVES[i];
    $$('button', tabsEl).forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
    sumEl.textContent = S.summary;
    gridEl.innerHTML = S.items.map(([name, url, text, tag], k) => `
      <a class="res-card" href="${esc(url)}" target="_blank" rel="noopener" style="--k:${k}">
        <span class="res-card__mono" aria-hidden="true">${esc(name[0])}</span>
        <span class="res-card__main">
          <b class="res-card__name">${esc(name)}</b>
          <span class="res-card__host">${esc(hostOf(url))}</span>
          <span class="res-card__text">${esc(text)}</span>
        </span>
        <span class="res-card__tag">${esc(tag)}</span>
        <span class="res-card__go" aria-hidden="true">${ARROW}</span>
      </a>`).join('');
    if (live) { refresh(sumEl); refresh(gridEl); }
  }
  if (tabsEl) {
    tabsEl.innerHTML = SHELVES.map((S, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-shelf="${i}">${esc(S.name)}<sup>${S.items.length}</sup></button>`).join('');
    tabsEl.addEventListener('click', e => {
      const b = e.target.closest('[data-shelf]');
      if (!b || +b.dataset.shelf === shelf) return;
      ui();
      renderShelf(+b.dataset.shelf, true);
    });
    renderShelf(0, false);
  }

  // =========================================================
  // Cool news
  // =========================================================
  const NEWS_URL = 'data/news.json';
  const VOTES_KEY = 'pp-votes';
  let votes = {};
  try { votes = JSON.parse(localStorage.getItem(VOTES_KEY)) || {}; } catch (e) { votes = {}; }
  const saveVotes = () => { try { localStorage.setItem(VOTES_KEY, JSON.stringify(votes)); } catch (e) { /* storage blocked */ } };
  const news = { items: [], cat: 'models', ready: false };
  const grid = $('[data-news-grid]'), readerGrid = $('[data-reader-grid]'), status = $('[data-news-status]');
  const fmtDate = iso => {
    const d = new Date(`${iso}T12:00:00`);
    return isNaN(d) ? esc(iso) : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // ---------- Placeholder art ----------
  // Until the pipeline generates a real image for a story (item.image), each card gets its own
  // artwork, drawn from the story's id: soft candy light over a gradient, with a network motif
  // (every topic here is AI/dev-tooling, so one consistent motif reads better than a forced
  // per-category icon set).
  const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const rng = seed => () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507) ^ Math.imul(seed ^ (seed >>> 13), 3266489909), (seed ^= seed >>> 16) >>> 0) / 4294967296);
  const PAL = [['#ff7a2f', '#ff4f9a'], ['#ff9f45', '#ef4a76'], ['#ff6d34', '#b28dff'], ['#ffb347', '#ff5f8a']];
  const artCache = new Map();
  function art(item) {
    if (artCache.has(item.id)) return artCache.get(item.id);
    const r = rng(hash(item.id)), W = 400, H = 300;
    const pal = PAL[Math.floor(r() * PAL.length)];
    const blobs = Array.from({ length: 4 }, (_, k) => `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${(60 + r() * 90).toFixed(0)}" fill="${['#fff2d7', '#ffd2da', pal[0], '#ffe4d9'][k]}" opacity="${(.35 + r() * .4).toFixed(2)}"/>`).join('');
    const pts = Array.from({ length: 8 }, () => [70 + r() * 260, 50 + r() * 200]);
    const lines = [];
    pts.forEach((p, i) => pts.forEach((q, j) => { if (j > i && Math.hypot(p[0] - q[0], p[1] - q[1]) < 150) lines.push(`<line x1="${p[0].toFixed(0)}" y1="${p[1].toFixed(0)}" x2="${q[0].toFixed(0)}" y2="${q[1].toFixed(0)}"/>`); }));
    const motif = `<g stroke="#fff6ea" stroke-width="2.5" opacity=".75">${lines.join('')}</g>`
      + pts.map((p, i) => `<circle cx="${p[0].toFixed(0)}" cy="${p[1].toFixed(0)}" r="${i ? 7 : 16}" fill="#fff6ea"/>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pal[0]}"/><stop offset="1" stop-color="${pal[1]}"/></linearGradient><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="34"/></filter></defs><rect width="${W}" height="${H}" fill="url(#g)"/><g filter="url(#b)">${blobs}</g>${motif}</svg>`;
    const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    artCache.set(item.id, uri);
    return uri;
  }

  const THUMB_UP = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 3 2l-1 4h5.5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.3 20H7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  const THUMB_DOWN = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M17 13V4h3v9zM17 13l-4 7a2 2 0 0 1-3-2l1-4H5.5a2 2 0 0 1-2-2.3l1.2-6A2 2 0 0 1 6.7 4H17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  const VERIFIED = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 1.8l2.4 1.8 3-.2 1 2.8 2.6 1.6-.7 2.9 1.2 2.8-2.2 2 .1 3-2.9.8-1.5 2.6-2.9-.8-2.6 1.4-2-2.2-3-.3-.5-3L1.6 15l1.3-2.7-.6-3 2.7-1.4.9-2.9 3 .1z" fill="var(--flare)"/><path d="M8 12.2l2.7 2.7L16.2 9.4" fill="none" stroke="var(--on-flare)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const count = (it, k) => (it[k] || 0) + (votes[it.id] === (k === 'likes' ? 1 : -1) ? 1 : 0);
  function card(it, glass) {
    const v = votes[it.id] || 0;
    const img = it.image ? esc(it.image) : art(it);
    const teaser = it.howItWorks || it.summary || '';
    return `
      <article class="news-card${glass ? ' news-card--glass' : ''}" data-id="${esc(it.id)}">
        <div class="news-card__media"><img src="${img}" alt="" loading="lazy" decoding="async">${it.sample ? '<span class="news-card__tag">Sample</span>' : ''}</div>
        <div class="news-card__body">
          <p class="news-card__meta"><a href="${esc(it.source.url)}" target="_blank" rel="noopener">${esc(it.source.name)}</a><span aria-hidden="true">·</span><time datetime="${esc(it.published)}">${fmtDate(it.published)}</time></p>
          <h3 class="news-card__title"><button type="button" class="news-card__title-btn" data-article-open>${esc(it.title)}</button>${it.official ? `<span class="news-card__check" role="img" aria-label="Official source" title="Official source${it.sample ? ' (sample)' : ''}">${VERIFIED}</span>` : ''}</h3>
          <p class="news-card__sum">${esc(teaser)}</p>
          <p class="news-card__by">By ${esc(it.author)} · <a href="${esc(it.source.url)}" target="_blank" rel="noopener">Original report ↗</a></p>
          <div class="news-card__foot">
            <button class="vote" type="button" data-vote="1" aria-pressed="${v === 1}" aria-label="Like">${THUMB_UP}<b data-live>${count(it, 'likes')}</b></button>
            <button class="vote" type="button" data-vote="-1" aria-pressed="${v === -1}" aria-label="Dislike">${THUMB_DOWN}<b data-live>${count(it, 'dislikes')}</b></button>
            <button class="news-card__open" type="button" data-article-open>Read article <span aria-hidden="true">+</span></button>
          </div>
        </div>
      </article>`;
  }
  const inCat = () => news.items.filter(it => it.category === news.cat).sort((a, b) => (a.published < b.published ? 1 : -1));
  function renderNews(live) {
    if (!grid) return;
    const list = inCat();
    grid.innerHTML = news.ready
      ? (list.length ? list.slice(0, 4).map(it => card(it)).join('') : '<p class="news__empty">No stories here yet.</p>')
      : Array.from({ length: 4 }, () => '<div class="news-card news-card--ghost" aria-hidden="true"><div class="news-card__media"></div><div class="news-card__body"><i></i><i></i><i></i></div></div>').join('');
    if (live) refresh(grid);
  }
  function renderReader() {
    if (readerGrid) readerGrid.innerHTML = inCat().map(it => card(it, true)).join('');
  }
  function setCat(cat, live = true) {
    if (!['models', 'claude', 'tools', 'projects', 'repos'].includes(cat)) return;
    const changed = cat !== news.cat;
    news.cat = cat;
    $$('.news__tabs [data-cat]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.cat === cat)));
    if (changed) { renderNews(live); if (reader.open) renderReader(); }
  }
  $$('.news__tabs').forEach(t => t.addEventListener('click', e => {
    const b = e.target.closest('[data-cat]');
    if (b) { ui(); setCat(b.dataset.cat); }
  }));
  // the Models / Claude / Tools / Projects / Repos chips on the Home page pick the topic before flying to the news
  $$('[data-news-cat]').forEach(b => b.addEventListener('click', () => setCat(b.dataset.newsCat)));
  // Likes and dislikes (remembered in this browser; a shared count needs the backend in docs/news-pipeline.md)
  document.addEventListener('click', e => {
    const b = e.target.closest('.news-card .vote');
    if (!b) return;
    const id = b.closest('.news-card').dataset.id;
    const it = news.items.find(x => x.id === id);
    if (!it) return;
    const want = +b.dataset.vote;
    votes[id] = votes[id] === want ? 0 : want;
    if (!votes[id]) delete votes[id];
    saveVotes();
    ui();
    // every copy of this card (section and reader) updates in place
    $$(`.news-card[data-id="${CSS.escape(id)}"]`).forEach(c => {
      $$('.vote', c).forEach(v => {
        const up = v.dataset.vote === '1';
        v.setAttribute('aria-pressed', String(votes[id] === (up ? 1 : -1)));
        $('b', v).textContent = count(it, up ? 'likes' : 'dislikes');
      });
    });
    b.classList.remove('is-pop');
    void b.offsetWidth;
    b.classList.add('is-pop');
  });
  renderNews(false);
  fetch(NEWS_URL, { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
    .then(data => {
      news.items = (data.items || []).filter(it => it && it.id && it.title && it.source);
      news.ready = true;
      const samples = news.items.some(it => it.sample);
      if (status) status.textContent = samples ? 'Sample stories · the live feed is coming soon' : `Updated ${fmtDate(String(data.updated || '').slice(0, 10))}`;
      renderNews(true);
    })
    .catch(() => {
      news.ready = true;
      if (status) status.textContent = 'The feed couldn’t load right now';
      renderNews(true);
    });

  // ---------- Refresh: trigger a real pipeline run from the site ----------
  // The button can't call OpenRouter (or GitHub) directly — that would mean shipping an API key
  // to every visitor's browser. Instead it calls a small Cloudflare Worker (cloudflare/worker.js)
  // that holds a GitHub token server-side and fires the same workflow_dispatch a manual "Run
  // workflow" click in the Actions tab would. Set this to your deployed Worker's URL (see
  // cloudflare/README.md) — until then the button explains itself instead of failing silently.
  const NEWS_TRIGGER_URL = 'https://peaceful-pursuit-news-trigger.loopend-0-21.workers.dev';
  const NEWS_RAW_URL = 'https://raw.githubusercontent.com/HrithikL/Landing-Portfolio/main/data/news.json';
  const refreshBtn = $('[data-news-refresh]');
  const refreshLabel = refreshBtn ? $('[data-news-refresh-label]', refreshBtn) : null;
  let refreshPoll = null;
  function setRefreshLabel(text, busy) {
    if (refreshLabel) refreshLabel.textContent = text;
    if (refreshBtn) { refreshBtn.disabled = !!busy; refreshBtn.classList.toggle('is-busy', !!busy); }
  }
  function stopRefreshPoll() { if (refreshPoll) { clearInterval(refreshPoll); refreshPoll = null; } }
  async function pullFreshNews() {
    try {
      const res = await fetch(`${NEWS_RAW_URL}?_=${Date.now()}`, { cache: 'no-cache' });
      if (!res.ok) return false;
      const data = await res.json();
      news.items = (data.items || []).filter(it => it && it.id && it.title && it.source);
      renderNews(true);
      if (reader.open) renderReader();
      const samples = news.items.some(it => it.sample);
      if (status) status.textContent = samples ? 'Sample stories · the live feed is coming soon' : `Updated ${fmtDate(String(data.updated || '').slice(0, 10))}`;
      return true;
    } catch (e) { return false; }
  }
  function pollRefreshStatus(startedAt) {
    const TIMEOUT_MS = 6 * 60 * 1000;
    refreshPoll = setInterval(async () => {
      if (Date.now() - startedAt > TIMEOUT_MS) {
        stopRefreshPoll();
        setRefreshLabel('Taking a while — check Actions', false);
        setTimeout(() => setRefreshLabel('Refresh', false), 4000);
        return;
      }
      let data;
      try {
        const res = await fetch(`${NEWS_TRIGGER_URL}/status`);
        data = await res.json();
      } catch (e) { return; } // a missed poll just tries again next tick
      const run = data && data.run;
      if (!run || new Date(run.createdAt).getTime() < startedAt - 5000) { setRefreshLabel('Queuing…', true); return; }
      if (run.status !== 'completed') { setRefreshLabel(run.status === 'in_progress' ? 'Writing articles…' : 'Queuing…', true); return; }
      stopRefreshPoll();
      if (run.conclusion === 'success') {
        setRefreshLabel('Updating…', true);
        await pullFreshNews();
        setRefreshLabel('Refreshed', false);
      } else {
        setRefreshLabel('Run failed — check Actions', false);
      }
      setTimeout(() => setRefreshLabel('Refresh', false), 4000);
    }, 8000);
  }
  if (refreshBtn) refreshBtn.addEventListener('click', async () => {
    if (refreshBtn.disabled) return;
    ui();
    if (!NEWS_TRIGGER_URL) {
      setRefreshLabel('Not set up yet — see cloudflare/README.md', false);
      setTimeout(() => setRefreshLabel('Refresh', false), 4000);
      return;
    }
    setRefreshLabel('Starting…', true);
    try {
      const res = await fetch(`${NEWS_TRIGGER_URL}/trigger`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setRefreshLabel(data && data.error === 'cooldown' ? `Wait ${Math.ceil((data.retryAfterSeconds || 60) / 60)} min` : 'Couldn’t start', false);
        setTimeout(() => setRefreshLabel('Refresh', false), 4000);
        return;
      }
      pollRefreshStatus(Date.now());
    } catch (e) {
      setRefreshLabel('Couldn’t reach the trigger', false);
      setTimeout(() => setRefreshLabel('Refresh', false), 4000);
    }
  });

  // ---------- Full-screen reader ("View more") ----------
  const readerEl = $('#news-reader');
  const reader = { open: false, last: null };
  function openReader() {
    if (!readerEl || reader.open) return;
    reader.open = true;
    reader.last = document.activeElement;
    renderReader();
    readerEl.hidden = false;
    $('.reader__scroll', readerEl).scrollTop = 0;
    overlay(true, { hideScene: true, onEscape: closeReader });
    requestAnimationFrame(() => readerEl.classList.add('is-open'));
    setTimeout(() => { const c = $('[data-reader-close]', readerEl); if (c) c.focus({ preventScroll: true }); }, 60);
    ui();
  }
  function closeReader() {
    if (!reader.open) return;
    reader.open = false;
    readerEl.classList.remove('is-open');
    overlay(false);
    setTimeout(() => { if (!reader.open) readerEl.hidden = true; }, reduced ? 0 : 520);
    if (reader.last && reader.last.focus) reader.last.focus({ preventScroll: true });
  }
  $$('[data-news-more]').forEach(b => b.addEventListener('click', openReader));
  $$('[data-reader-close]').forEach(b => b.addEventListener('click', closeReader));

  // ---------- Full article ("Read article") ----------
  // The pipeline (scripts/news/, docs/news-pipeline.md) writes each item as a strict set of
  // fields — never raw HTML — so a rewrite can never smuggle markup through into the page.
  // Anything without these fields yet (samples, or a story the pipeline hasn't reached) falls
  // back to showing its card summary as a single line.
  const CAT_NAMES = { models: 'Open Source Models', claude: 'Claude Updates', tools: 'Free AI Tools', projects: 'AI Projects', repos: 'GitHub Repos' };
  // [label, field key, kind] — kind picks how the value renders. Order here is the order shown.
  const TEMPLATE_FIELDS = [
    ['End user', 'endUser', 'text'],
    ['Tools used', 'toolsUsed', 'list'],
    ['Paid or free', 'costStructure', 'text'],
    ['How it works', 'howItWorks', 'text'],
    ['What input it needs', 'inputNeeded', 'text'],
    ['What output it gives', 'outputGiven', 'text'],
    ['Workflow', 'workflow', 'steps'],
    ['Use cases', 'useCases', 'list'],
    ['Hardware requirements', 'hardwareRequirements', 'text'],
    ['Connects to', 'integrations', 'text'],
    ['Subscriptions required', 'subscriptionsRequired', 'text'],
  ];

  // ---------- Workflow flowchart ----------
  // No image API involved: the "Workflow" field is drawn as an actual flowchart (boxes + arrows),
  // generated in the browser straight from the step text the pipeline already wrote. Free,
  // instant, no key, no rate limit — reuses the same visual language as the About-me architecture
  // diagram (.site-figure), with its own classes (.wf-*) so its per-node styling can't collide
  // with that diagram's fixed layout.
  function wrapLines(text, maxChars, maxLines) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (next.length > maxChars && cur) { lines.push(cur); cur = w; } else cur = next;
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,3}$/, '…');
    }
    return lines;
  }
  function workflowDiagram(steps) {
    if (!Array.isArray(steps) || !steps.length) return '';
    const MAX_NODES = 5;
    const overflow = Math.max(0, steps.length - MAX_NODES);
    const nodes = overflow > 0 ? [...steps.slice(0, MAX_NODES - 1), `+${overflow + 1} more step${overflow ? 's' : ''}`] : steps;
    const n = nodes.length;
    const boxW = 148, boxH = 96, gap = 40, padX = 20, padY = 26;
    const W = padX * 2 + n * boxW + (n - 1) * gap;
    const H = padY * 2 + boxH;
    const cy = padY + boxH / 2;
    let body = '';
    nodes.forEach((step, i) => {
      const x = padX + i * (boxW + gap);
      const lines = wrapLines(step, 19, 3);
      const startY = cy - ((lines.length - 1) * 8);
      const tspans = lines.map((l, k) => `<tspan x="${x + boxW / 2}" dy="${k === 0 ? 0 : 16}">${esc(l)}</tspan>`).join('');
      body += `<g class="wf-step">
        <rect x="${x}" y="${padY}" width="${boxW}" height="${boxH}" rx="16"/>
        <circle class="wf-num-bg" cx="${x + 24}" cy="${padY}" r="14"/>
        <text class="wf-num" x="${x + 24}" y="${padY + 5}" text-anchor="middle">${i + 1}</text>
        <text class="wf-text" x="${x + boxW / 2}" y="${startY}" text-anchor="middle">${tspans}</text>
      </g>`;
      if (i < n - 1) {
        const x1 = x + boxW, x2 = x1 + gap - 8;
        body += `<path class="wf-arrow" d="M${x1} ${cy} L${x2} ${cy}"/><path class="wf-arrow-head" d="M${x2 - 8} ${cy - 6} L${x2} ${cy} L${x2 - 8} ${cy + 6}z"/>`;
      }
    });
    return `<figure class="site-figure workflow-fig"><svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${body}</svg></figure>`;
  }

  function renderTemplate(it) {
    if (!it.howItWorks) return `<p>${esc(it.summary || '')}</p>`; // sample/legacy item with no template yet
    const rows = TEMPLATE_FIELDS.map(([label, key, kind]) => {
      const v = it[key];
      if (!v || (Array.isArray(v) && !v.length)) return '';
      const value = kind === 'list' ? `<ul class="article__list">${v.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
        : kind === 'steps' ? workflowDiagram(v) + `<ol class="article__list article__list--steps">${v.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`
        : `<p>${esc(v)}</p>`;
      return `<div class="article__field"><p class="article__field-label">${esc(label)}</p>${value}</div>`;
    }).join('');
    const tag = it.topicTag ? `<span class="article__tag">${esc(it.topicTag)}</span>` : '';
    const hero = `<img class="article__hero" src="${it.image ? esc(it.image) : art(it)}" alt="">`;
    return hero + tag + rows;
  }
  const articleEl = $('#article');
  const article = { open: false, last: null };
  function openArticle(id) {
    const it = news.items.find(x => x.id === id);
    if (!articleEl || article.open || !it) return;
    article.open = true;
    article.last = document.activeElement;
    const mins = it.readingTime || 1;
    $('[data-article-kicker]', articleEl).textContent = `${CAT_NAMES[it.category] || it.category} · ${fmtDate(it.published)} · ${mins} min read`;
    $('[data-article-title]', articleEl).textContent = it.title;
    $('[data-article-body]', articleEl).innerHTML = renderTemplate(it)
      + `<a class="article__original" href="${esc(it.url)}" target="_blank" rel="noopener">Read the original at ${esc(it.source.name)} <span aria-hidden="true">↗</span></a>`;
    $('[data-article-body]', articleEl).scrollTop = 0;
    articleEl.hidden = false;
    overlay(true, { hideScene: true, onEscape: closeArticle });
    requestAnimationFrame(() => articleEl.classList.add('is-open'));
    setTimeout(() => { const c = $('[data-article-close]', articleEl); if (c) c.focus({ preventScroll: true }); }, 60);
    ui();
  }
  function closeArticle() {
    if (!article.open) return;
    article.open = false;
    articleEl.classList.remove('is-open');
    overlay(false);
    setTimeout(() => { if (!article.open) articleEl.hidden = true; }, reduced ? 0 : 480);
    if (article.last && article.last.focus) article.last.focus({ preventScroll: true });
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-article-open]');
    if (!b) return;
    const id = b.closest('.news-card');
    if (id) { ui(); openArticle(id.dataset.id); }
  });
  $$('[data-article-close]').forEach(b => b.addEventListener('click', closeArticle));

  // =========================================================
  // About me: tiles open a panel from the middle of the screen
  // =========================================================
  const sheetEl = $('#sheet');
  const SHEETS = {
    background: 'Background', projects: 'My projects', hobbies: 'Hobbies & interests',
    tools: 'Tools I use', site: 'About this website', gallery: 'Gallery',
  };
  const sheet = { open: false, last: null };
  function openSheet(id, from) {
    const tpl = document.getElementById(`sheet-${id}`);
    if (!sheetEl || !tpl || sheet.open) return;
    sheet.open = true;
    sheet.last = from || document.activeElement;
    $('#sheet-title').textContent = SHEETS[id];
    const icon = from && $('.tile__icon', from);
    $('.sheet__icon', sheetEl).innerHTML = icon ? icon.innerHTML : '';
    const body = $('.sheet__body', sheetEl);
    body.innerHTML = '';
    body.appendChild(tpl.content.cloneNode(true));
    body.scrollTop = 0;
    sheetEl.dataset.sheet = id;
    sheetEl.hidden = false;
    overlay(true, { onEscape: closeSheet });
    requestAnimationFrame(() => requestAnimationFrame(() => sheetEl.classList.add('is-open')));
    setTimeout(() => { const c = $('.sheet__head [data-sheet-close]', sheetEl); if (c) c.focus({ preventScroll: true }); }, 60);
    ui();
  }
  function closeSheet() {
    if (!sheet.open) return;
    sheet.open = false;
    sheetEl.classList.remove('is-open');
    overlay(false);
    setTimeout(() => { if (!sheet.open) sheetEl.hidden = true; }, reduced ? 0 : 480);
    if (sheet.last && sheet.last.focus) sheet.last.focus({ preventScroll: true });
  }
  $$('[data-sheet]').forEach(t => t.addEventListener('click', () => openSheet(t.dataset.sheet, t)));
  $$('[data-sheet-close]').forEach(b => b.addEventListener('click', closeSheet));

  // Keep keyboard focus inside whichever dialog is open
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const box = reader.open ? readerEl : sheet.open ? $('.sheet__panel', sheetEl) : article.open ? $('.sheet__panel', articleEl) : null;
    if (!box) return;
    const f = $$('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])', box).filter(el => el.offsetParent);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  if (/[?&]debug\b/.test(location.search)) window.__content = { news, openReader, closeReader, openArticle, closeArticle, openSheet, closeSheet, setCat, renderShelf };
})();
