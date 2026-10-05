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
  // The six Cool News sections, in tab order. data/news.json's items carry one of these as `category`.
  const CATS = ['models', 'claude', 'projects', 'tools', 'repos', 'general'];
  const news = { items: [], cat: 'models', ready: false };
  const grid = $('[data-news-grid]'), readerGrid = $('[data-reader-grid]'), status = $('[data-news-status]');
  const fmtDate = iso => {
    const d = new Date(`${iso}T12:00:00`);
    return isNaN(d) ? esc(iso) : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // ---------- Use-case badges ----------
  // Each story is filed under the field it's useful in (the pipeline's `domain`, or worked out here from
  // its text). The badge — the field's gradient, a line icon and its name — leads every row and article.
  const DOMAINS = [
    ['logistics', 'Logistics', '#ff8a3d', '#b4330c', /logistic|freight|shipping|supply.?chain|warehouse|deliver|fleet|courier/g, 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
    ['health', 'Health & Medicine', '#ff6f91', '#c8103e', /health|medic|clinic|patient|fitness|workout|deadlift|exercise|doctor|biolog|drug|hospital|wellbeing/g, 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10zM5 12h4l1.5-3 3 6 1.5-3h4'],
    ['defense', 'Army & Defense', '#7b8a4a', '#2f3a1f', /military|army|defen[cs]e|warfare|missile|soldier|battlefield/g, 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM12 8l1.2 2.5 2.8.4-2 2 .5 2.8L12 14.4l-2.5 1.3.5-2.8-2-2 2.8-.4z'],
    ['security', 'Cybersecurity', '#4f7cff', '#1e1b4b', /secur|vulnerab|exploit|malware|guardrail|sandbox|privacy|pentest|threat|attack|kill every/g, 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 15v2'],
    ['finance', 'Finance', '#14b88a', '#065f46', /financ|trading|stock|invoice|accounting|bank|crypto|payment|budget|startup idea|investor/g, 'M4 20h16M6 16l4-5 3 3 5-7M15 7h3v3'],
    ['education', 'Education', '#f5a524', '#b45309', /educat|learn|student|kids|teach|course|tutor|school|math|classroom/g, 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5'],
    ['creative', 'Creative & Media', '#c084fc', '#db2777', /video|image|photo|music|\bart\b|design|animation|3d model|lego|\bcad\b|creative|audio|ui design|drawing/g, 'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3h2a5 5 0 0 0 5-5c0-4.5-4-8-9-8zM7.5 12h.01M9 7.5h.01M14 7h.01M17 10.5h.01'],
    ['games', 'Gaming', '#8b5cf6', '#4c1d95', /\bgames?\b|gaming|\bmods?\b|pac-?man|player|steam/g, 'M7 9h10a4 4 0 0 1 3.9 4.9l-.6 2.6a2 2 0 0 1-3.5.8L15 15H9l-1.8 2.3a2 2 0 0 1-3.5-.8l-.6-2.6A4 4 0 0 1 7 9zM8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01'],
    ['research', 'Science & Research', '#14b8d4', '#155e75', /research|paper|science|scientific|benchmark|dataset|academic/g, 'M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10'],
    ['data', 'Data & Analytics', '#0ea5e9', '#6d28d9', /\bdata\b|analytics|\bsql\b|dashboard|semantic layer|spreadsheet|metrics|\bbi\b/g, 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
    ['language', 'Language & Writing', '#f472b6', '#9d174d', /translat|language|japanese|writing|\bpdf\b|reading|grammar/g, 'M4 5h8M8 3v2M6 5c0 4 2 7 6 9M10 5c0 4-2 7-6 9M13 21l4-10 4 10M14.5 17h5'],
    ['productivity', 'Productivity', '#fb923c', '#e0306a', /meeting|notes|calendar|email|workspace|productiv|knowledge|search|record|assistant|coworker/g, 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2'],
    ['software', 'Software Development', '#ff6d34', '#7c2d12', /\bcode|coding|developer|agent|\bcli\b|repo|\bapi\b|programm|software|\bide\b|\bgit|plugin|harness|router/g, 'M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14'],
  ];
  const domainCache = new Map();
  function domainOf(it) {
    if (domainCache.has(it.id)) return domainCache.get(it.id);
    const named = it.domain && DOMAINS.find(d => d[0] === it.domain || d[1].toLowerCase() === String(it.domain).toLowerCase());
    let best = named || null;
    if (!best) {
      const text = [it.title, it.summary, it.howItWorks, it.endUser, ...(it.useCases || [])].filter(Boolean).join(' ').toLowerCase();
      let top = 0;
      for (const d of DOMAINS) {
        const n = (text.match(d[4]) || []).length * (d[0] === 'software' ? .6 : 1);   // "software" is the fallback, so it wins ties last
        if (n > top) { top = n; best = d; }
      }
    }
    best = best || DOMAINS[DOMAINS.length - 1];
    domainCache.set(it.id, best);
    return best;
  }

  const THUMB_UP = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 3 2l-1 4h5.5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.3 20H7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  const THUMB_DOWN = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M17 13V4h3v9zM17 13l-4 7a2 2 0 0 1-3-2l1-4H5.5a2 2 0 0 1-2-2.3l1.2-6A2 2 0 0 1 6.7 4H17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  const VERIFIED = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 1.8l2.4 1.8 3-.2 1 2.8 2.6 1.6-.7 2.9 1.2 2.8-2.2 2 .1 3-2.9.8-1.5 2.6-2.9-.8-2.6 1.4-2-2.2-3-.3-.5-3L1.6 15l1.3-2.7-.6-3 2.7-1.4.9-2.9 3 .1z" fill="var(--flare)"/><path d="M8 12.2l2.7 2.7L16.2 9.4" fill="none" stroke="var(--on-flare)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const count = (it, k) => (it[k] || 0) + (votes[it.id] === (k === 'likes' ? 1 : -1) ? 1 : 0);
  // One story = one row of a details list (no pictures — there are none to show): the use-case badge, the
  // headline with a one-line summary and a meta line (source, date, votes), and Read. Rows are compact, so
  // the section holds many stories; it shows as many as fit the screen without scrolling (fitRows) and
  // "View all" opens the rest. `.news-card` stays on the row as the hook for votes, opening and hover.
  function card(it, full) {
    const v = votes[it.id] || 0;
    const [key, label, c1, c2, , icon] = domainOf(it);
    const teaser = it.summary || it.howItWorks || '';
    return `
      <article class="news-card news-row${full ? ' news-row--full' : ''}" data-id="${esc(it.id)}">
        <span class="news-row__domain news-row__domain--${key}" style="--a:${c1};--b:${c2}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg><b>${esc(label)}</b>
        </span>
        <div class="news-row__main">
          <h3 class="news-row__title"><button type="button" class="news-card__title-btn" data-article-open>${esc(it.title)}</button>${it.official ? `<span class="news-card__check" role="img" aria-label="Official source" title="Official source">${VERIFIED}</span>` : ''}</h3>
          <p class="news-row__sum">${esc(teaser)}</p>
          <div class="news-row__meta">
            <a href="${esc(it.url || it.source.url)}" target="_blank" rel="noopener">${esc(it.source.name)} ↗</a><span aria-hidden="true">·</span><time datetime="${esc(it.published)}">${fmtDate(it.published)}</time>
            <span class="news-row__votes">
              <button class="vote" type="button" data-vote="1" aria-pressed="${v === 1}" aria-label="Like">${THUMB_UP}<b data-live>${count(it, 'likes')}</b></button>
              <button class="vote" type="button" data-vote="-1" aria-pressed="${v === -1}" aria-label="Dislike">${THUMB_DOWN}<b data-live>${count(it, 'dislikes')}</b></button>
            </span>
          </div>
        </div>
        <button class="news-card__open" type="button" data-article-open>Read <span aria-hidden="true">→</span></button>
      </article>`;
  }
  const inCat = () => news.items.filter(it => it.category === news.cat).sort((a, b) => (a.published < b.published ? 1 : -1));
  const moreBtn = $('[data-news-more]');
  const moreLabel = moreBtn && $('span', moreBtn);
  function renderNews(live) {
    if (!grid) return;
    const list = inCat();
    grid.innerHTML = news.ready
      ? (list.length ? list.map(it => card(it)).join('') : '<p class="news__empty">No stories here yet.</p>')
      : Array.from({ length: 5 }, () => '<div class="news-card news-row news-row--ghost" aria-hidden="true"><i></i><i></i><i></i></div>').join('');
    fitRows();
    if (live) refresh(grid);
  }
  // Show only the rows that fit above the section's bottom margin (and the "View all" button), so the
  // section never needs a vertical scroll; the rest live in the reader.
  function fitRows() {
    if (!grid) return;
    const rows = [...grid.children];
    rows.forEach(r => { r.hidden = false; });
    const panel = grid.closest('.panel'), inner = grid.closest('.panel__inner');
    if (!panel || !inner) return;
    const topIn = el => { let y = 0; for (let n = el; n && n !== panel; n = n.offsetParent) y += n.offsetTop; return y; };
    const padB = parseFloat(getComputedStyle(inner).paddingBottom) || 40;
    const moreH = moreBtn ? moreBtn.offsetHeight + 16 : 0;
    const limit = innerHeight - padB - moreH;
    let shown = 0;
    rows.forEach((r, i) => {
      const fits = topIn(r) + r.offsetHeight <= limit;
      if (!fits && i >= 2) r.hidden = true; else shown++;
    });
    const total = inCat().length;
    if (moreLabel) moreLabel.textContent = total > shown ? `View all ${total}` : 'Open the reader';
  }
  let fitQueued = 0;
  addEventListener('resize', () => { cancelAnimationFrame(fitQueued); fitQueued = requestAnimationFrame(() => { fitRows(); refresh(grid); }); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitRows(); refresh(grid); });
  function renderReader() {
    if (readerGrid) readerGrid.innerHTML = inCat().map(it => card(it, true)).join('');
  }
  function setCat(cat, live = true) {
    if (!CATS.includes(cat)) return;
    const changed = cat !== news.cat;
    news.cat = cat;
    $$('.news__tabs [data-cat]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.cat === cat)));
    if (changed) { renderNews(live); if (reader.open) renderReader(); }
  }
  $$('.news__tabs').forEach(t => t.addEventListener('click', e => {
    const b = e.target.closest('[data-cat]');
    if (b) { ui(); setCat(b.dataset.cat); }
  }));
  // the topic chips on the Home page pick the topic before flying to the news
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
  function setStatus(data) {
    if (status) status.textContent = `Updated ${fmtDate(String(data.updated || '').slice(0, 10))} · stories from the past week`;
  }
  renderNews(false);
  fetch(NEWS_URL, { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
    .then(data => {
      news.items = (data.items || []).filter(it => it && it.id && it.title && it.source);
      news.ready = true;
      setStatus(data);
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
      setStatus(data);
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
  // Running locally (python serve.py), the dev server runs the pipeline itself with the key on this
  // machine, so Refresh works without GitHub in the loop; hosted, it goes through the Worker below.
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  async function pullLocalNews() {
    const res = await fetch(`${NEWS_URL}?_=${Date.now()}`, { cache: 'no-cache' });
    const data = await res.json();
    news.items = (data.items || []).filter(it => it && it.id && it.title && it.source);
    renderNews(true);
    if (reader.open) renderReader();
    setStatus(data);
  }
  async function refreshLocally() {
    setRefreshLabel('Finding stories…', true);
    try {
      const res = await fetch('/api/news/refresh', { method: 'POST' });
      if (!res.ok) throw new Error(res.status);
    } catch (e) {
      setRefreshLabel('Run python serve.py to refresh', false);
      setTimeout(() => setRefreshLabel('Refresh', false), 4000);
      return;
    }
    const started = Date.now();
    const tick = async () => {
      let st;
      try { st = await (await fetch('/api/news/status', { cache: 'no-store' })).json(); } catch (e) { st = null; }
      if (st && st.state === 'running') {
        const secs = Math.round((Date.now() - started) / 1000);
        setRefreshLabel(secs < 20 ? 'Finding stories…' : `Writing articles… ${secs}s`, true);
        setTimeout(tick, 3000);
        return;
      }
      if (st && st.state === 'done') { await pullLocalNews(); setRefreshLabel('Refreshed', false); }
      else setRefreshLabel('Run failed — see the server log', false);
      setTimeout(() => setRefreshLabel('Refresh', false), 4000);
    };
    setTimeout(tick, 3000);
  }
  if (refreshBtn) refreshBtn.addEventListener('click', async () => {
    if (refreshBtn.disabled) return;
    ui();
    if (LOCAL) { refreshLocally(); return; }
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


  // =========================================================
  // Panels: every expanded panel (About sheets, an article, the news reader) grows out of the thing that
  // opened it and folds back into it — the iOS app-open motion: the panel starts exactly over the source
  // (moved, uniformly scaled, and clipped to the source's shape), then springs out to the dashboard frame
  // on Apple's curve while its content fades up. Transform, clip and opacity only; a new open/close
  // cancels whatever was still running, so rapid clicks never glitch.
  // =========================================================
  const SPRING = 'cubic-bezier(.32, .72, 0, 1)';
  const running = new WeakMap();
  function sourceFrame(panel, from) {
    const to = panel.getBoundingClientRect();
    const fr = from && from.isConnected ? from.getBoundingClientRect() : null;
    const r = parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 32;
    if (!fr || fr.width < 4 || fr.bottom < 0 || fr.top > innerHeight || !from.getClientRects().length) {
      return { transform: 'translate3d(0, 28px, 0) scale(.94)', clipPath: `inset(0 round ${r}px)`, opacity: 0 };
    }
    const s = Math.min(1, Math.max(fr.width / to.width, fr.height / to.height, .18));
    const dx = fr.left + fr.width / 2 - (to.left + to.width / 2), dy = fr.top + fr.height / 2 - (to.top + to.height / 2);
    // in the panel's own (unscaled) units the visible window is the source's size, centred
    const ix = Math.max(0, (to.width - fr.width / s) / 2), iy = Math.max(0, (to.height - fr.height / s) / 2);
    const fromR = (parseFloat(getComputedStyle(from).borderTopLeftRadius) || 20) / s;
    return { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${s})`, clipPath: `inset(${iy}px ${ix}px round ${fromR}px)`, opacity: 1 };
  }
  function morph(panel, from, open, done) {
    const prev = running.get(panel);
    if (prev) prev.forEach(a => a.cancel());
    if (reduced || !panel.animate) { if (done) done(); return; }
    const r = parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 32;
    const start = sourceFrame(panel, from);
    const end = { transform: 'none', clipPath: `inset(0 round ${r}px)`, opacity: 1 };
    const kids = [...panel.children];
    const anims = open
      ? [panel.animate([start, end], { duration: 640, easing: SPRING }),
        ...kids.map(k => k.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, delay: 140, easing: 'ease-out', fill: 'backwards' }))]
      : [panel.animate([end, start], { duration: 440, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' }),
        ...kids.map(k => k.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' }))];
    running.set(panel, anims);
    // finish once, whichever comes first: the animation ending, or its duration elapsing (a backgrounded
    // tab can hold an animation's clock, and a close must never leave a panel stuck on screen)
    let fired = false;
    const finish = () => {
      if (fired) return;
      fired = true;
      if (running.get(panel) === anims) running.delete(panel);
      if (done) done();
      if (!open) anims.forEach(a => a.cancel());   // drop the held end state once the panel is hidden
    };
    anims[0].finished.then(finish).catch(() => {});
    setTimeout(finish, (open ? 640 : 440) + 120);
  }
  // Inside a panel the wheel is eased the same way the page is (its own Lenis on the panel's scroller),
  // so reading a long article scrolls as smoothly as the site itself.
  function smoothScroll(el) {
    if (!el || reduced || !window.Lenis) return null;
    const l = new window.Lenis({ wrapper: el, content: el.firstElementChild || el, lerp: .1, smoothWheel: true, wheelMultiplier: .9 });
    let id = requestAnimationFrame(function tick(t) { l.raf(t); id = requestAnimationFrame(tick); });
    return { destroy() { cancelAnimationFrame(id); l.destroy(); } };
  }

  // ---------- Full-screen reader ("View more") ----------
  const readerEl = $('#news-reader');
  const reader = { open: false, last: null, from: null, scroll: null };
  function openReader(e) {
    if (!readerEl || reader.open) return;
    reader.open = true;
    reader.last = document.activeElement;
    reader.from = e && e.currentTarget;
    renderReader();
    readerEl.hidden = false;
    $('.reader__scroll', readerEl).scrollTop = 0;
    overlay(true, { hideScene: true, onEscape: closeReader });
    readerEl.classList.add('is-open');
    morph(readerEl, reader.from, true);
    reader.scroll = smoothScroll($('.reader__scroll', readerEl));
    setTimeout(() => { const c = $('[data-reader-close]', readerEl); if (c) c.focus({ preventScroll: true }); }, 60);
    ui();
  }
  function closeReader() {
    if (!reader.open) return;
    reader.open = false;
    if (reader.scroll) { reader.scroll.destroy(); reader.scroll = null; }
    overlay(false);
    morph(readerEl, reader.from, false, () => { if (!reader.open) { readerEl.classList.remove('is-open'); readerEl.hidden = true; } });
    if (reader.last && reader.last.focus) reader.last.focus({ preventScroll: true });
  }
  $$('[data-news-more]').forEach(b => b.addEventListener('click', openReader));
  $$('[data-reader-close]').forEach(b => b.addEventListener('click', closeReader));

  // ---------- Full article ("Read article") ----------
  // The pipeline (scripts/news/, docs/news-pipeline.md) writes each item as a strict set of
  // fields — never raw HTML — so a rewrite can never smuggle markup through into the page.
  // Anything without these fields yet (samples, or a story the pipeline hasn't reached) falls
  // back to showing its card summary as a single line.
  const CAT_NAMES = { models: 'Open Source AI Models', claude: 'Claude', projects: 'Cool AI Projects & Workflows', tools: 'Free Tools', repos: 'Top GitHub Repos of the Week', general: 'General Projects' };
  // A field the source didn't cover is left out entirely: no "Not stated" / "N/A" rows, ever.
  const EMPTY = /^\s*(none|n\/?a|not stated|not specified|not mentioned|not available|not applicable|unknown|unspecified|tbd|-+)\.?\s*$/i;
  const present = v => Array.isArray(v) ? v.some(x => typeof x === 'string' && !EMPTY.test(x)) : typeof v === 'string' && v.trim() && !EMPTY.test(v);

  // ---------- Workflow ----------
  // The "Workflow" steps render as a flow of numbered chips joined by arrows that wraps to the panel's
  // width, so every step stays at reading size however many there are.
  const ARROW_R = '<svg class="wf__arrow" viewBox="0 0 20 12" aria-hidden="true"><path d="M1 6h16M12 1l5 5-5 5"/></svg>';
  // the arrow belongs to the step it leaves, so a wrapped line never starts with an orphan arrow
  const workflowDiagram = steps => `<ol class="wf">${steps.map((x, i) => `<li class="wf__item"><span class="wf__step"><span class="wf__n">${i + 1}</span>${esc(x)}</span>${i < steps.length - 1 ? ARROW_R : ''}</li>`).join('')}</ol>`;

  // The article is laid out as a dashboard: a summary rail (the use-case art, the lede, the key facts and
  // the link out) beside a grid of spec cards, so most stories fit on one screen with little scrolling.
  const FACTS = [['Model', 'modelUsed'], ['Built by', 'builtBy'], ['Cost', 'costStructure'], ['Subscription', 'subscriptionsRequired'], ['Hardware', 'hardwareRequirements']];
  const CARDS = [
    ['How it works', 'howItWorks', 'text', true],
    ['Who it’s for', 'endUser', 'text'],
    ['What you give it', 'inputNeeded', 'text'],
    ['What you get back', 'outputGiven', 'text'],
    ['Tools used', 'toolsUsed', 'list'],
    ['Use cases', 'useCases', 'list'],
    ['Connects to', 'integrations', 'text'],
    ['Tips to save tokens', 'tips', 'list', true],
  ];
  const clean = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && !EMPTY.test(x)) : v);
  function renderTemplate(it) {
    const link = `<a class="article__original" href="${esc(it.url)}" target="_blank" rel="noopener">Open the original article <span aria-hidden="true">↗</span></a>`;
    const facts = FACTS.filter(([, k]) => present(it[k])).map(([l, k]) => `<div><dt>${esc(l)}</dt><dd>${esc(it[k])}</dd></div>`).join('');
    const aside = `<aside class="dash__aside">
        ${(([key, label, c1, c2, , icon]) => `<span class="news-row__domain news-row__domain--lg" style="--a:${c1};--b:${c2}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg><b>${esc(label)}</b></span>`)(domainOf(it))}
        ${it.topicTag ? `<span class="article__tag">${esc(it.topicTag)}</span>` : ''}
        ${it.summary ? `<p class="article__lede">${esc(it.summary)}</p>` : ''}
        ${facts ? `<dl class="dash__facts">${facts}</dl>` : ''}
        ${link}
      </aside>`;
    const steps = clean(it.workflow);
    const flow = present(steps) ? `<div class="article__field article__field--wide"><p class="article__field-label">Workflow</p>${workflowDiagram(steps)}</div>` : '';
    const cards = CARDS.map(([label, key, kind, wide]) => {
      const v = clean(it[key]);
      if (!present(v)) return '';
      const value = kind === 'list' ? `<ul class="article__list">${v.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p>${esc(v)}</p>`;
      return `<div class="article__field${wide ? ' article__field--wide' : ''}"><p class="article__field-label">${esc(label)}</p>${value}</div>`;
    }).join('');
    return `<div class="dash">${aside}<div class="dash__main">${flow}<div class="dash__grid">${cards}</div></div></div>`;
  }
  const articleEl = $('#article');
  const article = { open: false, last: null, from: null, scroll: null };
  function openArticle(id, from) {
    const it = news.items.find(x => x.id === id);
    if (!articleEl || article.open || !it) return;
    article.open = true;
    article.last = document.activeElement;
    article.from = from || null;
    const mins = it.readingTime || 1;
    $('[data-article-kicker]', articleEl).textContent = `${CAT_NAMES[it.category] || it.category} · ${fmtDate(it.published)} · ${mins} min read`;
    $('[data-article-title]', articleEl).textContent = it.title;
    $('[data-article-body]', articleEl).innerHTML = renderTemplate(it);
    $('[data-article-body]', articleEl).scrollTop = 0;
    articleEl.hidden = false;
    overlay(true, { hideScene: true, onEscape: closeArticle });
    articleEl.classList.add('is-open');
    morph($('.sheet__panel', articleEl), article.from, true);
    article.scroll = smoothScroll($('[data-article-body]', articleEl));
    setTimeout(() => { const c = $('[data-article-close]', articleEl); if (c) c.focus({ preventScroll: true }); }, 60);
    ui();
  }
  function closeArticle() {
    if (!article.open) return;
    article.open = false;
    if (article.scroll) { article.scroll.destroy(); article.scroll = null; }
    articleEl.classList.remove('is-open');
    overlay(false);
    morph($('.sheet__panel', articleEl), article.from, false, () => { if (!article.open) articleEl.hidden = true; });
    if (article.last && article.last.focus) article.last.focus({ preventScroll: true });
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-article-open]');
    if (!b) return;
    const card = b.closest('.news-card');
    if (card) { ui(); openArticle(card.dataset.id, card); }
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
  const sheet = { open: false, last: null, scroll: null };
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
    const inner = document.createElement('div');                 // one content box for the panel's Lenis to measure
    inner.className = 'sheet__inner';
    inner.appendChild(tpl.content.cloneNode(true));
    body.appendChild(inner);
    body.scrollTop = 0;
    sheetEl.dataset.sheet = id;
    sheetEl.hidden = false;
    // the scene fades out and stops drawing behind a panel, so the panel animates and scrolls on a free GPU
    overlay(true, { hideScene: true, onEscape: closeSheet });
    sheetEl.classList.add('is-open');
    morph($('.sheet__panel', sheetEl), sheet.last, true);
    sheet.scroll = smoothScroll(body);
    setTimeout(() => { const c = $('.sheet__head [data-sheet-close]', sheetEl); if (c) c.focus({ preventScroll: true }); }, 60);
    ui();
  }
  function closeSheet() {
    if (!sheet.open) return;
    sheet.open = false;
    if (sheet.scroll) { sheet.scroll.destroy(); sheet.scroll = null; }
    sheetEl.classList.remove('is-open');
    overlay(false);
    morph($('.sheet__panel', sheetEl), sheet.last, false, () => { if (!sheet.open) sheetEl.hidden = true; });
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
