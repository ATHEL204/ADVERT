/* ============================================
   STOREFRONT OS — Portfolio Platform JS
   ============================================ */

'use strict';

// 1. Tell your login page exactly where your backend engine is listening
const AUTH_BASE = 'http://localhost:3005/auth';

// 2. This function runs when the developer clicks "Continue with Google"
function handleGoogleLogin() {
  // This smoothly redirects the browser straight to your active server route!
  window.location.href = `${AUTH_BASE}/google`;  
function gotoDashboard() {
    winndow.location.href = `http://localhost:5500/index.html?token=${Auth.token}`;
  }
}

// ── STATE ─────────────────────────────────
const App = {
  user: null,
  token: null,
  posts: [],
  activeFilter: 'all',
  currentPost: null,     // post being viewed for contact
  uploadedImages: [],    // base64 images for new post
  selectedCategory: null,
  selectedRateType: 'hourly',
  dashPanel: 'overview',
};

// ── CATEGORY CONFIG ───────────────────────
const CATEGORIES = [
  { id: 'dev',      label: 'Developer',  icon: '💻', color: 'var(--electric)' },
  { id: 'design',   label: 'Designer',   icon: '🎨', color: 'var(--purple)'   },
  { id: 'engineer', label: 'Engineer',   icon: '⚙️', color: 'var(--orange)'   },
  { id: 'video',    label: 'Video/Film', icon: '🎬', color: 'var(--red)'      },
  { id: '3d',       label: '3D / Art',   icon: '🧊', color: 'var(--green)'    },
  { id: 'other',    label: 'Other',      icon: '✦',  color: 'var(--pink)'     },
];

// ── SEED POSTS (demo data) ─────────────────
const SEED_POSTS = [
  {
    id: 'post-001',
    title: 'Full-Stack E-Commerce Platform',
    description: 'Built a multi-vendor marketplace with Node.js, React, and Stripe integration. Handles 10k+ daily transactions.',
    category: 'dev',
    images: [],
    link: 'https://github.com/ATHEL204',
    rate: '$85',
    rateType: 'hourly',
    author: { name: 'ATHEL204', role: 'Full-Stack Developer', avatar: null },
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    views: 142,
  },
  {
    id: 'post-002',
    title: 'Brand Identity — Lagos Streetwear',
    description: 'Complete brand system including logo, color palette, typography, and packaging design for a local fashion label.',
    category: 'design',
    images: [],
    link: 'https://behance.net',
    rate: 'Open to offers',
    rateType: 'open',
    author: { name: 'Amara D.', role: 'Brand Designer', avatar: null },
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    views: 89,
  },
  {
    id: 'post-003',
    title: 'Mechanical Engineering CAD Models',
    description: 'Precision CAD models for industrial components. SolidWorks / AutoCAD. Available for freelance projects.',
    category: 'engineer',
    images: [],
    link: '',
    rate: '$60',
    rateType: 'hourly',
    author: { name: 'Kofi A.', role: 'Mechanical Engineer', avatar: null },
    createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    views: 54,
  },
  {
    id: 'post-004',
    title: 'Cinematic Brand Video Production',
    description: 'Short-form brand videos, product showcases, and social media content. Professional 4K equipment.',
    category: 'video',
    images: [],
    link: 'https://youtube.com',
    rate: '$500',
    rateType: 'project',
    author: { name: 'Maya R.', role: 'Videographer', avatar: null },
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    views: 201,
  },
  {
    id: 'post-005',
    title: 'Blender 3D Character & Environment',
    description: 'Game-ready 3D assets, character rigs, and environment design. Unreal Engine 5 compatible.',
    category: '3d',
    images: [],
    link: 'https://artstation.com',
    rate: '$75',
    rateType: 'hourly',
    author: { name: 'Yuki T.', role: '3D Artist', avatar: null },
    createdAt: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
    views: 178,
  },
  {
    id: 'post-006',
    title: 'Web3 Smart Contract Development',
    description: 'Solidity smart contracts, DeFi protocol integration, and on-chain analytics dashboards. Base & Ethereum.',
    category: 'dev',
    images: [],
    link: 'https://github.com',
    rate: '$120',
    rateType: 'hourly',
    author: { name: 'James O.', role: 'Web3 Developer', avatar: null },
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    views: 312,
  },
];

// ── BOOT ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  App.posts = [...SEED_POSTS];
  checkAuth();
  renderPosts();
  renderFilterBar();
  initFilterBar();
  initModals();
  initCreatePost();
  initScrollAnimations();
  updateStats();

  // Read token from URL (redirected from login)
  const urlToken = new URLSearchParams(window.location.search).get('token');
  if (urlToken) {
    App.token = urlToken;
    sessionStorage.setItem('sf_token', urlToken);
    window.history.replaceState({}, '', window.location.pathname);
    decodeAndSetUser(urlToken);
  }
});

// ── AUTH ──────────────────────────────────
function checkAuth() {
  const token = sessionStorage.getItem('sf_token') || localStorage.getItem('sf_token');
  if (!token) return updateNavAuth(false);
  App.token = token;
  decodeAndSetUser(token);
}

function decodeAndSetUser(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // Check expiry
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      clearAuth();
      return;
    }
    App.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name || payload.email?.split('@')[0],
      avatar: payload.avatar,
      role: payload.role,
      verified: payload.verified,
    };
    updateNavAuth(true);
  } catch {
    clearAuth();
  }
}

function clearAuth() {
  App.user = null;
  App.token = null;
  sessionStorage.removeItem('sf_token');
  localStorage.removeItem('sf_token');
  updateNavAuth(false);
}

function updateNavAuth(loggedIn) {
  const navRight = document.getElementById('nav-right');
  if (!navRight) return;

  if (loggedIn && App.user) {
    navRight.innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="showDashboard()">Dashboard</button>
      <button class="btn btn-gold btn-sm" onclick="openCreatePost()">+ Post Work</button>
      <div style="display:flex;align-items:center;gap:8px;cursor:pointer;" onclick="showDashboard()">
        ${App.user.avatar
          ? `<img src="${App.user.avatar}" style="width:32px;height:32px;border-radius:50%;border:1.5px solid var(--border-gold);object-fit:cover;" alt="avatar">`
          : `<div style="width:32px;height:32px;border-radius:50%;background:var(--bg-elevated);border:1.5px solid var(--border-gold);display:flex;align-items:center;justify-content:center;font-family:var(--display);font-size:14px;color:var(--gold);">${(App.user.name||'U')[0].toUpperCase()}</div>`
        }
      </div>
    `;
  } else {
    navRight.innerHTML = `
      <div id="nav-status" class="nav-status" title="Backend status"></div>
      <a href="login.html" class="btn btn-ghost btn-sm">Sign In</a>
      <a href="login.html" class="btn btn-gold btn-sm">Get Started →</a>
    `;
  }
}

// ── FILTER BAR ────────────────────────────
function renderFilterBar() {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;

  const counts = { all: App.posts.length };
  CATEGORIES.forEach(c => {
    counts[c.id] = App.posts.filter(p => p.category === c.id).length;
  });

  bar.innerHTML = `
    <div class="filter-chip ${App.activeFilter === 'all' ? 'active' : ''}" onclick="setFilter('all')">
      ✦ All Work <span class="chip-count">${counts.all}</span>
    </div>
    ${CATEGORIES.map(c => `
      <div class="filter-chip ${App.activeFilter === c.id ? 'active' : ''}" onclick="setFilter('${c.id}')">
        ${c.icon} ${c.label} <span class="chip-count">${counts[c.id] || 0}</span>
      </div>
    `).join('')}
  `;
}

function initFilterBar() {}

function setFilter(cat) {
  App.activeFilter = cat;
  renderFilterBar();
  renderPosts();
}

// ── POSTS ─────────────────────────────────
function renderPosts() {
  const grid = document.getElementById('posts-grid');
  if (!grid) return;

  const filtered = App.activeFilter === 'all'
    ? App.posts
    : App.posts.filter(p => p.category === App.activeFilter);

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>NO POSTS YET</h3>
        <p>Be the first to post work in this category.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(post => renderPostCard(post)).join('');
}

function renderPostCard(post) {
  const cat = CATEGORIES.find(c => c.id === post.category) || CATEGORIES[5];
  const timeAgo = getTimeAgo(post.createdAt);
  const initials = (post.author.name || 'U')[0].toUpperCase();

  const rateDisplay = post.rateType === 'open'
    ? `<span class="post-rate open">Open to offers</span>`
    : post.rateType === 'hide'
    ? `<span class="post-rate hide">Rate on request</span>`
    : `<span class="post-rate">${post.rate}/${post.rateType === 'hourly' ? 'hr' : 'project'}</span>`;

  const imgSection = post.images && post.images.length > 0
    ? `<img src="${post.images[0]}" alt="${post.title}" style="width:100%;height:100%;object-fit:cover;">`
    : `<div class="post-img-placeholder">
        <span>${cat.icon}</span>
        <p>${cat.label}</p>
       </div>`;

  const linkBtn = post.link
    ? `<a href="${post.link}" target="_blank" class="post-link-btn" onclick="event.stopPropagation()">
        ↗ View Work
       </a>`
    : '';

  return `
    <div class="post-card animate-in" onclick="openContact('${post.id}')">
      <div class="post-images">
        ${imgSection}
        <span class="post-category-badge cat-${post.category}">${cat.icon} ${cat.label}</span>
      </div>
      <div class="post-body">
        <div class="post-author">
          <div class="post-avatar-initials">${initials}</div>
          <div class="post-author-info">
            <div class="post-author-name">${post.author.name}</div>
            <div class="post-author-role">${post.author.role}</div>
          </div>
          <div class="post-time">${timeAgo}</div>
        </div>
        <div class="post-title">${post.title}</div>
        <div class="post-description">${post.description}</div>
        <div class="post-footer">
          ${rateDisplay}
          <div style="display:flex;align-items:center;gap:10px;">
            ${linkBtn}
            <button class="post-contact-btn" onclick="event.stopPropagation();openContact('${post.id}')">
              ✉ Contact
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function updateStats() {
  const totalEl = document.getElementById('stat-total');
  const creatorsEl = document.getElementById('stat-creators');
  const catsEl = document.getElementById('stat-cats');
  if (totalEl) totalEl.textContent = App.posts.length;
  if (creatorsEl) {
    const unique = new Set(App.posts.map(p => p.author.name)).size;
    creatorsEl.textContent = unique;
  }
  if (catsEl) {
    const usedCats = new Set(App.posts.map(p => p.category)).size;
    catsEl.textContent = usedCats;
  }
}

// ── CONTACT MODAL ─────────────────────────
function openContact(postId) {
  App.currentPost = App.posts.find(p => p.id === postId);
  if (!App.currentPost) return;

  const modal = document.getElementById('contact-modal');
  const body = document.getElementById('contact-modal-body');
  if (!modal || !body) return;

  const post = App.currentPost;
  const initials = (post.author.name || 'U')[0].toUpperCase();
  const userPosts = App.posts.filter(p => p.author.name === post.author.name).length;

  if (!App.user) {
    // Show login gate
    body.innerHTML = `
      <div class="profile-hero">
        <div class="profile-avatar-lg-init">${initials}</div>
        <div class="profile-name">${post.author.name}</div>
        <div class="profile-role">${post.author.role}</div>
      </div>
      <div class="login-gate">
        <div class="gate-icon">🔐</div>
        <h3>LOGIN TO CONTACT</h3>
        <p>Create a free account to send a message, discuss rates, and hire <strong>${post.author.name}</strong> for your project.</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <a href="GoogleAuth/login.html" class="btn btn-gold btn-lg">Sign In →</a>
          <a href="GoogleAuth/login.html" class="btn btn-outline btn-lg">Create Account</a>
        </div>
      </div>
    `;
  } else {
    // Show contact form
    body.innerHTML = `
      <div class="profile-hero">
        <div class="profile-avatar-lg-init">${initials}</div>
        <div class="profile-name">${post.author.name}</div>
        <div class="profile-role">${post.author.role}</div>
        <div class="profile-stats">
          <div class="profile-stat">
            <div class="profile-stat-num">${userPosts}</div>
            <div class="profile-stat-label">Posts</div>
          </div>
          <div class="profile-stat">
            <div class="profile-stat-num">${post.views || 0}</div>
            <div class="profile-stat-label">Views</div>
          </div>
        </div>
      </div>
      <div class="contact-form">
        <h3>SEND MESSAGE</h3>
        <p>Reaching out about: <strong>${post.title}</strong></p>
        <div class="form-group">
          <label class="form-label">Your Name</label>
          <input class="form-input" id="contact-name" placeholder="Your name" value="${App.user.name || ''}" type="text">
        </div>
        <div class="form-group">
          <label class="form-label">Your Email</label>
          <input class="form-input" id="contact-email" placeholder="Your email" value="${App.user.email || ''}" type="email">
        </div>
        <div class="form-group">
          <label class="form-label">Message</label>
          <textarea class="form-input" id="contact-message" placeholder="Describe your project or what you need..." rows="4"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Budget (optional)</label>
          <input class="form-input" id="contact-budget" placeholder="e.g. $500 or Open to discussion" type="text">
        </div>
        <button class="btn btn-gold btn-full btn-lg" onclick="sendContactMessage()">
          Send Message →
        </button>
        ${post.link ? `<a href="${post.link}" target="_blank" class="btn btn-ghost btn-full btn-lg" style="margin-top:10px;">↗ View Their Work</a>` : ''}
      </div>
    `;
  }

  modal.classList.add('open');
}

function sendContactMessage() {
  const name = document.getElementById('contact-name')?.value?.trim();
  const email = document.getElementById('contact-email')?.value?.trim();
  const message = document.getElementById('contact-message')?.value?.trim();

  if (!name || !email || !message) {
    showToast('Please fill in all required fields', 'red');
    return;
  }

  const post = App.currentPost;
  // In production: POST to backend /api/messages
  console.log('[CONTACT]', { to: post.author.name, from: name, email, message });

  showToast(`✓ Message sent to ${post.author.name}!`, 'green');
  closeModal('contact-modal');
}

// ── CREATE POST MODAL ─────────────────────
function openCreatePost() {
  if (!App.user) {
    window.location.href = 'GoogleAuth/login.html';
    return;
  }
  App.uploadedImages = [];
  App.selectedCategory = null;
  App.selectedRateType = 'hourly';
  resetCreateForm();
  document.getElementById('create-modal').classList.add('open');
}

function resetCreateForm() {
  document.getElementById('post-title')?.setAttribute('value', '');
  document.getElementById('post-description')?.setAttribute('value', '');
  document.getElementById('post-link')?.setAttribute('value', '');
  document.getElementById('post-rate-value')?.setAttribute('value', '');
  if (document.getElementById('post-title')) document.getElementById('post-title').value = '';
  if (document.getElementById('post-description')) document.getElementById('post-description').value = '';
  if (document.getElementById('post-link')) document.getElementById('post-link').value = '';
  if (document.getElementById('post-rate-value')) document.getElementById('post-rate-value').value = '';

  document.querySelectorAll('.category-option').forEach(o => o.classList.remove('selected'));
  document.querySelectorAll('.rate-opt').forEach(o => {
    o.classList.toggle('selected', o.dataset.rate === 'hourly');
  });
  App.selectedRateType = 'hourly';
  document.getElementById('upload-previews').innerHTML = '';
}

function initCreatePost() {
  // Category options
  document.querySelectorAll('.category-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.category-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      App.selectedCategory = opt.dataset.cat;
    });
  });

  // Rate type options
  document.querySelectorAll('.rate-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.rate-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      App.selectedRateType = opt.dataset.rate;
      const rateInput = document.getElementById('post-rate-value');
      if (rateInput) {
        rateInput.style.display = ['open', 'hide'].includes(opt.dataset.rate) ? 'none' : 'block';
      }
    });
  });

  // Image upload
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('file-input');

  uploadArea?.addEventListener('click', () => fileInput?.click());

  uploadArea?.addEventListener('dragover', e => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });

  uploadArea?.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));

  uploadArea?.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });

  fileInput?.addEventListener('change', e => handleFiles(e.target.files));
}

function handleFiles(files) {
  const remaining = 4 - App.uploadedImages.length;
  const toProcess = Math.min(files.length, remaining);

  for (let i = 0; i < toProcess; i++) {
    const file = files[i];
    if (!file.type.startsWith('image/')) continue;

    const reader = new FileReader();
    reader.onload = e => {
      App.uploadedImages.push(e.target.result);
      renderUploadPreviews();
    };
    reader.readAsDataURL(file);
  }

  if (files.length > remaining) {
    showToast('Max 4 images per post', 'gold');
  }
}

function renderUploadPreviews() {
  const container = document.getElementById('upload-previews');
  if (!container) return;
  container.innerHTML = App.uploadedImages.map((src, i) => `
    <div class="upload-thumb">
      <img src="${src}" alt="preview ${i+1}">
      <button class="upload-thumb-remove" onclick="removeImage(${i})">✕</button>
    </div>
  `).join('');
}

function removeImage(index) {
  App.uploadedImages.splice(index, 1);
  renderUploadPreviews();
}

function submitPost() {
localStorage.setItem('sf_posts', JSON.stringify(App.posts));
  const title = document.getElementById('post-title')?.value?.trim();
  const description = document.getElementById('post-description')?.value?.trim();
  const link = document.getElementById('post-link')?.value?.trim();
  const rateValue = document.getElementById('post-rate-value')?.value?.trim();

  if (!title) { showToast('Please add a title', 'red'); return; }
  if (!App.selectedCategory) { showToast('Please select a category', 'red'); return; }
  if (!description) { showToast('Please add a description', 'red'); return; }

  const cat = CATEGORIES.find(c => c.id === App.selectedCategory);

  const newPost = {
    id: 'post-' + Date.now(),
    title,
    description,
    category: App.selectedCategory,
    images: [...App.uploadedImages],
    link: link || '',
    rate: ['open','hide'].includes(App.selectedRateType) ? '' : (rateValue || '$0'),
    rateType: App.selectedRateType,
    author: {
      name: App.user.name || App.user.email.split('@')[0],
      role: cat.label,
      avatar: App.user.avatar || null,
    },
    createdAt: new Date().toISOString(),
    views: 0,
  };

  // Prepend to posts
  App.posts.unshift(newPost);

  closeModal('create-modal');
  renderPosts();
  renderFilterBar();
  updateStats();

  showToast('✓ Post published!', 'green');

  // In production: POST to /api/posts
  console.log('[NEW POST]', newPost);
}

// ── DASHBOARD ─────────────────────────────
function showDashboard() {
  if (!App.user) { window.location.href = 'C:\Users\DAVE\Desktop\ADVERT\GoogleAuth\login.html'; return; }

  document.getElementById('main-content').style.display = 'none';
  document.getElementById('dashboard-content').style.display = 'block';

  renderDashboard();
  setDashPanel('overview');
}

function hideDashboard() {
  document.getElementById('main-content').style.display = 'block';
  document.getElementById('dashboard-content').style.display = 'none';
}

function renderDashboard() {
  if (!App.user) return;

  // User card
  const avatarEl = document.getElementById('dash-avatar');
  if (avatarEl) {
    avatarEl.textContent = (App.user.name || 'U')[0].toUpperCase();
  }
  const nameEl = document.getElementById('dash-name');
  const emailEl = document.getElementById('dash-email');
  if (nameEl) nameEl.textContent = App.user.name || 'User';
  if (emailEl) emailEl.textContent = App.user.email || '';

  // My posts
  const myPosts = App.posts.filter(p => p.author.name === (App.user.name || App.user.email.split('@')[0]));
  const myPostsGrid = document.getElementById('my-posts-grid');

  if (myPostsGrid) {
    if (myPosts.length === 0) {
      myPostsGrid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted);">
          <div style="font-size:40px;margin-bottom:12px;opacity:.3;">📭</div>
          <div style="font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:1px;">No posts yet</div>
          <button class="btn btn-gold btn-sm" style="margin-top:16px;" onclick="openCreatePost()">Post Your First Work</button>
        </div>
      `;
    } else {
      myPostsGrid.innerHTML = myPosts.map(post => {
        const cat = CATEGORIES.find(c => c.id === post.category) || CATEGORIES[5];
        return `
          <div class="my-post-card">
            <div class="my-post-img">
              ${post.images[0]
                ? `<img src="${post.images[0]}" alt="${post.title}">`
                : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:28px;color:var(--text-muted);">${cat.icon}</div>`}
            </div>
            <div class="my-post-body">
              <div class="my-post-title">${post.title}</div>
              <div class="my-post-meta">${cat.label} · ${getTimeAgo(post.createdAt)}</div>
              <div class="my-post-actions">
                <button class="btn btn-ghost btn-sm" onclick="deletePost('${post.id}')">Delete</button>
                ${post.link ? `<a href="${post.link}" target="_blank" class="btn btn-outline btn-sm">↗ Link</a>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Stats
  const totalViews = myPosts.reduce((s, p) => s + (p.views || 0), 0);
  document.getElementById('dash-stat-posts')?.textContent !== undefined &&
    (document.getElementById('dash-stat-posts').textContent = myPosts.length);
  document.getElementById('dash-stat-views')?.textContent !== undefined &&
    (document.getElementById('dash-stat-views').textContent = totalViews);
  document.getElementById('dash-stat-cats')?.textContent !== undefined &&
    (document.getElementById('dash-stat-cats').textContent = new Set(myPosts.map(p=>p.category)).size);
}

function setDashPanel(panel) {
  App.dashPanel = panel;
  document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.dash-nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('panel-' + panel)?.classList.add('active');
  document.querySelector(`[data-panel="${panel}"]`)?.classList.add('active');
}

function deletePost(postId) {
  if (!confirm('Delete this post?')) return;
  App.posts = App.posts.filter(p => p.id !== postId);
  renderPosts();
  renderFilterBar();
  updateStats();
  renderDashboard();
  showToast('Post deleted', 'red');
}

function logout() {
  clearAuth();
  hideDashboard();
  showToast('Signed out', 'gold');
}

// ── MODALS ────────────────────────────────
function initModals() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
      }
    });
  });

  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal-overlay')?.classList.remove('open');
    });
  });
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

// ── SCROLL ANIMATIONS ─────────────────────
function initScrollAnimations() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

  document.querySelectorAll('.animate-in').forEach(el => observer.observe(el));

  // Re-observe after posts render
  const grid = document.getElementById('posts-grid');
  if (grid) {
    const gridObserver = new MutationObserver(() => {
      grid.querySelectorAll('.animate-in:not(.visible)').forEach(el => observer.observe(el));
    });
    gridObserver.observe(grid, { childList: true });
  }
}

// ── TOAST ─────────────────────────────────
function showToast(msg, type = 'gold') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const colors = { gold: 'var(--gold)', green: 'var(--green)', red: 'var(--red)', electric: 'var(--electric)' };
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.border = `1px solid ${colors[type] || colors.gold}`;
  toast.style.color = colors[type] || colors.gold;
  toast.textContent = msg;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// ── HELPERS ───────────────────────────────
function getTimeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
