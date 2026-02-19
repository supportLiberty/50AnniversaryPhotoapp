// =====================================================
// 50th Anniversary Photo Gallery
// Features: Collection tabs, Size toggle, Jump slider,
//           Filmstrip, Favorites, Albums/Tagging,
//           Admin visibility, Data publish
// =====================================================

(function () {
  'use strict';

  // --- State ---
  let allPhotos = [];
  let filteredPhotos = [];
  let displayedCount = 0;
  let currentLightboxIndex = -1;
  let slideshowInterval = null;
  let slideshowPlaying = false;
  let slideshowIndex = 0;
  let isLoadingMore = false;
  let allLoaded = false;
  let activeFilter = 'all';
  let favorites = new Set();

  // Albums state
  let albums = [];           // [{name, color, adminOnly}, ...]
  let photoAlbums = {};      // {photoId: [albumName, ...]}
  let albumVisibility = {};  // {albumName: true/false} - admin controls guest visibility

  // Admin / Delete state
  let adminMode = false;
  let hiddenPhotos = new Set();

  // --- DOM ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const gallery = $('#gallery');
  const loadingScreen = $('#loading-screen');
  const emptyState = $('#empty-state');
  const btnGallery = $('#btn-gallery');
  const btnSlideshow = $('#btn-slideshow');
  const jumpSlider = $('#jump-slider');
  const jumpLabel = $('#jump-label');
  const jumpTotal = $('#jump-total');
  const lightbox = $('#lightbox');
  const lightboxImg = $('#lightbox-img');
  const lightboxName = $('#lightbox-name');
  const lightboxCounter = $('#lightbox-counter');
  const lightboxFav = $('#lightbox-fav');
  const lightboxAlbumChips = $('#lightbox-album-chips');
  const lightboxAddAlbum = $('#lightbox-add-album');
  const collectionTabsContainer = $('#collection-tabs');
  const btnAdmin = $('#btn-admin');
  const lightboxDelete = $('#lightbox-delete');
  const btnPublish = $('#btn-publish');
  const slideshow = $('#slideshow');
  const slideshowImg = $('#slideshow-img');
  const slideshowImgNext = $('#slideshow-img-next');
  const slideshowName = $('#slideshow-name');
  const slideshowCounter = $('#slideshow-counter');
  const slideshowProgressBar = $('#slideshow-progress-bar');
  const playIcon = $('#play-icon');
  const pauseIcon = $('#pause-icon');
  const filmstripTrack = $('#filmstrip-track');

  // --- Image URLs ---
  function getThumbnailUrl(p) { return `https://lh3.googleusercontent.com/d/${p.id}=w${CONFIG.THUMBNAIL_SIZE}`; }
  function getFullUrl(p) { return `https://lh3.googleusercontent.com/d/${p.id}=w${CONFIG.LIGHTBOX_SIZE}`; }
  function getSmallThumbUrl(p) { return `https://lh3.googleusercontent.com/d/${p.id}=w80`; }

  // =========================================================
  // STORAGE
  // =========================================================
  function loadFavorites() {
    try { const s = localStorage.getItem('anniversary_favorites'); if (s) favorites = new Set(JSON.parse(s)); } catch(e) {}
  }
  function saveFavorites() {
    try { localStorage.setItem('anniversary_favorites', JSON.stringify([...favorites])); } catch(e) {}
  }

  function loadAlbums() {
    try {
      // Start with defaults
      albums = [...CONFIG.DEFAULT_ALBUMS];

      // Load album list from localStorage (may have custom albums added)
      const savedAlbums = localStorage.getItem('anniversary_albums');
      if (savedAlbums) {
        const parsed = JSON.parse(savedAlbums);
        // Merge: keep defaults, add any custom albums
        parsed.forEach(a => {
          if (!albums.find(x => x.name === a.name)) {
            albums.push(a);
          }
        });
      }

      // Load photo→album assignments
      // Priority: SAVED_DATA (shared) → localStorage (personal overrides)
      if (typeof SAVED_DATA !== 'undefined' && SAVED_DATA.photoAlbums) {
        photoAlbums = JSON.parse(JSON.stringify(SAVED_DATA.photoAlbums)); // deep copy
        // Layer personal localStorage on top
        const localPA = localStorage.getItem('anniversary_photo_albums');
        if (localPA) {
          const localParsed = JSON.parse(localPA);
          // Merge: localStorage overrides shared data per photo
          for (const pid in localParsed) {
            photoAlbums[pid] = localParsed[pid];
          }
        }
      } else {
        // No shared data, use localStorage only
        const pa = localStorage.getItem('anniversary_photo_albums');
        photoAlbums = pa ? JSON.parse(pa) : {};
      }

      // Load album visibility settings
      if (typeof SAVED_DATA !== 'undefined' && SAVED_DATA.albumVisibility) {
        albumVisibility = JSON.parse(JSON.stringify(SAVED_DATA.albumVisibility));
      }
      // Layer localStorage visibility on top
      const localVis = localStorage.getItem('anniversary_album_visibility');
      if (localVis) {
        const parsed = JSON.parse(localVis);
        Object.assign(albumVisibility, parsed);
      }
      // Set defaults: adminOnly albums default to hidden
      albums.forEach(a => {
        if (!(a.name in albumVisibility)) {
          albumVisibility[a.name] = !a.adminOnly;
        }
      });

    } catch(e) {
      albums = [...CONFIG.DEFAULT_ALBUMS];
      photoAlbums = {};
      albumVisibility = {};
      albums.forEach(a => { albumVisibility[a.name] = !a.adminOnly; });
    }
  }

  function saveAlbums() {
    try { localStorage.setItem('anniversary_albums', JSON.stringify(albums)); } catch(e) {}
  }
  function savePhotoAlbums() {
    try { localStorage.setItem('anniversary_photo_albums', JSON.stringify(photoAlbums)); } catch(e) {}
  }
  function saveAlbumVisibility() {
    try { localStorage.setItem('anniversary_album_visibility', JSON.stringify(albumVisibility)); } catch(e) {}
  }

  // =========================================================
  // HIDDEN PHOTOS (delete = hide)
  // =========================================================
  function loadHidden() {
    // Load from SAVED_DATA first, then layer localStorage
    if (typeof SAVED_DATA !== 'undefined' && SAVED_DATA.hiddenPhotos) {
      hiddenPhotos = new Set(SAVED_DATA.hiddenPhotos);
    }
    try {
      const s = localStorage.getItem('anniversary_hidden');
      if (s) {
        const arr = JSON.parse(s);
        arr.forEach(id => hiddenPhotos.add(id));
      }
    } catch(e) {}
  }
  function saveHidden() {
    try { localStorage.setItem('anniversary_hidden', JSON.stringify([...hiddenPhotos])); } catch(e) {}
  }
  function hidePhoto(photoId) {
    hiddenPhotos.add(photoId);
    saveHidden();
    updateOthersCount();
  }
  function restorePhoto(photoId) {
    hiddenPhotos.delete(photoId);
    saveHidden();
    updateOthersCount();
  }
  function updateOthersCount() {
    const el = document.getElementById('count-others');
    if (el) el.textContent = hiddenPhotos.size;
  }

  // =========================================================
  // ADMIN MODE
  // =========================================================
  function showPinModal() {
    const overlay = document.createElement('div');
    overlay.className = 'pin-modal-overlay';
    overlay.innerHTML = `
      <div class="pin-modal">
        <h3>Enter Admin PIN</h3>
        <p>Manage collections & publish data</p>
        <input type="password" class="pin-input" maxlength="10" autofocus inputmode="numeric">
        <div class="pin-modal-actions">
          <button class="pin-modal-btn cancel">Cancel</button>
          <button class="pin-modal-btn submit">Unlock</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.pin-input');
    const cancelBtn = overlay.querySelector('.cancel');
    const submitBtn = overlay.querySelector('.submit');

    function tryUnlock() {
      if (input.value === CONFIG.ADMIN_PIN) {
        adminMode = true;
        document.body.classList.add('admin-mode');
        btnAdmin.classList.add('active');
        // Show admin-only elements
        $$('.admin-only-el').forEach(el => el.style.display = '');
        updateOthersCount();
        renderCollectionTabs();
        overlay.remove();
      } else {
        input.classList.add('error');
        input.value = '';
        setTimeout(() => input.classList.remove('error'), 400);
      }
    }

    submitBtn.addEventListener('click', tryUnlock);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryUnlock();
      if (e.key === 'Escape') overlay.remove();
    });
    cancelBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    setTimeout(() => input.focus(), 100);
  }

  function exitAdminMode() {
    adminMode = false;
    document.body.classList.remove('admin-mode');
    btnAdmin.classList.remove('active');
    $$('.admin-only-el').forEach(el => el.style.display = 'none');
    renderCollectionTabs();
    if (activeFilter === 'others') applyFilter('all');
    // If viewing a hidden collection, switch to all
    if (activeFilter.startsWith('album:')) {
      const albumName = activeFilter.slice(6);
      if (!albumVisibility[albumName]) applyFilter('all');
    }
  }

  btnAdmin.addEventListener('click', () => {
    if (adminMode) exitAdminMode();
    else showPinModal();
  });

  // =========================================================
  // FAVORITES
  // =========================================================
  function toggleFavorite(photoId) {
    if (favorites.has(photoId)) favorites.delete(photoId);
    else favorites.add(photoId);
    saveFavorites();
    updateFavCount();
    document.querySelectorAll(`[data-fav-id="${photoId}"]`).forEach(btn => {
      btn.classList.toggle('is-fav', favorites.has(photoId));
    });
    if (lightboxFav) {
      const cp = filteredPhotos[currentLightboxIndex];
      if (cp && cp.id === photoId) {
        lightboxFav.classList.toggle('is-fav', favorites.has(photoId));
        lightboxFav.querySelector('svg').style.fill = favorites.has(photoId) ? 'var(--star-color)' : 'none';
      }
    }
    if (activeFilter === 'favorites') applyFilter('favorites');
  }

  function updateFavCount() {
    renderCollectionTabs();
  }

  // =========================================================
  // ALBUMS
  // =========================================================
  function getPhotoAlbums(photoId) {
    return photoAlbums[photoId] || [];
  }

  function togglePhotoAlbum(photoId, albumName) {
    if (!photoAlbums[photoId]) photoAlbums[photoId] = [];
    const idx = photoAlbums[photoId].indexOf(albumName);
    if (idx >= 0) photoAlbums[photoId].splice(idx, 1);
    else photoAlbums[photoId].push(albumName);
    if (photoAlbums[photoId].length === 0) delete photoAlbums[photoId];
    savePhotoAlbums();
    renderCollectionTabs();

    // Update card dots
    updateCardAlbumDots(photoId);

    // If filtering by this album, refresh
    if (activeFilter.startsWith('album:')) applyFilter(activeFilter);
  }

  function getAlbumColor(albumName) {
    const a = albums.find(a => a.name === albumName);
    return a ? a.color : '#888';
  }

  function getAlbumCount(albumName) {
    let count = 0;
    const visible = allPhotos.filter(p => !hiddenPhotos.has(p.id));
    for (const pid in photoAlbums) {
      if (photoAlbums[pid].includes(albumName)) {
        // Only count visible photos
        if (visible.find(p => p.id === pid)) count++;
      }
    }
    return count;
  }

  function addNewAlbum(name, color) {
    if (albums.find(a => a.name === name)) return false;
    albums.push({ name, color });
    albumVisibility[name] = true; // New albums visible by default
    saveAlbums();
    saveAlbumVisibility();
    renderCollectionTabs();
    return true;
  }

  // =========================================================
  // ALBUM VISIBILITY (Admin controls what guests see)
  // =========================================================
  function toggleAlbumVisibility(albumName) {
    albumVisibility[albumName] = !albumVisibility[albumName];
    saveAlbumVisibility();
    renderCollectionTabs();
  }

  // =========================================================
  // COLLECTION TABS (Primary Navigation)
  // =========================================================
  function renderCollectionTabs() {
    collectionTabsContainer.innerHTML = '';

    albums.forEach(album => {
      const count = getAlbumCount(album.name);
      const isVisible = albumVisibility[album.name] !== false;
      const isAdminOnly = album.adminOnly === true;

      // In guest mode: only show visible collections with photos
      if (!adminMode) {
        if (!isVisible || count === 0) return;
      }
      // In admin mode: show all collections (even empty, even hidden)

      const btn = document.createElement('button');
      const isActive = activeFilter === 'album:' + album.name;
      btn.className = 'album-filter-tab' + (isActive ? ' active' : '') + (!isVisible ? ' album-hidden' : '');
      btn.dataset.filter = 'album:' + album.name;
      if (isActive) {
        btn.style.background = album.color;
        btn.style.borderColor = album.color;
      }

      let html = `<span class="album-dot" style="background:${album.color}"></span>${album.name} <span class="filter-count">${count}</span>`;

      // Admin: add visibility toggle
      if (adminMode) {
        const eyeIcon = isVisible
          ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
          : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
        html += `<span class="album-vis-toggle" data-album="${album.name}" title="${isVisible ? 'Visible to guests (click to hide)' : 'Hidden from guests (click to show)'}">${eyeIcon}</span>`;
      }

      btn.innerHTML = html;

      // Click on the tab itself → filter
      btn.addEventListener('click', (e) => {
        // If clicked on visibility toggle, handle that instead
        if (e.target.closest('.album-vis-toggle')) {
          e.stopPropagation();
          toggleAlbumVisibility(album.name);
          return;
        }
        applyFilter('album:' + album.name);
      });

      collectionTabsContainer.appendChild(btn);
    });

    // Favorites tab at the end of collections
    const favCount = favorites.size;
    if (favCount > 0 || adminMode) {
      const favBtn = document.createElement('button');
      const isFavActive = activeFilter === 'favorites';
      const favColor = '#F59E0B';
      favBtn.className = 'album-filter-tab' + (isFavActive ? ' active' : '');
      favBtn.dataset.filter = 'favorites';
      if (isFavActive) {
        favBtn.style.background = favColor;
        favBtn.style.borderColor = favColor;
      }
      favBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="${favColor}" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>Favorites <span class="filter-count">${favCount}</span>`;
      favBtn.addEventListener('click', () => applyFilter('favorites'));
      collectionTabsContainer.appendChild(favBtn);
    }
  }

  // =========================================================
  // ALBUM UI - Lightbox Chips
  // =========================================================
  function renderLightboxAlbumChips(photoId) {
    lightboxAlbumChips.innerHTML = '';
    const pa = getPhotoAlbums(photoId);

    albums.forEach((album, idx) => {
      const chip = document.createElement('button');
      const isActive = pa.includes(album.name);
      chip.className = 'album-chip' + (isActive ? ' active' : '');
      if (isActive) {
        chip.style.background = album.color;
        chip.style.borderColor = album.color;
      }

      const shortcutKey = idx < 9 ? idx + 1 : '';
      chip.innerHTML = `<span class="chip-dot" style="background:${album.color}"></span>${album.name}${shortcutKey ? `<span class="chip-key">${shortcutKey}</span>` : ''}`;

      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePhotoAlbum(photoId, album.name);
        renderLightboxAlbumChips(photoId);
      });
      lightboxAlbumChips.appendChild(chip);
    });
  }

  // =========================================================
  // ALBUM UI - Card Dots
  // =========================================================
  function updateCardAlbumDots(photoId) {
    const card = gallery.querySelector(`[data-photo-id="${photoId}"]`);
    if (!card) return;
    renderCardDots(card, photoId);
  }

  function renderCardDots(card, photoId) {
    let dotsContainer = card.querySelector('.photo-album-dots');
    if (dotsContainer) dotsContainer.remove();

    const pa = getPhotoAlbums(photoId);
    if (pa.length === 0) return;

    dotsContainer = document.createElement('div');
    dotsContainer.className = 'photo-album-dots';
    pa.forEach(name => {
      const dot = document.createElement('div');
      dot.className = 'photo-album-dot';
      dot.style.background = getAlbumColor(name);
      dot.title = name;
      dotsContainer.appendChild(dot);
    });
    card.appendChild(dotsContainer);
  }

  // =========================================================
  // NEW ALBUM MODAL
  // =========================================================
  const PALETTE = ['#E67E22','#E91E63','#9C27B0','#2196F3','#4CAF50','#FF9800','#00BCD4','#795548','#F44336','#3F51B5','#009688','#FF5722','#607D8B','#CDDC39'];

  function showNewAlbumModal() {
    let selectedColor = PALETTE[Math.floor(Math.random() * PALETTE.length)];

    const overlay = document.createElement('div');
    overlay.className = 'album-modal-overlay';

    overlay.innerHTML = `
      <div class="album-modal">
        <h3>Create New Album</h3>
        <input type="text" class="album-modal-input" placeholder="Album name (e.g. Dance, Speeches...)" autofocus maxlength="30">
        <div class="album-modal-colors"></div>
        <div class="album-modal-actions">
          <button class="album-modal-btn cancel">Cancel</button>
          <button class="album-modal-btn create">Create</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector('.album-modal-input');
    const colorsDiv = overlay.querySelector('.album-modal-colors');
    const cancelBtn = overlay.querySelector('.cancel');
    const createBtn = overlay.querySelector('.create');

    // Render color palette
    PALETTE.forEach(c => {
      const swatch = document.createElement('div');
      swatch.className = 'album-color-option' + (c === selectedColor ? ' selected' : '');
      swatch.style.background = c;
      swatch.addEventListener('click', () => {
        selectedColor = c;
        colorsDiv.querySelectorAll('.album-color-option').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
      });
      colorsDiv.appendChild(swatch);
    });

    function doCreate() {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      addNewAlbum(name, selectedColor);
      overlay.remove();
      // Re-render lightbox chips if open
      if (currentLightboxIndex >= 0) {
        renderLightboxAlbumChips(filteredPhotos[currentLightboxIndex].id);
      }
    }

    cancelBtn.addEventListener('click', () => overlay.remove());
    createBtn.addEventListener('click', doCreate);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCreate(); if (e.key === 'Escape') overlay.remove(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    setTimeout(() => input.focus(), 100);
  }

  lightboxAddAlbum.addEventListener('click', (e) => {
    e.stopPropagation();
    showNewAlbumModal();
  });

  // =========================================================
  // PUBLISH DATA (Export for sharing)
  // =========================================================
  function publishData() {
    const data = {
      photoAlbums: photoAlbums,
      hiddenPhotos: [...hiddenPhotos],
      albumVisibility: albumVisibility
    };
    const json = JSON.stringify(data);
    const jsContent = `// Published album data - generated ${new Date().toLocaleString()}\n// Total tagged photos: ${Object.keys(photoAlbums).length}\n// Hidden photos: ${hiddenPhotos.size}\n\nconst SAVED_DATA = ${JSON.stringify(data, null, 2)};\n`;

    // Show modal with the data
    const overlay = document.createElement('div');
    overlay.className = 'album-modal-overlay';
    overlay.innerHTML = `
      <div class="publish-modal">
        <h3>Publish Collection Data</h3>
        <p class="publish-stats">
          Tagged photos: <strong>${Object.keys(photoAlbums).length}</strong> &middot;
          Hidden: <strong>${hiddenPhotos.size}</strong> &middot;
          Collections: <strong>${albums.length}</strong>
        </p>
        <p class="publish-instructions">Copy the text below and paste it to Claude to update the shared gallery:</p>
        <textarea class="publish-textarea" readonly>${jsContent}</textarea>
        <div class="publish-actions">
          <button class="pin-modal-btn cancel">Close</button>
          <button class="pin-modal-btn submit" id="copy-publish-data">Copy to Clipboard</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const textarea = overlay.querySelector('.publish-textarea');
    const copyBtn = overlay.querySelector('#copy-publish-data');
    const cancelBtn = overlay.querySelector('.cancel');

    copyBtn.addEventListener('click', () => {
      textarea.select();
      navigator.clipboard.writeText(jsContent).then(() => {
        copyBtn.textContent = 'Copied!';
        copyBtn.style.background = '#4CAF50';
        setTimeout(() => {
          copyBtn.textContent = 'Copy to Clipboard';
          copyBtn.style.background = '';
        }, 2000);
      }).catch(() => {
        // Fallback
        textarea.select();
        document.execCommand('copy');
        copyBtn.textContent = 'Copied!';
      });
    });

    cancelBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    textarea.addEventListener('click', () => textarea.select());
  }

  if (btnPublish) {
    btnPublish.addEventListener('click', (e) => {
      e.stopPropagation();
      publishData();
    });
  }

  // =========================================================
  // INIT
  // =========================================================
  function init() {
    loadFavorites();
    loadAlbums();
    loadHidden();
    allPhotos = typeof PHOTOS !== 'undefined' ? PHOTOS : [];

    if (allPhotos.length === 0) {
      loadingScreen.classList.add('hidden');
      emptyState.style.display = 'block';
      return;
    }

    // Count visible photos
    const visiblePhotos = allPhotos.filter(p => !hiddenPhotos.has(p.id));
    const countAll = document.getElementById('count-all');
    if (countAll) countAll.textContent = visiblePhotos.length;
    updateOthersCount();
    updateFavCount();
    renderCollectionTabs();

    applyFilter('album:Couple Entry');
    setupFilterTabs();
    setupSizeToggle();
    setupJumpSlider();

    loadingScreen.classList.add('hidden');
  }

  // =========================================================
  // FILTER
  // =========================================================
  function applyFilter(filter) {
    activeFilter = filter;

    if (filter === 'others') {
      // Show only photos moved to Others
      filteredPhotos = allPhotos.filter(p => hiddenPhotos.has(p.id));
    } else {
      // Start with visible photos (exclude hidden)
      const visible = allPhotos.filter(p => !hiddenPhotos.has(p.id));

      if (filter === 'all') {
        filteredPhotos = visible;
      } else if (filter === 'favorites') {
        filteredPhotos = visible.filter(p => favorites.has(p.id));
      } else if (filter.startsWith('album:')) {
        const albumName = filter.slice(6);
        filteredPhotos = visible.filter(p => (photoAlbums[p.id] || []).includes(albumName));
      } else {
        // Legacy folder filter (keep for backward compat)
        filteredPhotos = visible.filter(p => p.folder === filter);
      }
    }

    // Update All Photos / Favorites / Others tabs
    $$('.filter-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.filter === filter);
    });
    // Update collection tabs
    renderCollectionTabs();

    // Reset gallery
    gallery.innerHTML = '';
    displayedCount = 0;
    allLoaded = false;
    isLoadingMore = false;

    if (filteredPhotos.length === 0) {
      emptyState.style.display = 'block';
      gallery.style.display = 'none';
    } else {
      emptyState.style.display = 'none';
      gallery.style.display = '';
      renderBatch();
    }

    jumpSlider.max = Math.max(0, filteredPhotos.length - 1);
    jumpSlider.value = 0;
    jumpTotal.textContent = `of ${filteredPhotos.length}`;
    jumpLabel.textContent = filteredPhotos.length > 0 ? 'Photo 1' : 'No photos';
  }

  function setupFilterTabs() {
    $$('.filter-tab').forEach(tab => {
      if (tab.dataset.filter && !tab.dataset.filter.startsWith('album:') && tab.id !== 'btn-publish') {
        tab.addEventListener('click', () => applyFilter(tab.dataset.filter));
      }
    });
  }

  // =========================================================
  // SIZE TOGGLE
  // =========================================================
  function setupSizeToggle() {
    $$('.size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        gallery.className = `gallery gallery-${btn.dataset.size}`;
      });
    });
  }

  // =========================================================
  // JUMP SLIDER
  // =========================================================
  function setupJumpSlider() {
    jumpSlider.addEventListener('input', () => {
      const target = parseInt(jumpSlider.value);
      jumpLabel.textContent = `Photo ${target + 1}`;
      while (displayedCount <= target && !allLoaded) renderBatchSync();
      const cards = gallery.querySelectorAll('.photo-card');
      if (cards[target]) cards[target].scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    let scrollTick = false;
    window.addEventListener('scroll', () => {
      if (scrollTick) return;
      scrollTick = true;
      requestAnimationFrame(() => { updateJumpSliderFromScroll(); scrollTick = false; });
    });
  }

  function updateJumpSliderFromScroll() {
    const cards = gallery.querySelectorAll('.photo-card');
    if (cards.length === 0) return;
    const mid = window.innerHeight / 2;
    let best = 0, bestDist = Infinity;
    const step = Math.max(1, Math.floor(cards.length / 50));
    for (let i = 0; i < cards.length; i += step) {
      const r = cards[i].getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    const lo = Math.max(0, best - step), hi = Math.min(cards.length - 1, best + step);
    for (let i = lo; i <= hi; i++) {
      const r = cards[i].getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    jumpSlider.value = best;
    jumpLabel.textContent = `Photo ${best + 1}`;
  }

  // =========================================================
  // RENDER
  // =========================================================
  function renderBatch() {
    if (isLoadingMore || allLoaded) return;
    isLoadingMore = true;
    const start = displayedCount;
    const end = Math.min(start + CONFIG.BATCH_SIZE, filteredPhotos.length);
    const fragment = document.createDocumentFragment();
    for (let i = start; i < end; i++) fragment.appendChild(createPhotoCard(filteredPhotos[i], i));
    const sentinel = gallery.querySelector('.load-more-sentinel');
    if (sentinel) sentinel.remove();
    gallery.appendChild(fragment);
    displayedCount = end;
    if (displayedCount < filteredPhotos.length) {
      const s = document.createElement('div');
      s.className = 'load-more-sentinel';
      s.innerHTML = `<div class="load-more-spinner"></div><div>Loading more... (${displayedCount} of ${filteredPhotos.length})</div>`;
      gallery.appendChild(s);
      observeSentinel(s);
    } else { allLoaded = true; }
    isLoadingMore = false;
  }

  function renderBatchSync() {
    if (allLoaded) return;
    const start = displayedCount;
    const end = Math.min(start + CONFIG.BATCH_SIZE, filteredPhotos.length);
    const fragment = document.createDocumentFragment();
    for (let i = start; i < end; i++) fragment.appendChild(createPhotoCard(filteredPhotos[i], i));
    const sentinel = gallery.querySelector('.load-more-sentinel');
    if (sentinel) sentinel.remove();
    gallery.appendChild(fragment);
    displayedCount = end;
    if (displayedCount >= filteredPhotos.length) allLoaded = true;
  }

  // =========================================================
  // PHOTO CARD
  // =========================================================
  function createPhotoCard(photo, index) {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.dataset.photoId = photo.id;
    card.style.animationDelay = `${Math.min((index - (displayedCount || 0)), 20) * 0.02}s`;

    const placeholder = document.createElement('div');
    placeholder.className = 'photo-placeholder';
    placeholder.textContent = '\u2727';
    card.appendChild(placeholder);

    const img = document.createElement('img');
    img.className = 'loading';
    img.alt = photo.name || '';
    img.loading = 'lazy';
    img.decoding = 'async';

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { img.src = getThumbnailUrl(photo); observer.unobserve(card); }
      });
    }, { rootMargin: '300px' });
    observer.observe(card);

    img.onload = () => { img.classList.remove('loading'); placeholder.style.display = 'none'; };
    img.onerror = () => { placeholder.textContent = '\u2717'; placeholder.style.color = '#ccc'; placeholder.style.fontSize = '1.5rem'; };
    card.appendChild(img);

    // Album dots
    renderCardDots(card, photo.id);

    // Favorite button
    const favBtn = document.createElement('button');
    favBtn.className = 'photo-fav-btn' + (favorites.has(photo.id) ? ' is-fav' : '');
    favBtn.dataset.favId = photo.id;
    favBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
    favBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(photo.id); });
    card.appendChild(favBtn);

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'photo-overlay';
    const nameEl = document.createElement('div');
    nameEl.className = 'photo-name';
    nameEl.textContent = photo.name ? photo.name.replace(/\.[^.]+$/, '') : `Photo ${index + 1}`;
    overlay.appendChild(nameEl);
    card.appendChild(overlay);

    // Delete button (visible only in admin mode via CSS)
    const delBtn = document.createElement('button');
    delBtn.className = 'photo-delete-btn';
    delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    delBtn.title = 'Delete';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hidePhoto(photo.id);
      card.style.transition = 'opacity 0.3s, transform 0.3s';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.8)';
      setTimeout(() => { card.remove(); }, 300);
    });
    card.appendChild(delBtn);

    // Restore button (for Others view)
    if (activeFilter === 'others') {
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'photo-restore-btn';
      restoreBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 105.64-11.36L1 10"/></svg>';
      restoreBtn.title = 'Restore';
      restoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        restorePhoto(photo.id);
        card.style.transition = 'opacity 0.3s, transform 0.3s';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.8)';
        setTimeout(() => { card.remove(); }, 300);
      });
      card.appendChild(restoreBtn);
    }

    card.addEventListener('click', () => openLightbox(index));
    return card;
  }

  function observeSentinel(sentinel) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => { if (entry.isIntersecting) { obs.unobserve(sentinel); renderBatch(); } });
    }, { rootMargin: '400px' });
    obs.observe(sentinel);
  }

  // =========================================================
  // LIGHTBOX
  // =========================================================
  function openLightbox(index) {
    currentLightboxIndex = index;
    const photo = filteredPhotos[index];

    lightboxImg.style.opacity = '0.3';
    lightboxImg.src = getFullUrl(photo);
    lightboxImg.onload = () => { lightboxImg.style.opacity = '1'; };

    lightboxName.textContent = photo.name ? photo.name.replace(/\.[^.]+$/, '') : '';
    lightboxCounter.textContent = `${index + 1} / ${filteredPhotos.length}`;

    lightboxFav.classList.toggle('is-fav', favorites.has(photo.id));
    lightboxFav.querySelector('svg').style.fill = favorites.has(photo.id) ? 'var(--star-color)' : 'none';

    // Album chips
    renderLightboxAlbumChips(photo.id);

    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
    buildFilmstrip(index);
    preloadAdjacent(index);
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
    currentLightboxIndex = -1;
  }

  function lightboxNav(direction) {
    let i = currentLightboxIndex + direction;
    if (i < 0) i = filteredPhotos.length - 1;
    if (i >= filteredPhotos.length) i = 0;
    openLightbox(i);
  }

  function preloadAdjacent(index) {
    [-1, 1, 2].forEach(off => {
      const i = (index + off + filteredPhotos.length) % filteredPhotos.length;
      const img = new Image();
      img.src = getFullUrl(filteredPhotos[i]);
    });
  }

  $('.lightbox-close').addEventListener('click', closeLightbox);
  $('.lightbox-backdrop').addEventListener('click', closeLightbox);
  $('.lightbox-prev').addEventListener('click', () => lightboxNav(-1));
  $('.lightbox-next').addEventListener('click', () => lightboxNav(1));
  lightboxFav.addEventListener('click', () => {
    const p = filteredPhotos[currentLightboxIndex];
    if (p) toggleFavorite(p.id);
  });

  lightboxDelete.addEventListener('click', () => {
    if (!adminMode) return;
    const p = filteredPhotos[currentLightboxIndex];
    if (!p) return;

    if (activeFilter === 'others') {
      // Restore from Others
      restorePhoto(p.id);
    } else {
      // Move to Others
      hidePhoto(p.id);
    }

    // Move to next photo or close
    if (filteredPhotos.length <= 1) {
      closeLightbox();
      applyFilter(activeFilter);
    } else {
      // Refresh filtered list and navigate
      const wasIndex = currentLightboxIndex;
      applyFilter(activeFilter);
      const newIndex = Math.min(wasIndex, filteredPhotos.length - 1);
      if (filteredPhotos.length > 0) openLightbox(newIndex);
      else closeLightbox();
    }
  });

  // =========================================================
  // FILMSTRIP
  // =========================================================
  function buildFilmstrip(activeIndex) {
    filmstripTrack.innerHTML = '';
    const win = 30;
    const start = Math.max(0, activeIndex - Math.floor(win / 2));
    const end = Math.min(filteredPhotos.length, start + win);
    for (let i = start; i < end; i++) {
      const thumb = document.createElement('div');
      thumb.className = 'filmstrip-thumb' + (i === activeIndex ? ' active' : '');
      const img = document.createElement('img');
      img.src = getSmallThumbUrl(filteredPhotos[i]);
      img.alt = '';
      img.loading = 'lazy';
      thumb.appendChild(img);
      thumb.addEventListener('click', () => openLightbox(i));
      filmstripTrack.appendChild(thumb);
    }
    requestAnimationFrame(() => {
      const at = filmstripTrack.querySelector('.filmstrip-thumb.active');
      if (at) at.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  }

  // =========================================================
  // SLIDESHOW
  // =========================================================
  function openSlideshow() {
    slideshowIndex = currentLightboxIndex >= 0 ? currentLightboxIndex : 0;
    closeLightbox();
    showSlideshowImage(slideshowIndex);
    slideshow.classList.add('active');
    document.body.style.overflow = 'hidden';
    startSlideshow();
  }
  function closeSlideshow() {
    stopSlideshow();
    slideshow.classList.remove('active');
    document.body.style.overflow = '';
  }
  function showSlideshowImage(index) {
    const photo = filteredPhotos[index];
    const active = slideshowImg.style.opacity !== '0' ? slideshowImg : slideshowImgNext;
    const next = active === slideshowImg ? slideshowImgNext : slideshowImg;
    next.src = getFullUrl(photo);
    next.onload = () => { next.style.opacity = '1'; next.classList.remove('slideshow-img-hidden'); active.style.opacity = '0'; active.classList.add('slideshow-img-hidden'); };
    slideshowName.textContent = photo.name ? photo.name.replace(/\.[^.]+$/, '') : '';
    slideshowCounter.textContent = `${index + 1} / ${filteredPhotos.length}`;
    const ni = (index + 1) % filteredPhotos.length;
    const pre = new Image(); pre.src = getFullUrl(filteredPhotos[ni]);
  }
  function startSlideshow() {
    slideshowPlaying = true;
    playIcon.style.display = 'none'; pauseIcon.style.display = 'block';
    let elapsed = 0; const tick = 50;
    if (slideshowInterval) clearInterval(slideshowInterval);
    slideshowInterval = setInterval(() => {
      elapsed += tick;
      slideshowProgressBar.style.width = `${Math.min((elapsed / CONFIG.SLIDESHOW_INTERVAL) * 100, 100)}%`;
      if (elapsed >= CONFIG.SLIDESHOW_INTERVAL) {
        elapsed = 0;
        slideshowIndex = (slideshowIndex + 1) % filteredPhotos.length;
        showSlideshowImage(slideshowIndex);
      }
    }, tick);
  }
  function stopSlideshow() {
    slideshowPlaying = false;
    playIcon.style.display = 'block'; pauseIcon.style.display = 'none';
    if (slideshowInterval) { clearInterval(slideshowInterval); slideshowInterval = null; }
    slideshowProgressBar.style.width = '0%';
  }
  function toggleSlideshow() { if (slideshowPlaying) stopSlideshow(); else startSlideshow(); }
  function slideshowNav(dir) {
    stopSlideshow();
    slideshowIndex = (slideshowIndex + dir + filteredPhotos.length) % filteredPhotos.length;
    showSlideshowImage(slideshowIndex);
  }

  $('#slideshow-prev').addEventListener('click', () => slideshowNav(-1));
  $('#slideshow-next').addEventListener('click', () => slideshowNav(1));
  $('#slideshow-play').addEventListener('click', toggleSlideshow);
  $('#slideshow-close').addEventListener('click', closeSlideshow);

  btnGallery.addEventListener('click', () => { btnGallery.classList.add('active'); btnSlideshow.classList.remove('active'); closeSlideshow(); });
  btnSlideshow.addEventListener('click', () => { btnSlideshow.classList.add('active'); btnGallery.classList.remove('active'); openSlideshow(); });

  // =========================================================
  // KEYBOARD
  // =========================================================
  document.addEventListener('keydown', (e) => {
    // Modal open? Let modal handle it
    if (document.querySelector('.album-modal-overlay')) return;

    if (slideshow.classList.contains('active')) {
      switch (e.key) {
        case 'Escape': closeSlideshow(); break;
        case 'ArrowLeft': slideshowNav(-1); break;
        case 'ArrowRight': slideshowNav(1); break;
        case ' ': e.preventDefault(); toggleSlideshow(); break;
      }
      return;
    }

    if (lightbox.classList.contains('active')) {
      const photo = filteredPhotos[currentLightboxIndex];

      switch (e.key) {
        case 'Escape': closeLightbox(); break;
        case 'ArrowLeft': lightboxNav(-1); break;
        case 'ArrowRight': lightboxNav(1); break;
        case 'f': case 'F':
          if (photo) toggleFavorite(photo.id);
          break;
        case 'd': case 'D':
          if (adminMode && photo) lightboxDelete.click();
          break;
        default:
          // Number keys 1-9 for album shortcuts
          if (photo && e.key >= '1' && e.key <= '9') {
            const albumIdx = parseInt(e.key) - 1;
            if (albumIdx < albums.length) {
              togglePhotoAlbum(photo.id, albums[albumIdx].name);
              renderLightboxAlbumChips(photo.id);
            }
          }
          break;
      }
      return;
    }
  });

  // =========================================================
  // TOUCH SWIPE
  // =========================================================
  let touchStartX = 0, touchStartY = 0;
  function handleTouchStart(e) { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; }
  function createTouchEndHandler(navFn) {
    return (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { dx > 0 ? navFn(-1) : navFn(1); }
    };
  }
  lightbox.addEventListener('touchstart', handleTouchStart, { passive: true });
  lightbox.addEventListener('touchend', createTouchEndHandler(lightboxNav), { passive: true });
  slideshow.addEventListener('touchstart', handleTouchStart, { passive: true });
  slideshow.addEventListener('touchend', createTouchEndHandler(slideshowNav), { passive: true });

  // =========================================================
  // START
  // =========================================================
  init();
})();
