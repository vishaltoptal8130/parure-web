// ─────────────────────────────────────────────────────────────────────
// Parure La Plee — UI Utilities
// Toast, confirm modal, theme toggle, skeleton, format helpers
// ─────────────────────────────────────────────────────────────────────

// ── TOAST NOTIFICATIONS ──
let _toastContainer = null;

function getToastContainer() {
  if (!_toastContainer) {
    _toastContainer = document.getElementById('toast-container');
    if (!_toastContainer) {
      _toastContainer = document.createElement('div');
      _toastContainer.id = 'toast-container';
      document.body.appendChild(_toastContainer);
    }
  }
  return _toastContainer;
}

export function toast(message, type = 'info', duration = 4000) {
  const container = getToastContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-dot"></span><span>${message}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, duration);
}

export const showSuccess = (msg) => toast(msg, 'success');
export const showError   = (msg) => toast(msg, 'error', 6000);
export const showInfo    = (msg) => toast(msg, 'info');

// ── CONFIRM MODAL ──
export function showConfirmModal({ title = 'Confirm Action', message = 'Are you sure?', btnText = 'Confirm', btnClass = 'btn-primary', onConfirm }) {
  const modal = document.getElementById('modal-confirm-action') || document.getElementById('modal-confirm');
  if (!modal) {
    if (confirm(message) && onConfirm) onConfirm();
    return;
  }

  const titleEl  = document.getElementById('confirm-modal-title') || document.getElementById('confirm-title');
  const msgEl    = document.getElementById('confirm-modal-message') || document.getElementById('confirm-message');
  const proceedEl = document.getElementById('confirm-modal-proceed') || document.getElementById('confirm-proceed');
  const cancelEl = document.getElementById('confirm-modal-cancel') || document.getElementById('confirm-cancel');

  if (titleEl) titleEl.textContent  = title;
  if (msgEl)   msgEl.textContent    = message;
  if (proceedEl) {
    proceedEl.textContent = btnText;
    proceedEl.className   = `btn ${btnClass}`;
  }

  const close = () => modal.classList.remove('active');

  const onProceed = async () => {
    close();
    cleanup();
    if (onConfirm) await onConfirm();
  };

  const onCancel = () => { close(); cleanup(); };

  const cleanup = () => {
    proceedEl?.removeEventListener('click', onProceed);
    cancelEl?.removeEventListener('click', onCancel);
  };

  proceedEl?.addEventListener('click', onProceed);
  cancelEl?.addEventListener('click', onCancel);
  modal.classList.add('active');
}

// Make globally available
if (typeof window !== 'undefined') {
  window.showConfirmModal = showConfirmModal;
}

// ── THEME ──
const THEME_KEY = 'parure-admin-theme';

export function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  updateThemeIcon(theme);
}

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const theme = saved || getSystemTheme();
  applyTheme(theme);
  return theme;
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function updateThemeIcon(theme) {
  document.querySelectorAll('[data-theme-icon]').forEach(el => {
    el.innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon;
  });
  document.querySelectorAll('.theme-icon-sun').forEach(el => {
    el.style.display = theme === 'dark' ? 'block' : 'none';
  });
  document.querySelectorAll('.theme-icon-moon').forEach(el => {
    el.style.display = theme === 'dark' ? 'none' : 'block';
  });
}

// ── FORMAT HELPERS ──
export function fmt(cents) {
  if (cents === null || cents === undefined || cents === '') return '$0.00';
  let n = Number(cents);
  if (isNaN(n)) return '$0.00';
  if (n >= 100 && Number.isInteger(n)) n /= 100;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(iso, opts = {}) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', ...opts });
  } catch { return '—'; }
}

export function fmtDateLong(iso) {
  return fmtDate(iso, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function fmtNum(n) {
  return (n || 0).toLocaleString();
}

export function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function initial(name) {
  return (name || 'U').trim().charAt(0).toUpperCase();
}

export function slug(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

// ── DEBOUNCE ──
export function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ── INLINE SVG ICONS ──
export const ICONS = {
  overview:     `<svg class="icon" viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>`,
  creators:     `<svg class="icon" viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
  marketplace:  `<svg class="icon" viewBox="0 0 24 24"><path d="M20 4H4v2l8 5 8-5V4zm0 4.92L12 14 4 8.92V20h16V8.92z"/></svg>`,
  orders:       `<svg class="icon" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
  users:        `<svg class="icon" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
  beta:         `<svg class="icon" viewBox="0 0 24 24"><path d="M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/></svg>`,
  notifications:`<svg class="icon" viewBox="0 0 24 24"><path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57-.35-.11-.74-.03-1.02.24l-2.2 2.2c-2.83-1.44-5.15-3.75-6.59-6.59l2.2-2.21c.28-.26.36-.65.25-1C8.7 6.45 8.5 5.25 8.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1z"/></svg>`,
  affiliate:    `<svg class="icon" viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>`,
  settings:     `<svg class="icon" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`,
  logout:       `<svg class="icon" viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>`,
  refresh:      `<svg class="icon" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`,
  sun:          `<svg class="icon" viewBox="0 0 24 24"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2v-2H2v2zm18 0h2v-2h-2v2zM11 2v2h2V2h-2zm0 18v2h2v-2h-2zM5.99 4.58l-1.42 1.42 1.41 1.41 1.42-1.42-1.41-1.41zm12.02 12.01l-1.41-1.41-1.42 1.42 1.41 1.41 1.42-1.42zM5.99 19.42l1.42-1.41-1.41-1.42-1.42 1.41 1.41 1.42zM18.01 4.58l-1.41 1.41 1.41 1.42 1.42-1.41-1.42-1.42z"/></svg>`,
  moon:         `<svg class="icon" viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>`,
  close:        `<svg class="icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>`,
  eye:          `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`,
  eyeOff:       `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.17c0-1.66-1.34-3-3-3l-.17.02z"/></svg>`,
  back:         `<svg class="icon" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`,
  print:        `<svg class="icon" viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>`,
  check:        `<svg class="icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`,
  add:          `<svg class="icon" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
  trash:        `<svg class="icon" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
  externalLink: `<svg class="icon" viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`,
};

// ── SUBNAV (USER DETAIL TABS) ──
export function initSubnav(barId, panesContainerId) {
  const bar = document.getElementById(barId);
  if (!bar) return;

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('.ud-subnav-btn');
    if (!btn) return;
    const targetId = btn.getAttribute('data-subtab');
    if (!targetId) return;

    bar.querySelectorAll('.ud-subnav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const container = document.getElementById(panesContainerId);
    if (container) {
      container.querySelectorAll('.ud-pane').forEach(p => {
        p.classList.toggle('hidden', p.id !== targetId);
      });
    }
  });
}

// ── REFRESH BUTTON STATE ──
export function setRefreshing(isRefreshing) {
  const icon = document.getElementById('refresh-icon');
  const text = document.getElementById('refresh-text');
  if (icon) icon.classList.toggle('spinning', isRefreshing);
  if (text) text.textContent = isRefreshing ? 'Refreshing…' : 'Refresh';
}
