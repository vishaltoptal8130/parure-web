// ─────────────────────────────────────────────────────────────────────
// Parure La Plee — Master Admin Orchestrator (Executive Console)
// ─────────────────────────────────────────────────────────────────────

import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  MASTER_ADMIN_EMAIL,
  PLATFORM_FEE_RATE,
  AFFILIATE_PAGE_SIZE,
  USER_CACHE_TTL
} from "./config.js";

import {
  initTheme,
  toggleTheme,
  showSuccess,
  showError,
  showInfo,
  showConfirmModal,
  fmt,
  fmtDate,
  fmtDateLong,
  fmtNum,
  timeAgo,
  initial,
  debounce,
  initSubnav,
  setRefreshing
} from "./ui.js";

import {
  resolveWardrobeUrls,
  resolveMarketplaceUrls,
  resolveAvatarUrl,
  resolveSelfieUrl
} from "./storage.js";

import {
  initAuth,
  showAuthView,
  showDashboardView,
  verifyAndLoadAdmin
} from "./auth.js";

import {
  initMarketplaceModule,
  renderMarketplaceTable,
  openListingDetailModal,
  closeListingDetailModal
} from "./marketplace.js";

// Initialize Supabase Client
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Application State
let currentUser = null;
let currentProfile = null;
let currentTransactionsData = [];
let activeViewingTx = null;
let allUsersData = [];
let currentAffiliatePage = 1;

// Profile In-Memory Cache
const userProfileCache = new Map();

document.addEventListener("DOMContentLoaded", () => {
  initTheme();

  if (!supabase) {
    console.error("Supabase CDN failed to load!");
    showError("Supabase client unavailable");
    return;
  }

  setupEventListeners();
  initMarketplaceModule(supabase);

  // Initialize Auth
  initAuth(supabase, async (user, profile) => {
    currentUser = user;
    currentProfile = profile;
    await loadAllDashboardData();
  });
});

// ─────────────────────────────────────────────────────────────────────
// NAVIGATION & EVENT LISTENERS
// ─────────────────────────────────────────────────────────────────────

function setupEventListeners() {
  // Theme Toggle Buttons
  document.querySelectorAll(".theme-toggle, [data-action='toggle-theme']").forEach(btn => {
    btn.addEventListener("click", () => {
      toggleTheme();
    });
  });

  // Navigation tab switching
  const tabDescriptions = {
    "tab-overview": "Executive operations, high-value queue, and ecosystem intelligence.",
    "tab-creators": "Partner vetting, influencer accreditation, and portfolio reviews.",
    "tab-marketplace": "Haute-couture archive, curation reviews, and authenticity verification.",
    "tab-orders": "Escrow ledger, Stripe Connect payouts, and money flow audits.",
    "tab-users": "360° client dossiers, Style Passports, and digital wardrobe records.",
    "tab-beta": "Exclusive iOS TestFlight & Android early-access invitations.",
    "tab-notifications": "Targeted push transmissions via Expo Notification Infrastructure.",
    "tab-affiliate": "Curated multi-network affiliate catalog sync and feed control.",
    "tab-settings": "Master security protocols, credentials, and console preferences."
  };

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach((p) => p.classList.add("hidden"));

      item.classList.add("active");
      const targetTabId = item.getAttribute("data-tab");
      const targetPane = document.getElementById(targetTabId);
      if (targetPane) targetPane.classList.remove("hidden");

      const tabTitle = item.querySelector(".nav-label")?.innerText || item.innerText.trim();
      const titleEl = document.getElementById("current-tab-title");
      const descEl = document.getElementById("current-tab-desc");

      if (titleEl) titleEl.innerText = tabTitle;
      if (descEl) descEl.innerText = tabDescriptions[targetTabId] || "Parure La Plee Master Operations Console";

      // Reset user detail view if switching away from users tab
      if (targetTabId !== "tab-users") {
        window.closeUserProfileView();
      }
    });
  });

  // Subnav in User Detail View
  initSubnav("ud-subnav-bar", "ud-panes-container");

  // Global Refresh Button
  document.getElementById("btn-refresh-data")?.addEventListener("click", async () => {
    setRefreshing("btn-refresh-data", true);
    userProfileCache.clear();
    await loadAllDashboardData();
    setTimeout(() => {
      setRefreshing("btn-refresh-data", false);
      showSuccess("Dashboard refreshed");
    }, 400);
  });

  // Search and Filter Listeners
  document.getElementById("search-users")?.addEventListener("input", debounce(filterUserDirectory, 300));
  document.getElementById("filter-creator-status")?.addEventListener("change", loadCreatorApplications);
  document.getElementById("search-creators")?.addEventListener("input", debounce(loadCreatorApplications, 300));

  // Beta testers modal & form
  document.getElementById("search-beta-testers")?.addEventListener("input", debounce(loadBetaTesters, 300));
  document.getElementById("btn-open-add-beta")?.addEventListener("click", () => {
    document.getElementById("modal-add-beta")?.classList.add("active");
  });
  document.getElementById("btn-close-beta-modal")?.addEventListener("click", () => {
    document.getElementById("modal-add-beta")?.classList.remove("active");
  });

  document.getElementById("form-add-beta")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const inputEl = document.getElementById("input-beta-email");
    const submitBtn = e.target.querySelector("button[type='submit']");
    const email = inputEl?.value.trim().toLowerCase();

    if (!email) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = "Adding...";
    }

    try {
      const { error } = await supabase.from("beta_testers").insert({ email });
      if (error) {
        showError("Failed to add tester: " + error.message);
      } else {
        document.getElementById("modal-add-beta")?.classList.remove("active");
        if (inputEl) inputEl.value = "";
        showSuccess(`Added ${email} to beta whitelist`);
        await loadBetaTesters();
        await loadOverviewMetrics();
      }
    } catch (err) {
      showError(err.message || "Failed to add tester");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = "Add Tester";
      }
    }
  });

  // Push Broadcast form
  document.getElementById("push-form")?.addEventListener("submit", handlePushBroadcast);

  // Affiliate Search & Sync
  document.getElementById("search-affiliate-products")?.addEventListener("input", debounce(() => loadAffiliateProducts(1), 300));
  document.getElementById("filter-affiliate-network")?.addEventListener("change", () => loadAffiliateProducts(1));
  document.getElementById("btn-trigger-affiliate-sync")?.addEventListener("click", handleAffiliateSync);

  // Settings: Admin Profile & Avatar Upload
  setupSettingsHandlers();
}

// ─────────────────────────────────────────────────────────────────────
// SETTINGS MODULE
// ─────────────────────────────────────────────────────────────────────

function setupSettingsHandlers() {
  let pendingAvatarFile = null;

  document.getElementById("btn-browse-avatar")?.addEventListener("click", () => {
    document.getElementById("admin-avatar-file-input")?.click();
  });

  document.getElementById("admin-avatar-file-input")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showError("Please select a valid image file.");
      return;
    }

    pendingAvatarFile = file;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target.result;
      const previewImg = document.getElementById("admin-avatar-preview");
      const urlInput = document.getElementById("admin-avatar-input");
      if (previewImg) previewImg.src = dataUrl;
      if (urlInput) urlInput.value = dataUrl;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("admin-avatar-input")?.addEventListener("input", (e) => {
    const url = e.target.value.trim();
    const previewImg = document.getElementById("admin-avatar-preview");
    if (previewImg && url.startsWith("http")) {
      previewImg.src = url;
    }
  });

  document.getElementById("form-update-profile")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById("btn-save-admin-profile");
    const fullName = document.getElementById("admin-name-input")?.value.trim();
    let avatarUrl = document.getElementById("admin-avatar-input")?.value.trim();

    if (!fullName) {
      showError("Please enter a valid display name.");
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerText = "SAVING...";
    }

    try {
      if (pendingAvatarFile && currentUser) {
        const fileExt = pendingAvatarFile.name.split(".").pop();
        const filePath = `admin_${currentUser.id}_${Date.now()}.${fileExt}`;
        try {
          const { data: uploadData, error: uploadErr } = await supabase.storage
            .from("avatars")
            .upload(filePath, pendingAvatarFile, { upsert: true });

          if (!uploadErr && uploadData) {
            const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
            if (publicUrlData?.publicUrl) {
              avatarUrl = publicUrlData.publicUrl;
            }
          }
        } catch (storageErr) {
          console.warn("[Settings] Storage bucket note:", storageErr);
        }
      }

      const { error: authErr } = await supabase.auth.updateUser({
        data: { full_name: fullName, avatar_url: avatarUrl }
      });
      if (authErr) throw authErr;

      if (currentUser?.id) {
        await supabase.from("user_profiles").update({
          display_name: fullName,
          avatar_url: avatarUrl
        }).eq("id", currentUser.id);
      }

      // Update DOM elements
      const sidebarName = document.getElementById("user-display-name");
      const sidebarAvatar = document.getElementById("admin-avatar-img");
      const heroName = document.getElementById("admin-profile-hero-name");
      const heroEmail = document.getElementById("admin-profile-hero-email");
      const previewAvatar = document.getElementById("admin-avatar-preview");

      if (sidebarName) sidebarName.innerText = fullName;
      if (sidebarAvatar) sidebarAvatar.src = avatarUrl;
      if (heroName) heroName.innerText = fullName;
      if (previewAvatar) previewAvatar.src = avatarUrl;
      if (heroEmail && currentUser?.email) heroEmail.innerText = currentUser.email;

      pendingAvatarFile = null;
      showSuccess("Admin profile saved successfully");
    } catch (err) {
      showError("Error updating profile: " + (err.message || err));
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = "SAVE PROFILE CHANGES";
      }
    }
  });

  document.getElementById("form-change-password")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById("btn-save-admin-password");
    const newPass = document.getElementById("input-new-password")?.value;
    const confirmPass = document.getElementById("input-confirm-password")?.value;

    if (newPass !== confirmPass) {
      showError("Passwords do not match.");
      return;
    }
    if (newPass.length < 6) {
      showError("Password must be at least 6 characters.");
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerText = "SAVING...";
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;

      showSuccess("Password updated successfully");
      document.getElementById("form-change-password")?.reset();
    } catch (err) {
      showError("Error resetting password: " + (err.message || err));
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = "RESET & SAVE PASSWORD";
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────
// GLOBAL DATA LOADER
// ─────────────────────────────────────────────────────────────────────

async function loadAllDashboardData() {
  await Promise.all([
    loadOverviewMetrics(),
    loadCreatorApplications(),
    renderMarketplaceTable(supabase),
    loadOrdersAndTransactions(),
    loadBetaTesters(),
    loadUserDirectory(),
    loadCommunityPosts(),
    loadAffiliateProducts(1)
  ]);
}

// ─────────────────────────────────────────────────────────────────────
// OVERVIEW METRICS & RECENT STREAM
// ─────────────────────────────────────────────────────────────────────

async function loadOverviewMetrics() {
  const { count: usersCount } = await supabase
    .from("user_profiles")
    .select("*", { count: "exact", head: true })
    .neq("role", "admin");
  const elUsers = document.getElementById("stat-total-users");
  if (elUsers) elUsers.innerText = fmtNum(usersCount ?? 0);

  const { count: creatorsCount } = await supabase
    .from("user_profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "creator");
  const elCreators = document.getElementById("stat-active-creators");
  if (elCreators) elCreators.innerText = fmtNum(creatorsCount ?? 0);

  const { count: activeListingsCount } = await supabase
    .from("marketplace_listings")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");
  const elListings = document.getElementById("stat-active-listings");
  if (elListings) elListings.innerText = fmtNum(activeListingsCount ?? 0);

  const { count: pendingCreators } = await supabase
    .from("creator_applications")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  const { count: highValueCount } = await supabase
    .from("marketplace_listings")
    .select("*", { count: "exact", head: true })
    .gte("price", 50000)
    .eq("status", "pending_review");

  const totalPending = (pendingCreators ?? 0) + (highValueCount ?? 0);
  const elPending = document.getElementById("stat-pending-reviews");
  if (elPending) elPending.innerText = fmtNum(totalPending);

  const badgeCreators = document.getElementById("badge-creators-count");
  if (badgeCreators) badgeCreators.innerText = pendingCreators ?? 0;

  const badgeMarketplace = document.getElementById("badge-marketplace-count");
  if (badgeMarketplace) badgeMarketplace.innerText = highValueCount ?? 0;

  // Real-time GMV & Consolidated 10% Platform Fee Calculation
  const { data: txs } = await supabase.from("marketplace_transactions").select("*").order("created_at", { ascending: false }).limit(300);
  let totalGmv = 0;
  let totalFees = 0;
  let totalNet = 0;
  let totalOrdersCount = 0;

  if (txs && txs.length > 0) {
    totalOrdersCount = txs.length;
    txs.forEach(t => {
      const amountCents = t.amount || t.total_amount || t.price || 0;
      const feeCents = t.application_fee_amount ?? t.platform_fee_amount ?? Math.round(amountCents * PLATFORM_FEE_RATE);
      const netCents = t.seller_net_amount ?? (amountCents - feeCents);

      totalGmv += amountCents;
      totalFees += feeCents;
      totalNet += netCents;
    });
  }

  const elGmv = document.getElementById("stat-total-gmv");
  if (elGmv) elGmv.innerText = fmt(totalGmv);

  const elFees = document.getElementById("stat-platform-fees");
  if (elFees) elFees.innerText = fmt(totalFees);

  const elNet = document.getElementById("stat-seller-net");
  if (elNet) elNet.innerText = fmt(totalNet);

  const elEscrow = document.getElementById("stat-escrow-status");
  if (elEscrow) elEscrow.innerText = `${totalOrdersCount} ORDERS`;

  const { count: betaCount } = await supabase.from("beta_testers").select("*", { count: "exact", head: true });
  const elBeta = document.getElementById("stat-beta-testers");
  if (elBeta) elBeta.innerText = fmtNum(betaCount ?? 0);

  // Quick Action List
  const quickList = document.getElementById("quick-action-list");
  if (quickList) {
    quickList.innerHTML = `
      <div class="activity-item">
        <div>
          <div class="activity-title">Creator Applications</div>
          <div class="activity-desc">Inbound creator partnership requests</div>
        </div>
        <span class="badge ${pendingCreators > 0 ? 'badge-pending' : 'badge-approved'}">${pendingCreators ?? 0} Pending</span>
      </div>
      <div class="activity-item">
        <div>
          <div class="activity-title">High-Value Items (≥$500)</div>
          <div class="activity-desc">Luxury items pending authenticity audit</div>
        </div>
        <span class="badge ${highValueCount > 0 ? 'badge-pending' : 'badge-approved'}">${highValueCount ?? 0} Pending</span>
      </div>
    `;
  }

  // Color Season Distribution
  const { data: allProfiles } = await supabase.from("user_profiles").select("color_season").neq("role", "admin");
  const seasonCounts = { Winter: 0, Autumn: 0, Summer: 0, Spring: 0 };
  let totalCategorized = 0;

  if (allProfiles) {
    allProfiles.forEach(p => {
      const season = p.color_season;
      if (season) {
        if (season.toLowerCase().includes("winter")) seasonCounts.Winter++;
        else if (season.toLowerCase().includes("autumn")) seasonCounts.Autumn++;
        else if (season.toLowerCase().includes("summer")) seasonCounts.Summer++;
        else if (season.toLowerCase().includes("spring")) seasonCounts.Spring++;
        totalCategorized++;
      }
    });
  }

  const denominator = totalCategorized > 0 ? totalCategorized : 1;
  const updateSeason = (key, count) => {
    const countEl = document.getElementById(`season-${key.toLowerCase()}-count`);
    const barEl = document.getElementById(`season-${key.toLowerCase()}-bar`);
    if (countEl) countEl.innerText = `${count} users`;
    if (barEl) barEl.style.width = `${Math.round((count / denominator) * 100)}%`;
  };

  updateSeason("Winter", seasonCounts.Winter);
  updateSeason("Autumn", seasonCounts.Autumn);
  updateSeason("Summer", seasonCounts.Summer);
  updateSeason("Spring", seasonCounts.Spring);

  loadRecentActivityStream();
}

async function loadRecentActivityStream() {
  const feedEl = document.getElementById("recent-activity-list");
  if (!feedEl) return;

  const [usersRes, itemsRes, appsRes, txRes, postsRes, betaRes] = await Promise.all([
    supabase.from("user_profiles").select("email, created_at").neq("role", "admin").order("created_at", { ascending: false }).limit(6),
    supabase.from("marketplace_listings").select("title, price, created_at").order("created_at", { ascending: false }).limit(6),
    supabase.from("creator_applications").select("email, handle, created_at").order("created_at", { ascending: false }).limit(6),
    supabase.from("marketplace_transactions").select("amount, created_at").order("created_at", { ascending: false }).limit(6),
    supabase.from("community_posts").select("content, created_at").order("created_at", { ascending: false }).limit(6),
    supabase.from("beta_testers").select("email, created_at").order("created_at", { ascending: false }).limit(6)
  ]);

  const activities = [];

  (usersRes.data || []).forEach(u => {
    activities.push({
      type: 'REGISTRATION',
      title: `Client Registration`,
      sub: u.email || 'Member account created',
      time: new Date(u.created_at)
    });
  });

  (itemsRes.data || []).forEach(i => {
    activities.push({
      type: 'LISTING',
      title: `Marketplace Listing: ${i.title || 'Garment'}`,
      sub: `Priced at ${fmt(i.price || 0)}`,
      time: new Date(i.created_at)
    });
  });

  (appsRes.data || []).forEach(a => {
    const cleanHandle = a.handle ? a.handle.replace(/^@+/, '') : 'creator';
    activities.push({
      type: 'CREATOR',
      title: `Creator Application: @${cleanHandle}`,
      sub: a.email || 'Applied for partner status',
      time: new Date(a.created_at)
    });
  });

  (txRes.data || []).forEach(t => {
    activities.push({
      type: 'ORDER',
      title: `Marketplace Purchase`,
      sub: `Order value: ${fmt(t.amount || 0)}`,
      time: new Date(t.created_at)
    });
  });

  (postsRes.data || []).forEach(p => {
    activities.push({
      type: 'COMMUNITY',
      title: `Community Editorial Post`,
      sub: (p.content || '').slice(0, 45) + '...',
      time: new Date(p.created_at)
    });
  });

  (betaRes.data || []).forEach(b => {
    activities.push({
      type: 'BETA',
      title: `Beta Whitelist Entry`,
      sub: b.email,
      time: new Date(b.created_at)
    });
  });

  activities.sort((a, b) => b.time - a.time);

  if (activities.length === 0) {
    feedEl.innerHTML = `<p style="color: var(--text-muted); font-size: 13px; padding: 12px 0;">No recent operations recorded.</p>`;
    return;
  }

  feedEl.innerHTML = activities.slice(0, 15).map(act => `
    <div class="activity-item">
      <div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="badge badge-gold" style="font-size: 9px; padding: 2px 6px;">${act.type}</span>
          <span class="activity-title">${act.title}</span>
        </div>
        <div class="activity-desc" style="margin-left: 2px;">${act.sub}</div>
      </div>
      <span class="activity-time">${timeAgo(act.time)}</span>
    </div>
  `).join("");
}

// ─────────────────────────────────────────────────────────────────────
// MODULE 1: CREATOR APPLICATIONS
// ─────────────────────────────────────────────────────────────────────

export function renderTableSkeleton(tbody, cols = 6, rows = 5) {
  if (!tbody) return;
  const colWidths = ['65%', '45%', '55%', '40%', '60%', '35%', '50%', '40%'];
  tbody.innerHTML = Array.from({ length: rows }).map(() => `
    <tr class="skeleton-row">
      ${Array.from({ length: cols }).map((_, i) => `
        <td><div class="skeleton skeleton-cell" style="width: ${colWidths[i % colWidths.length]}; height: 14px;"></div></td>
      `).join('')}
    </tr>
  `).join('');
}

async function loadCreatorApplications() {
  const tbody = document.getElementById("creator-table-body");
  const filter = document.getElementById("filter-creator-status")?.value || "pending";
  const search = document.getElementById("search-creators")?.value.trim().toLowerCase() || "";

  if (!tbody) return;

  renderTableSkeleton(tbody, 7, 5);

  let query = supabase.from("creator_applications").select("*").order("created_at", { ascending: false });
  if (filter !== "all") {
    query = query.eq("status", filter);
  }

  const { data: apps, error } = await query;

  if (error || !apps || apps.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <div class="empty-icon">✨</div>
            <div class="empty-title">No Applications Found</div>
            <div class="empty-desc">No creator applications matching status '${filter}'.</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const filteredApps = apps.filter(app => {
    if (!search) return true;
    const matchEmail = (app.email || "").toLowerCase().includes(search);
    const matchHandle = (app.handle || "").toLowerCase().includes(search);
    const matchName = (app.full_name || "").toLowerCase().includes(search);
    return matchEmail || matchHandle || matchName;
  });

  if (filteredApps.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-title">No Matching Applications</div>
            <div class="empty-desc">No applications match your search term '${search}'.</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredApps.map((app) => {
    const cleanHandle = app.handle ? app.handle.replace(/^@+/, '') : 'creator';
    let displayName = app.full_name;
    if (!displayName || displayName.toLowerCase() === (app.email || "").toLowerCase()) {
      const emailPrefix = (app.email || "Applicant").split("@")[0];
      displayName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
    }
    const init = initial(displayName);

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="avatar-initial" style="width: 34px; height: 34px; font-size: 12px;">${init}</div>
            <div>
              <strong style="color: var(--text-primary); font-weight: 500;">${displayName}</strong><br>
              <span style="font-size: 11px; color: var(--text-muted);">${app.email || ''}</span>
            </div>
          </div>
        </td>
        <td>
          <span class="badge badge-gold" style="font-size: 11px; text-transform: none;">@${cleanHandle}</span>
        </td>
        <td>
          ${app.portfolio_url ? `
            <a href="${app.portfolio_url}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="text-decoration: none; padding: 4px 10px; font-size: 11px;">
              Portfolio ↗
            </a>
          ` : `<span style="color: var(--text-muted); font-size: 12px;">N/A</span>`}
        </td>
        <td>
          <strong style="color: var(--text-primary); font-size: 13px;">${app.follower_count ? fmtNum(app.follower_count) : 'N/A'}</strong>
          <span style="font-size: 10px; color: var(--text-muted); display: block;">followers</span>
        </td>
        <td>
          <span class="badge badge-${app.status}">${app.status.toUpperCase()}</span>
        </td>
        <td>
          <span style="font-size: 12px; color: var(--text-muted);">${fmtDate(app.created_at)}</span>
        </td>
        <td>
          ${app.status === 'pending' ? `
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-success btn-sm" onclick="window.approveCreator('${app.id}')">Approve</button>
              <button class="btn btn-danger btn-sm" onclick="window.declineCreator('${app.id}')">Decline</button>
            </div>
          ` : app.status === 'approved' ? `
            <div style="display: flex; gap: 6px; align-items: center;">
              <span style="font-size: 11px; color: var(--accent-green); font-weight: 500;">Active Partner</span>
              <button class="btn btn-danger btn-sm" style="padding: 4px 8px; font-size: 10px;" onclick="window.declineCreator('${app.id}')">Revoke</button>
            </div>
          ` : `
            <button class="btn btn-secondary btn-sm" style="padding: 4px 8px; font-size: 11px;" onclick="window.approveCreator('${app.id}')">Re-evaluate</button>
          `}
        </td>
      </tr>
    `;
  }).join("");
}

window.approveCreator = async function (id) {
  showConfirmModal({
    title: "Approve Creator Application?",
    message: "Are you sure you want to approve this creator? They will receive partner status and affiliate commission access.",
    btnText: "Approve Creator",
    btnClass: "btn-success",
    onConfirm: async () => {
      const { error } = await supabase.from("creator_applications").update({ status: "approved" }).eq("id", id);
      if (error) {
        showError("Error approving creator: " + error.message);
      } else {
        showSuccess("Creator approved successfully");
        await loadAllDashboardData();
      }
    }
  });
};

window.declineCreator = async function (id) {
  showConfirmModal({
    title: "Decline / Revoke Creator Status?",
    message: "Are you sure you want to decline or revoke this creator application?",
    btnText: "Yes, Decline Creator",
    btnClass: "btn-danger",
    onConfirm: async () => {
      const { error } = await supabase.from("creator_applications").update({ status: "declined" }).eq("id", id);
      if (error) {
        showError("Error declining creator: " + error.message);
      } else {
        showSuccess("Creator status updated to declined");
        await loadAllDashboardData();
      }
    }
  });
};

// ─────────────────────────────────────────────────────────────────────
// GLOBAL DIRECT LISTING & AUTHENTICITY ACTIONS
// ─────────────────────────────────────────────────────────────────────

window.updateListingStatusDirect = async function (id, status) {
  let title = "Update Marketplace Listing?";
  let message = `Are you sure you want to change this listing status to ${status.toUpperCase()}?`;
  let btnText = "Confirm Update";
  let btnClass = status === 'active' ? 'btn-success' : 'btn-danger';

  if (status === 'removed') {
    title = "Remove Marketplace Listing?";
    message = "Are you sure you want to remove this garment listing from the public marketplace?";
    btnText = "Yes, Remove Listing";
  } else if (status === 'declined') {
    title = "Decline Marketplace Listing?";
    message = "Are you sure you want to decline this high-value listing?";
    btnText = "Decline Listing";
  } else if (status === 'active') {
    title = "Approve & Publish Item?";
    message = "Are you sure you want to approve and publish this garment item on the marketplace?";
    btnText = "Approve & Publish";
  }

  showConfirmModal({
    title,
    message,
    btnText,
    btnClass,
    onConfirm: async () => {
      const updates = { status };
      if (status === "active") {
        updates.authenticity_confirmed = true;
        updates.authenticity_confirmed_at = new Date().toISOString();
        updates.auth_status = 'verified';
      }

      const { error } = await supabase.from("marketplace_listings").update(updates).eq("id", id);
      if (error) {
        showError("Error updating listing: " + error.message);
      } else {
        showSuccess(`Listing marked as ${status}`);
        await renderMarketplaceTable(supabase);
        loadOverviewMetrics();
      }
    }
  });
};

window.toggleAuthenticityDirect = async function (id, confirmState) {
  const actionText = confirmState ? "Confirm Authenticity" : "Unverify Authenticity";

  showConfirmModal({
    title: `${actionText}?`,
    message: confirmState
      ? "Are you sure you want to confirm authenticity for this luxury item?"
      : "Are you sure you want to unverify authenticity for this listing?",
    btnText: actionText,
    btnClass: confirmState ? "btn-success" : "btn-danger",
    onConfirm: async () => {
      const updates = {
        authenticity_confirmed: confirmState,
        authenticity_confirmed_at: confirmState ? new Date().toISOString() : null,
        auth_status: confirmState ? 'verified' : 'pending'
      };

      const { error } = await supabase.from("marketplace_listings").update(updates).eq("id", id);
      if (error) {
        showError("Error updating authenticity: " + error.message);
      } else {
        showSuccess(confirmState ? "Authenticity verified" : "Authenticity unverified");
        await renderMarketplaceTable(supabase);
      }
    }
  });
};

// ─────────────────────────────────────────────────────────────────────
// MODULE 3: ORDERS & FINANCIALS (ESCROW AUDIT)
// ─────────────────────────────────────────────────────────────────────

async function loadOrdersAndTransactions() {
  const tbody = document.getElementById("orders-table-body");
  if (!tbody) return;

  renderTableSkeleton(tbody, 8, 5);

  const { data: txs, error } = await supabase
    .from("marketplace_transactions")
    .select("*, listing:marketplace_listings(*), buyer:user_profiles!buyer_user_id(email, display_name), seller:user_profiles!seller_user_id(email, display_name)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !txs || txs.length === 0) {
    const fallbackRes = await supabase.from("marketplace_transactions").select("*").order("created_at", { ascending: false });
    if (fallbackRes.data && fallbackRes.data.length > 0) {
      currentTransactionsData = fallbackRes.data;
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-state">
              <div class="empty-icon">🧾</div>
              <div class="empty-title">No Transactions Recorded</div>
              <div class="empty-desc">Completed orders and escrow money flows will appear here.</div>
            </div>
          </td>
        </tr>
      `;
      return;
    }
  } else {
    currentTransactionsData = txs;
  }

  tbody.innerHTML = currentTransactionsData.map((tx) => {
    const amountCents = tx.amount || tx.total_amount || tx.price || 0;
    const feeCents = tx.application_fee_amount ?? tx.platform_fee_amount ?? Math.round(amountCents * PLATFORM_FEE_RATE);
    const netCents = tx.seller_net_amount ?? (amountCents - feeCents);

    const buyerLabel = tx.buyer?.email || (tx.buyer_user_id ? tx.buyer_user_id.slice(0, 8) + '...' : 'Buyer');
    const sellerLabel = tx.seller?.email || (tx.seller_user_id ? tx.seller_user_id.slice(0, 8) + '...' : 'Seller');

    return `
      <tr id="row-order-${tx.id}">
        <td><strong style="color: var(--text-primary); font-family: monospace;">${tx.id.slice(0, 8)}...</strong></td>
        <td><span style="font-size: 12px; color: var(--text-primary);">${buyerLabel}</span></td>
        <td><span style="font-size: 12px; color: var(--text-secondary);">${sellerLabel}</span></td>
        <td><strong style="color: var(--text-primary); font-size: 13px;">${fmt(amountCents)}</strong></td>
        <td style="color: var(--accent-amber); font-weight: 500;">${fmt(feeCents)}</td>
        <td style="color: var(--accent-green); font-weight: 500;">${fmt(netCents)}</td>
        <td><span class="badge badge-approved">${(tx.status || 'PAID / COMPLETED').toUpperCase()}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="window.openOrderDetailModal('${tx.id}')" style="display: inline-flex; align-items: center; gap: 6px;">
            <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; fill: currentColor;">
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
            </svg>
            <span>Tax Invoice</span>
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

window.openOrderDetailModal = function (id) {
  const tx = currentTransactionsData.find(t => t.id === id);
  if (!tx) return;

  activeViewingTx = tx;

  const modal = document.getElementById("modal-order-detail");
  if (!modal) return;

  const totalCents = tx.amount || tx.total_amount || tx.price || 0;
  const appFeeCents = tx.application_fee_amount ?? tx.platform_fee_amount ?? Math.round(totalCents * PLATFORM_FEE_RATE);
  const stripeProcessingFeeCents = tx.stripe_fee ?? tx.processing_fee ?? Math.round(totalCents * 0.029 + 30);
  const ownerNetProfitCents = Math.max(0, appFeeCents - stripeProcessingFeeCents);
  const sellerNetCents = tx.seller_net_amount ?? (totalCents - appFeeCents);

  const orderShortId = tx.id ? tx.id.slice(0, 8).toUpperCase() : "N/A";
  document.getElementById("order-modal-invoice-no").innerText = `INV-2026-${orderShortId}`;
  document.getElementById("order-modal-invoice-date").innerText = fmtDateLong(tx.created_at);
  document.getElementById("order-modal-status-badge").innerText = (tx.status || 'PAID / SUCCEEDED').toUpperCase();

  const listing = tx.listing || {};
  let garmentImg = (listing.images && Array.isArray(listing.images) && listing.images.length > 0) ? listing.images[0] : (listing.image_url || null);

  const imgEl = document.getElementById("order-modal-item-img");
  if (garmentImg) {
    imgEl.src = garmentImg;
    imgEl.style.display = "block";
  } else {
    imgEl.style.display = "none";
  }

  document.getElementById("order-modal-item-title").innerText = listing.name || listing.title || "Marketplace Garment Item";
  document.getElementById("order-modal-item-brand").innerText = listing.brand ? listing.brand.toUpperCase() : "DESIGNER APPAREL";
  document.getElementById("order-modal-item-unit-price").innerText = fmt(totalCents);
  document.getElementById("order-modal-item-total-price").innerText = fmt(totalCents);

  document.getElementById("order-modal-buyer-name").innerText = tx.buyer?.display_name || tx.buyer?.email?.split('@')[0] || "Verified Buyer";
  document.getElementById("order-modal-buyer-email").innerText = tx.buyer?.email || "N/A";
  document.getElementById("order-modal-shipping-address").innerText = tx.shipping_address || tx.buyer?.location || "N/A";

  document.getElementById("order-modal-seller-name").innerText = tx.seller?.display_name || tx.seller?.email?.split('@')[0] || "Verified Seller";
  document.getElementById("order-modal-seller-email").innerText = tx.seller?.email || "N/A";
  document.getElementById("order-modal-seller-stripe-id").innerText = tx.seller_stripe_account_id || tx.seller?.stripe_account_id || "Stripe Connect Active";

  document.getElementById("order-modal-buyer-paid").innerText = fmt(totalCents);
  document.getElementById("order-modal-stripe-fee").innerText = `-${fmt(stripeProcessingFeeCents)}`;
  document.getElementById("order-modal-app-fee").innerText = `+${fmt(appFeeCents)}`;
  document.getElementById("order-modal-owner-net").innerText = `+${fmt(ownerNetProfitCents)}`;
  document.getElementById("order-modal-seller-net").innerText = fmt(sellerNetCents);

  document.getElementById("order-modal-summary-subtotal").innerText = fmt(totalCents);
  document.getElementById("order-modal-summary-total").innerText = fmt(totalCents);

  modal.classList.add("active");
};

window.openLuxuryOrderInvoice = function (id) {
  window.openOrderDetailModal(id);
};

window.triggerLuxuryPrintInvoice = function () {
  const tx = activeViewingTx || currentTransactionsData[0];
  if (!tx) return;

  const totalCents = tx.amount || tx.total_amount || tx.price || 0;
  const appFeeCents = tx.application_fee_amount ?? tx.platform_fee_amount ?? Math.round(totalCents * PLATFORM_FEE_RATE);
  const stripeProcessingFeeCents = tx.stripe_fee ?? tx.processing_fee ?? Math.round(totalCents * 0.029 + 30);
  const ownerNetProfitCents = Math.max(0, appFeeCents - stripeProcessingFeeCents);
  const sellerNetCents = tx.seller_net_amount ?? (totalCents - appFeeCents);
  const listing = tx.listing || {};

  const orderShortId = tx.id ? tx.id.slice(0, 8).toUpperCase() : "N/A";

  const pInvNo = document.getElementById("print-inv-no");
  if (pInvNo) pInvNo.innerText = `INV-2026-${orderShortId}`;

  const pInvDate = document.getElementById("print-inv-date");
  if (pInvDate) pInvDate.innerText = fmtDateLong(tx.created_at);

  const pBuyerName = document.getElementById("print-buyer-name");
  if (pBuyerName) pBuyerName.innerText = tx.buyer?.display_name || tx.buyer?.email?.split('@')[0] || "Verified Buyer";

  const pBuyerEmail = document.getElementById("print-buyer-email");
  if (pBuyerEmail) pBuyerEmail.innerText = tx.buyer?.email || "N/A";

  const pBuyerAddr = document.getElementById("print-buyer-address");
  if (pBuyerAddr) pBuyerAddr.innerText = tx.shipping_address || tx.buyer?.location || "N/A";

  const pSellerName = document.getElementById("print-seller-name");
  if (pSellerName) pSellerName.innerText = tx.seller?.display_name || tx.seller?.email?.split('@')[0] || "Verified Seller";

  const pSellerEmail = document.getElementById("print-seller-email");
  if (pSellerEmail) pSellerEmail.innerText = tx.seller?.email || "N/A";

  const pSellerStripe = document.getElementById("print-seller-stripe-id");
  if (pSellerStripe) pSellerStripe.innerText = tx.seller_stripe_account_id || tx.seller?.stripe_account_id || "Stripe Connect Active";

  const pItemTitle = document.getElementById("print-item-title");
  if (pItemTitle) pItemTitle.innerText = listing.name || listing.title || "Marketplace Garment Item";

  const pItemBrand = document.getElementById("print-item-brand");
  if (pItemBrand) pItemBrand.innerText = listing.brand ? listing.brand.toUpperCase() : "DESIGNER APPAREL";

  const pUnit = document.getElementById("print-item-unit-price");
  if (pUnit) pUnit.innerText = fmt(totalCents);

  const pTotal = document.getElementById("print-item-total-price");
  if (pTotal) pTotal.innerText = fmt(totalCents);

  const pSubtotal = document.getElementById("print-summary-subtotal");
  if (pSubtotal) pSubtotal.innerText = fmt(totalCents);

  const pSumTotal = document.getElementById("print-summary-total");
  if (pSumTotal) pSumTotal.innerText = fmt(totalCents);

  const pAudBuyer = document.getElementById("print-audit-buyer");
  if (pAudBuyer) pAudBuyer.innerText = fmt(totalCents);

  const pAudStripe = document.getElementById("print-audit-stripe-fee");
  if (pAudStripe) pAudStripe.innerText = `-${fmt(stripeProcessingFeeCents)}`;

  const pAudApp = document.getElementById("print-audit-app-fee");
  if (pAudApp) pAudApp.innerText = `+${fmt(appFeeCents)}`;

  const pAudOwner = document.getElementById("print-audit-owner-net");
  if (pAudOwner) pAudOwner.innerText = `+${fmt(ownerNetProfitCents)}`;

  const pAudSeller = document.getElementById("print-audit-seller-net");
  if (pAudSeller) pAudSeller.innerText = fmt(sellerNetCents);

  const orderModal = document.getElementById("modal-order-detail");
  const printContainer = document.getElementById("printable-invoice-container");

  if (printContainer) {
    if (orderModal) {
      orderModal.classList.remove("active");
    }

    printContainer.classList.remove("hidden");
    printContainer.style.display = "block";

    setTimeout(() => {
      window.print();
      setTimeout(() => {
        printContainer.classList.add("hidden");
        printContainer.style.display = "";
        if (orderModal) {
          orderModal.classList.add("active");
        }
      }, 500);
    }, 150);
  }
};

// ─────────────────────────────────────────────────────────────────────
// MODULE 4: BETA TESTERS WHITELIST
// ─────────────────────────────────────────────────────────────────────

async function loadBetaTesters() {
  const tbody = document.getElementById("beta-testers-table-body");
  const countBadge = document.getElementById("beta-testers-count-badge");
  const searchInput = document.getElementById("search-beta-testers");
  const query = searchInput ? searchInput.value.toLowerCase().trim() : "";

  if (!tbody) return;

  renderTableSkeleton(tbody, 4, 5);

  const { data: testers, error } = await supabase
    .from("beta_testers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--accent-red); padding: 30px;">Error loading whitelist: ${error.message}</td></tr>`;
    return;
  }

  let filtered = testers || [];
  if (query) {
    filtered = filtered.filter(t => (t.email || '').toLowerCase().includes(query));
  }

  if (countBadge) countBadge.innerText = `${filtered.length} Email${filtered.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4">
          <div class="empty-state">
            <div class="empty-icon">✉️</div>
            <div class="empty-title">${query ? 'No Matching Testers' : 'No Beta Testers Yet'}</div>
            <div class="empty-desc">${query ? 'No tester matches your search.' : 'Add your first TestFlight or early-access email.'}</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((tester) => {
    const formattedDate = fmtDate(tester.created_at);
    const addedByText = tester.added_by ? (tester.added_by.length > 12 ? tester.added_by.slice(0, 8) + '...' : tester.added_by) : 'Master Admin';
    const firstLetter = initial(tester.email || 'B');

    return `
      <tr>
        <td style="font-weight: 500; color: var(--text-primary);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="avatar-initial" style="width: 30px; height: 30px; font-size: 11px;">
              ${firstLetter}
            </div>
            <span style="font-size: 13px;">${tester.email}</span>
          </div>
        </td>
        <td><span class="badge badge-gold" style="font-size: 10px;">${addedByText}</span></td>
        <td style="color: var(--text-muted); font-size: 12px;">${formattedDate}</td>
        <td style="text-align: right;">
          <button class="btn btn-danger btn-sm" onclick="window.deleteBetaTester('${tester.id}', '${tester.email}')" style="display: inline-flex; align-items: center; gap: 4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
            Remove
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

window.deleteBetaTester = async function (id, email) {
  showConfirmModal({
    title: "Remove Beta Whitelist Email?",
    message: `Are you sure you want to remove '${email || 'this email'}' from the beta whitelist?`,
    btnText: "Yes, Remove Email",
    btnClass: "btn-danger",
    onConfirm: async () => {
      const { error } = await supabase.from("beta_testers").delete().eq("id", id);
      if (error) {
        showError("Error deleting tester: " + error.message);
      } else {
        showSuccess(`Removed ${email}`);
        await loadBetaTesters();
        await loadOverviewMetrics();
      }
    }
  });
};

// ─────────────────────────────────────────────────────────────────────
// MODULE 5: USER DIRECTORY & 360° LUXURY PROFILE AUDIT
// ─────────────────────────────────────────────────────────────────────

async function loadUserDirectory() {
  const tbody = document.getElementById("users-table-body");
  if (!tbody) return;

  renderTableSkeleton(tbody, 7, 6);

  const { data: users, error } = await supabase
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !users || users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 36px;">No user profiles found.</td></tr>`;
    return;
  }

  allUsersData = users;
  renderUserTableRows(allUsersData);
}

function filterUserDirectory() {
  const search = document.getElementById("search-users")?.value.trim().toLowerCase() || "";
  if (!search) {
    renderUserTableRows(allUsersData);
    return;
  }
  const filtered = allUsersData.filter(u => {
    const emailMatch = (u.email || "").toLowerCase().includes(search);
    const nameMatch = (u.display_name || "").toLowerCase().includes(search);
    const handleMatch = (u.handle || "").toLowerCase().includes(search);
    return emailMatch || nameMatch || handleMatch;
  });
  renderUserTableRows(filtered);
}

function renderUserTableRows(users) {
  const tbody = document.getElementById("users-table-body");
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-title">No Clients Found</div>
            <div class="empty-desc">No client records match your search filter.</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = users.map((u) => {
    const isMasterAdmin = (u.email || "").toLowerCase() === MASTER_ADMIN_EMAIL || u.role === "admin";
    const roleBadgeClass = u.role === "admin" ? "badge-gold" : u.role === "creator" ? "badge-approved" : "badge-pending";
    const subBadgeClass = u.subscription_tier === "premium" ? "badge-approved" : "badge-gold";
    const init = initial(u.display_name || u.email || "U");

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 12px;">
            ${u.avatar_url ? `
              <img src="${u.avatar_url}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-subtle);">
            ` : `
              <div class="avatar-initial" style="width: 36px; height: 36px; font-size: 13px;">${init}</div>
            `}
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <strong style="color: var(--text-primary); font-size: 13px; font-weight: 500;">${u.display_name || u.email?.split("@")[0] || 'User Member'}</strong>
                ${u.handle ? `<span class="badge badge-gold" style="font-size: 9px; text-transform: none; padding: 2px 6px;">@${u.handle.replace(/^@+/, '')}</span>` : ''}
              </div>
              <span style="font-size: 11px; color: var(--text-muted);">${u.email || ''}</span>
            </div>
          </div>
        </td>
        <td>
          <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
            <span class="badge ${roleBadgeClass}" style="font-size: 10px;">${(u.role || "user").toUpperCase()}</span>
            <span class="badge ${subBadgeClass}" style="font-size: 9px;">${(u.subscription_tier || "free").toUpperCase()} TIER</span>
          </div>
        </td>
        <td>
          <div>
            <strong style="color: var(--text-primary); font-size: 12px; display: block;">${u.color_season || "Not Analyzed"}</strong>
            ${u.color_season_confidence ? `<span style="font-size: 10px; color: var(--accent-green); font-weight: 500;">${Math.round(u.color_season_confidence * 100)}% Match</span>` : ''}
          </div>
        </td>
        <td>
          <div>
            <strong style="color: var(--text-primary); font-size: 12px; display: block;">${u.wardrobe_item_count ?? 0} items</strong>
            <span style="font-size: 10px; color: var(--text-muted);">Step ${u.completion_step ?? 0}/5</span>
          </div>
        </td>
        <td>
          <span style="font-size: 12px; color: var(--text-secondary);">${u.location || 'N/A'}</span>
        </td>
        <td>
          <span style="font-size: 12px; color: var(--text-muted);">${fmtDate(u.created_at)}</span>
        </td>
        <td>
          ${isMasterAdmin ? `
            <span style="font-size: 11px; color: var(--text-muted); font-style: italic;">Protected Admin</span>
          ` : `
            <button class="btn btn-secondary btn-sm" onclick="window.openUserProfileView('${u.id}')" style="display: inline-flex; align-items: center; gap: 4px;">
              <span>Audit 360°</span>
              <span style="font-size: 10px;">&rarr;</span>
            </button>
          `}
        </td>
      </tr>
    `;
  }).join("");
}

// ─────────────────────────────────────────────────────────────────────
// 360° USER PROFILE VIEW
// ─────────────────────────────────────────────────────────────────────

window.openUserProfileView = async function (userId, forceRefresh = false) {
  const listView = document.getElementById("user-list-view");
  const detailView = document.getElementById("user-detail-view");

  if (!listView || !detailView) return;

  listView.classList.add("hidden");
  detailView.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });

  const cached = userProfileCache.get(userId);
  if (!forceRefresh && cached && (Date.now() - cached.timestamp < USER_CACHE_TTL)) {
    return;
  }

  // Reset active subtab to overview
  document.querySelectorAll("#ud-subnav-bar .ud-subnav-btn").forEach(btn => btn.classList.remove("active"));
  const overviewTabBtn = document.querySelector('#ud-subnav-bar .ud-subnav-btn[data-subtab="ud-pane-overview"]');
  if (overviewTabBtn) overviewTabBtn.classList.add("active");

  document.querySelectorAll(".ud-pane").forEach(pane => pane.classList.add("hidden"));
  const overviewPane = document.getElementById("ud-pane-overview");
  if (overviewPane) overviewPane.classList.remove("hidden");

  // ── SKELETON PLACEHOLDER LOADING STATE ──
  const avatarImg = document.getElementById("ud-avatar");
  const initialAvatar = document.getElementById("ud-initial-avatar");
  if (avatarImg) avatarImg.style.display = "none";
  if (initialAvatar) {
    initialAvatar.style.display = "flex";
    initialAvatar.className = "skeleton skeleton-circle";
    initialAvatar.style.width = "48px";
    initialAvatar.style.height = "48px";
    initialAvatar.innerText = "";
  }

  // Header meta skeleton lines
  document.getElementById("ud-display-name").innerHTML = `<span class="skeleton skeleton-text" style="width: 170px; height: 22px;"></span>`;
  document.getElementById("ud-handle").innerHTML = `<span class="skeleton skeleton-text" style="width: 80px; height: 16px;"></span>`;
  document.getElementById("ud-email").innerHTML = `<span class="skeleton skeleton-text" style="width: 150px; height: 14px;"></span>`;
  document.getElementById("ud-id").innerText = userId;
  document.getElementById("ud-location-tag").innerHTML = `<span class="skeleton skeleton-text" style="width: 110px; height: 13px;"></span>`;
  document.getElementById("ud-created-at").innerHTML = `<span class="skeleton skeleton-text" style="width: 90px; height: 13px;"></span>`;

  // Badges skeleton
  const roleBadge = document.getElementById("ud-role-badge");
  if (roleBadge) {
    roleBadge.className = "skeleton skeleton-badge";
    roleBadge.innerText = "";
  }
  const subBadge = document.getElementById("ud-sub-badge");
  if (subBadge) {
    subBadge.className = "skeleton skeleton-badge";
    subBadge.innerText = "";
  }
  const creatorBadge = document.getElementById("ud-creator-badge");
  if (creatorBadge) creatorBadge.style.display = "none";

  // Stat chips skeleton
  document.getElementById("ud-stat-wardrobe").innerHTML = `<span class="skeleton skeleton-text" style="width: 32px; height: 18px;"></span>`;
  document.getElementById("ud-stat-revenue").innerHTML = `<span class="skeleton skeleton-text" style="width: 52px; height: 18px;"></span>`;
  document.getElementById("ud-stat-posts").innerHTML = `<span class="skeleton skeleton-text" style="width: 28px; height: 18px;"></span>`;

  // Overview Passport Skeleton
  const seasonEl = document.getElementById("ud-season");
  if (seasonEl) seasonEl.innerHTML = `<span class="skeleton skeleton-text" style="width: 130px; height: 18px;"></span>`;
  const confEl = document.getElementById("ud-season-confidence");
  if (confEl) confEl.innerHTML = `<span class="skeleton skeleton-badge" style="width: 60px; height: 16px;"></span>`;
  const selfieImg = document.getElementById("ud-selfie-img");
  const noSelfie = document.getElementById("ud-no-selfie");
  if (selfieImg) selfieImg.style.display = "none";
  if (noSelfie) {
    noSelfie.className = "skeleton";
    noSelfie.style.display = "block";
    noSelfie.style.width = "100%";
    noSelfie.style.height = "260px";
    noSelfie.innerText = "";
  }

  // Pre-populate grids with skeleton cards
  const wardrobeGridPre = document.getElementById("ud-wardrobe-grid");
  if (wardrobeGridPre) {
    wardrobeGridPre.innerHTML = `
      <div style="grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px;">
        ${Array.from({ length: 6 }).map(() => `
          <div class="skeleton-card">
            <div class="skeleton skeleton-card-img"></div>
            <div class="skeleton skeleton-card-title"></div>
            <div class="skeleton skeleton-card-meta"></div>
          </div>
        `).join('')}
      </div>
    `;
  }

  const lbContainerPre = document.getElementById("ud-lookbooks-container");
  if (lbContainerPre) {
    lbContainerPre.innerHTML = `
      <div style="grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">
        ${Array.from({ length: 2 }).map(() => `
          <div class="skeleton-card" style="min-height: 240px;">
            <div class="skeleton skeleton-card-title" style="width: 60%;"></div>
            <div class="skeleton skeleton-card-img" style="height: 100px;"></div>
            <div class="skeleton skeleton-card-meta" style="width: 80%;"></div>
          </div>
        `).join('')}
      </div>
    `;
  }

  const mpContainerPre = document.getElementById("ud-marketplace-container");
  if (mpContainerPre) {
    mpContainerPre.innerHTML = `
      <div style="grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px;">
        ${Array.from({ length: 4 }).map(() => `
          <div class="skeleton-card">
            <div class="skeleton skeleton-card-img"></div>
            <div class="skeleton skeleton-card-title"></div>
            <div class="skeleton skeleton-card-meta"></div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Fetch full user record
  const { data: u, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !u) {
    showError("Failed to fetch user dossier: " + (error?.message || "User not found"));
    window.closeUserProfileView();
    return;
  }

  // Parallel fetch of all related collections
  const results = await Promise.allSettled([
    supabase.from("wardrobe_items").select("*").eq("user_id", userId),
    supabase.from("marketplace_listings").select("*").eq("seller_user_id", userId).order("created_at", { ascending: false }),
    supabase.from("marketplace_transactions").select("*").eq("seller_user_id", userId),
    supabase.from("marketplace_transactions").select("*").eq("buyer_user_id", userId),
    supabase.from("community_posts").select("*").eq("user_id", userId),
    supabase.from("followers").select("follower_user_id").eq("followed_user_id", userId),
    supabase.from("followers").select("followed_user_id").eq("follower_user_id", userId),
    supabase.from("calendar_events").select("*").eq("user_id", userId).order("event_date", { ascending: true }),
    supabase.from("marketplace_wishlists").select("listing_id").eq("user_id", userId),
    supabase.from("user_lookbooks").select("*, saved_looks(*)").eq("user_id", userId),
    supabase.from("user_moodboards").select("*, moodboard_items(*)").eq("user_id", userId),
    supabase.from("user_wishlists").select("*").eq("user_id", userId),
    supabase.from("saved_looks").select("*").eq("user_id", userId).order("created_at", { ascending: false })
  ]);

  const getData = (res) => (res.status === 'fulfilled' && res.value?.data ? res.value.data : []);

  const itemsList = getData(results[0]);
  const rawListingsList = getData(results[1]);
  const salesList = getData(results[2]);
  const purchasesList = getData(results[3]);
  const postsList = getData(results[4]);
  const followersData = getData(results[5]);
  const followingData = getData(results[6]);
  const calendarList = getData(results[7]);
  const userWishlists = getData(results[8]);
  const userLookbooksList = getData(results[9]);
  const userMoodboardsList = getData(results[10]);
  const userWardrobeWishlistsList = getData(results[11]);
  const savedLooksList = getData(results[12]);

  // Resolve favorited listings
  let rawFavoritedListings = [];
  const wishListingIds = [
    ...(userWishlists || []).map(w => w.listing_id),
    ...(userWardrobeWishlistsList || []).map(w => w.listing_id)
  ].filter(Boolean);

  if (wishListingIds.length > 0) {
    const uniqueListingIds = Array.from(new Set(wishListingIds));
    const { data: favListingsData } = await supabase
      .from("marketplace_listings")
      .select("*")
      .in("id", uniqueListingIds);
    rawFavoritedListings = favListingsData || [];
  }

  // Extract raw moodboard items
  const rawMoodboardItems = [];
  userMoodboardsList.forEach(mb => {
    if (Array.isArray(mb.moodboard_items)) {
      rawMoodboardItems.push(...mb.moodboard_items);
    }
  });

  // Parallel image resolution via storage module
  const [
    listingsList,
    favoritedListings,
    resolvedWardrobeItems,
    resolvedMoodboardItems,
    resolvedAvatarUrl,
    resolvedSelfieUrl
  ] = await Promise.all([
    resolveMarketplaceUrls(supabase, rawListingsList),
    resolveMarketplaceUrls(supabase, rawFavoritedListings),
    resolveWardrobeUrls(supabase, itemsList),
    resolveWardrobeUrls(supabase, rawMoodboardItems),
    resolveAvatarUrl(supabase, u.avatar_url),
    resolveSelfieUrl(supabase, u.selfie_url || u.avatar_url)
  ]);

  const wardrobeItemsMap = new Map();
  resolvedWardrobeItems.forEach(item => {
    if (item.id) wardrobeItemsMap.set(item.id, item);
  });

  const moodboardItemsMap = new Map();
  resolvedMoodboardItems.forEach(mi => {
    if (mi.id) moodboardItemsMap.set(mi.id, mi);
  });

  // Populate Header Dossier
  document.getElementById("ud-display-name").innerText = u.display_name || u.email?.split("@")[0] || "User Member";
  document.getElementById("ud-handle").innerText = u.handle ? `@${u.handle.replace(/^@+/, '')}` : "@no_handle";
  document.getElementById("ud-email").innerText = u.email || "No Email";
  document.getElementById("ud-id").innerText = u.id;
  document.getElementById("ud-location-tag").innerText = u.location || "Location Not Set";
  document.getElementById("ud-created-at").innerText = fmtDate(u.created_at);

  if (resolvedAvatarUrl && avatarImg) {
    avatarImg.src = resolvedAvatarUrl;
    avatarImg.style.display = "block";
    if (initialAvatar) initialAvatar.style.display = "none";
  } else {
    if (avatarImg) avatarImg.style.display = "none";
    if (initialAvatar) {
      initialAvatar.style.display = "flex";
      initialAvatar.innerText = initial(u.display_name || u.email || "U");
    }
  }

  // Badges
  if (roleBadge) {
    roleBadge.innerText = (u.role || "USER").toUpperCase();
    roleBadge.className = `badge ${u.role === 'admin' ? 'badge-gold' : u.role === 'creator' ? 'badge-approved' : 'badge-pending'}`;
  }

  if (subBadge) {
    subBadge.innerText = `${(u.subscription_tier || "FREE").toUpperCase()} TIER`;
    subBadge.className = `badge ${u.subscription_tier === 'premium' ? 'badge-approved' : 'badge-gold'}`;
  }

  if (creatorBadge) {
    if (u.is_approved_creator) {
      creatorBadge.style.display = "inline-block";
      creatorBadge.innerText = "VERIFIED CREATOR";
    } else {
      creatorBadge.style.display = "none";
    }
  }

  // Live Stat Chips
  const totalRev = salesList.reduce((acc, curr) => {
    const rawAmt = curr.amount ?? curr.total_amount ?? curr.seller_net_amount ?? curr.price ?? 0;
    let num = Number(rawAmt);
    if (isNaN(num)) return acc;
    if (num >= 100 && Number.isInteger(num)) num = num / 100;
    return acc + num;
  }, 0);

  document.getElementById("ud-stat-wardrobe").innerText = itemsList.length || u.wardrobe_item_count || 0;
  document.getElementById("ud-stat-revenue").innerText = `$${totalRev.toFixed(2)}`;
  document.getElementById("ud-stat-posts").innerText = postsList.length;

  // 1. PANE OVERVIEW: Style Passport
  if (resolvedSelfieUrl && selfieImg) {
    if (noSelfie) {
      noSelfie.style.display = "none";
      noSelfie.className = "";
    }
    selfieImg.src = resolvedSelfieUrl;
    selfieImg.style.display = "block";
  } else {
    if (selfieImg) selfieImg.style.display = "none";
    if (noSelfie) {
      noSelfie.className = "";
      noSelfie.style.display = "block";
      noSelfie.style.height = "auto";
      noSelfie.innerText = "No Analysis Photo";
    }
  }

  document.getElementById("ud-season").innerText = u.color_season || "Not Analyzed";
  document.getElementById("ud-season-confidence").innerText = u.color_season_confidence ? `${Math.round(u.color_season_confidence * 100)}% MATCH` : "N/A";

  const favColorsContainer = document.getElementById("ud-favorite-colors-container");
  if (favColorsContainer) {
    if (u.favorite_colors && Array.isArray(u.favorite_colors) && u.favorite_colors.length > 0) {
      favColorsContainer.innerHTML = u.favorite_colors.map(c => `
        <div style="display: flex; align-items: center; gap: 6px; background: var(--bg-surface-2); padding: 4px 10px; border-radius: 20px; border: 1px solid var(--border-subtle);">
          <span style="width: 12px; height: 12px; border-radius: 50%; background: ${c.startsWith('#') ? c : '#A86700'}; display: inline-block; border: 1px solid rgba(255,255,255,0.2);"></span>
          <span style="font-size: 11px; color: var(--text-primary);">${c}</span>
        </div>
      `).join("");
    } else {
      favColorsContainer.innerHTML = `<span style="font-size: 11px; color: var(--text-muted);">None Specified</span>`;
    }
  }

  document.getElementById("ud-bio").innerText = u.bio || "No bio provided";
  document.getElementById("ud-age-range").innerText = u.age_range || "Not Specified";
  document.getElementById("ud-gender").innerText = Array.isArray(u.gender_identity) ? u.gender_identity.join(", ") : u.gender_identity || "Not Specified";
  document.getElementById("ud-gender-custom").innerText = u.gender_custom || "None";
  document.getElementById("ud-pronouns").innerText = Array.isArray(u.pronouns) ? u.pronouns.join(", ") : u.pronouns || "Not Specified";
  document.getElementById("ud-dob").innerText = u.dob || "Not Specified";
  document.getElementById("ud-pregnant").innerText = u.is_pregnant ? "Yes (Pregnant)" : "No";

  // Shipping & Stripe
  const shipAddrBox = document.getElementById("ud-shipping-address-box");
  if (u.shipping_address) {
    const sa = typeof u.shipping_address === 'object' ? u.shipping_address : {};
    const street = sa.street || sa.address_line1 || '';
    const city = sa.city || '';
    const state = sa.state || '';
    const country = sa.country || '';
    if (street || city || country) {
      shipAddrBox.innerHTML = `<strong>${sa.name || u.display_name}</strong><br>${street}<br>${city}${state ? ', ' + state : ''}${country ? ', ' + country : ''}`;
    } else {
      shipAddrBox.innerText = typeof u.shipping_address === 'string' ? u.shipping_address : "No Shipping Address Saved";
    }
  } else {
    shipAddrBox.innerText = "No Shipping Address Saved";
  }

  document.getElementById("ud-stripe-id").innerText = u.stripe_account_id || "Not Connected";
  document.getElementById("ud-stripe-charges").innerText = u.stripe_charges_enabled ? "Enabled" : "Disabled";
  document.getElementById("ud-stripe-charges").className = `badge ${u.stripe_charges_enabled ? 'badge-approved' : 'badge-pending'}`;
  document.getElementById("ud-stripe-payouts").innerText = u.stripe_payouts_enabled ? "Enabled" : "Disabled";
  document.getElementById("ud-stripe-payouts").className = `badge ${u.stripe_payouts_enabled ? 'badge-approved' : 'badge-pending'}`;
  document.getElementById("ud-referred-by").innerText = u.referred_by || "Direct Signup";

  // 2. PANE WARDROBE
  renderUserWardrobePane(resolvedWardrobeItems);

  // 3. PANE POSTS
  renderUserPostsPane(postsList, userId);

  // 4. PANE SAVED POSTS
  renderUserSavedPostsPane(userId);

  // 5. PANE FORUMS
  renderUserForumsPane(userId);

  // 6. PANE MARKETPLACE & FAVORITES
  renderUserMarketplacePane(listingsList, favoritedListings);

  // 7. PANE LOOKBOOKS
  renderUserLookbooksPane(userLookbooksList, savedLooksList, wardrobeItemsMap);

  // 8. PANE MOODBOARDS
  renderUserMoodboardsPane(userMoodboardsList, moodboardItemsMap, wardrobeItemsMap);

  // 9. PANE UNIFIED FAVORITES
  renderUserFavoritesPane(favoritedListings, resolvedWardrobeItems);

  // 10. PANE SELLER SHOP & PAYOUTS
  renderUserShopPane(totalRev, salesList);

  // 11. PANE PURCHASES
  renderUserPurchasesPane(purchasesList);

  // 12. PANE SUBSCRIPTION
  renderUserSubscriptionPane(u);

  // Cache user data
  userProfileCache.set(userId, { timestamp: Date.now() });
};

window.closeUserProfileView = function () {
  const listView = document.getElementById("user-list-view");
  const detailView = document.getElementById("user-detail-view");
  if (listView && detailView) {
    detailView.classList.add("hidden");
    listView.classList.remove("hidden");
  }
};

window.toggleUserRole = async function (userId, newRole) {
  showConfirmModal({
    title: "Change User Role?",
    message: `Are you sure you want to change this client's role to ${newRole.toUpperCase()}?`,
    btnText: "Update Role",
    btnClass: "btn-primary",
    onConfirm: async () => {
      const { error } = await supabase.from("user_profiles").update({ role: newRole }).eq("id", userId);
      if (error) {
        showError("Error updating role: " + error.message);
      } else {
        showSuccess(`User role set to ${newRole}`);
        await loadUserDirectory();
        window.openUserProfileView(userId, true);
      }
    }
  });
};

// ─────────────────────────────────────────────────────────────────────
// SUBPANE RENDERERS FOR USER 360°
// ─────────────────────────────────────────────────────────────────────

function renderUserWardrobePane(items) {
  const categoryCounts = {
    tops: items.filter(i => /top|shirt|blouse|tee|sweater/i.test(i.category || i.subcategory || '')).length,
    bottoms: items.filter(i => /bottom|pant|jean|skirt|short/i.test(i.category || i.subcategory || '')).length,
    dresses: items.filter(i => /dress|gown|jumpsuit/i.test(i.category || i.subcategory || '')).length,
    shoes: items.filter(i => /shoe|boot|sneaker|heel/i.test(i.category || i.subcategory || '')).length,
    outerwear: items.filter(i => /coat|jacket|blazer/i.test(i.category || i.subcategory || '')).length,
    bags: items.filter(i => /bag|tote|clutch|purse/i.test(i.category || i.subcategory || '')).length,
    accessories: items.filter(i => /belt|scarf|hat|sunglass/i.test(i.category || i.subcategory || '')).length,
    jewelry: items.filter(i => /ring|necklace|earring|bracelet/i.test(i.category || i.subcategory || '')).length,
    activewear: items.filter(i => /active|sport|gym/i.test(i.category || i.subcategory || '')).length,
    seasonal: items.filter(i => /swim|winter|summer/i.test(i.category || i.subcategory || '')).length,
  };

  const otherCount = items.length - Object.values(categoryCounts).reduce((a, b) => a + b, 0);

  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  setEl("wd-count-total", items.length);
  setEl("wd-count-tops", categoryCounts.tops);
  setEl("wd-count-bottoms", categoryCounts.bottoms);
  setEl("wd-count-dresses", categoryCounts.dresses);
  setEl("wd-count-shoes", categoryCounts.shoes);
  setEl("wd-count-outerwear", categoryCounts.outerwear);
  setEl("wd-count-bags", categoryCounts.bags);
  setEl("wd-count-accessories", categoryCounts.accessories);
  setEl("wd-count-jewelry", categoryCounts.jewelry);
  setEl("wd-count-activewear", categoryCounts.activewear);
  setEl("wd-count-seasonal", categoryCounts.seasonal);
  setEl("wd-count-other", Math.max(0, otherCount));

  const wardrobeGrid = document.getElementById("ud-wardrobe-grid");
  if (!wardrobeGrid) return;

  if (items.length > 0) {
    const categoryMap = new Map();
    const categoryOrder = ['Tops', 'Bottoms', 'Dresses & Jumpsuits', 'Shoes', 'Outerwear', 'Bags', 'Accessories', 'Jewelry', 'Activewear', 'Seasonal', 'Other'];

    items.forEach(item => {
      const cat = item.category || item.subcategory || 'Other';
      if (!categoryMap.has(cat)) categoryMap.set(cat, []);
      categoryMap.get(cat).push(item);
    });

    const sortedCats = [...categoryMap.keys()].sort((a, b) => {
      const idxA = categoryOrder.findIndex(c => a.toLowerCase().includes(c.toLowerCase()));
      const idxB = categoryOrder.findIndex(c => b.toLowerCase().includes(c.toLowerCase()));
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    wardrobeGrid.innerHTML = sortedCats.map(cat => {
      const catItems = categoryMap.get(cat);
      return `
        <div class="card" style="margin-bottom: 24px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border-subtle);">
            <div>
              <h4 class="font-serif" style="font-size: 19px; margin: 0; color: var(--text-primary);">${cat}</h4>
              <span style="font-size: 11px; color: var(--text-muted);">${catItems.length} piece${catItems.length > 1 ? 's' : ''}</span>
            </div>
            <span class="badge badge-gold">${catItems.length} PIECES</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px;">
            ${catItems.map(item => {
              const imgUrl = item._resolvedImageUrl || item.image_url || item._resolved;
              const priceDisplay = item.purchase_price
                ? fmt(item.purchase_price)
                : '<span style="color: var(--text-muted); font-style: italic;">Not Set</span>';
              const colorDot = item.dominant_color_hex
                ? `<span style="width: 10px; height: 10px; border-radius: 50%; background: ${item.dominant_color_hex}; display: inline-block; border: 1px solid rgba(255,255,255,0.2); flex-shrink: 0;"></span>`
                : '';
              const cpw = item.purchase_price && item.wear_count
                ? (item.purchase_price / 100 / item.wear_count).toFixed(2)
                : null;
              return `
                <div class="garment-card">
                  <div class="garment-frame">
                    ${imgUrl ? `
                      <img src="${imgUrl}" alt="${item.name || 'Garment'}" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'display:flex; flex-direction:column; align-items:center; gap:4px; color:var(--text-muted); font-size:11px;\\'><span>👔</span><span>Photo Unavailable</span></div>';">
                    ` : `
                      <div style="display:flex; flex-direction:column; align-items:center; gap:4px; color:var(--text-muted); font-size:11px;">
                        <span>👔</span>
                        <span>No Photo</span>
                      </div>
                    `}
                  </div>
                  <div style="padding: 14px;">
                    <h5 style="font-size: 13px; font-weight: 500; color: var(--text-primary); margin: 0 0 6px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.name || 'Unnamed Item'}">${item.name || 'Unnamed Item'}</h5>
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
                      ${colorDot}
                      <span style="font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.color_name || item.brand || item.category || 'Garment'}</span>
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-subtle); padding-top: 8px;">
                      <span style="font-size: 12px; font-weight: 600; color: var(--gold-primary);">${priceDisplay}</span>
                      <span style="font-size: 10px; color: var(--text-muted); background: var(--bg-surface-2); padding: 2px 8px; border-radius: var(--radius-full);">Worn ${item.wear_count || 0}x</span>
                    </div>
                    ${cpw ? `<div style="font-size: 10px; color: var(--accent-green); margin-top: 4px; font-weight: 500;">CPW: $${cpw}</div>` : ''}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;
    }).join("");
  } else {
    wardrobeGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👗</div>
        <div class="empty-title">Empty Digital Wardrobe</div>
        <div class="empty-desc">This client has not cataloged any garment pieces in their wardrobe yet.</div>
      </div>
    `;
  }
}

function renderUserPostsPane(postsList, userId) {
  const postsContainer = document.getElementById("ud-user-posts-container");
  if (!postsContainer) return;

  if (postsList.length === 0) {
    postsContainer.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">📸</div>
        <div class="empty-title">No Community Posts</div>
        <div class="empty-desc">This user has not published any editorial posts in the community stream.</div>
      </div>
    `;
    return;
  }

  postsContainer.innerHTML = postsList.map((p, index) => {
    const images = Array.isArray(p.image_urls) ? p.image_urls : (p.image_url ? [p.image_url] : []);
    const carouselId = `post-carousel-${p.id || index}`;

    return `
      <div class="card" style="overflow: hidden; display: flex; flex-direction: column;">
        <div style="width: 100%; height: 260px; background: var(--bg-surface-3); position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden;">
          ${images.length > 0 ? `
            <img src="${images[0]}" style="max-width: 100%; max-height: 100%; object-fit: contain;">
          ` : `
            <span style="font-size: 12px; color: var(--text-muted);">No Media</span>
          `}
        </div>
        <div style="padding: 16px; flex-grow: 1; display: flex; flex-direction: column;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 10px; color: var(--gold-primary); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">EDITORIAL POST</span>
            <span style="font-size: 10px; color: var(--text-muted);">${fmtDate(p.created_at)}</span>
          </div>
          <p style="font-size: 13px; color: var(--text-primary); margin: 0 0 16px 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
            "${p.caption || 'No caption provided.'}"
          </p>
          <div style="margin-top: auto; padding-top: 10px; border-top: 1px solid var(--border-subtle); display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted);">
            <span>${p.likes_count || 0} Likes</span>
            <span>${p.comments_count || 0} Comments</span>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

async function renderUserSavedPostsPane(userId) {
  const container = document.getElementById("ud-saved-posts-container");
  if (!container) return;

  const { data: userSavedRows } = await supabase.from("post_saves").select("post_id").eq("user_id", userId);
  if (!userSavedRows || userSavedRows.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">🔖</div>
        <div class="empty-title">No Saved Posts</div>
        <div class="empty-desc">This client has not bookmarked any community posts yet.</div>
      </div>
    `;
    return;
  }

  const savedPostIds = userSavedRows.map(r => r.post_id);
  const { data: savedPostsData } = await supabase.from("community_posts").select("*").in("id", savedPostIds);

  if (!savedPostsData || savedPostsData.length === 0) {
    container.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><div class="empty-title">No Saved Posts Content</div></div>`;
    return;
  }

  container.innerHTML = savedPostsData.map(p => `
    <div class="card" style="padding: 14px;">
      <span class="badge badge-gold" style="font-size: 9px; margin-bottom: 8px;">SAVED POST</span>
      <p style="font-size: 13px; color: var(--text-primary); margin: 6px 0;">"${p.caption || 'Editorial Outfit'}"</p>
      <span style="font-size: 10px; color: var(--text-muted);">${fmtDate(p.created_at)}</span>
    </div>
  `).join("");
}

async function renderUserForumsPane(userId) {
  const container = document.getElementById("ud-forums-container");
  if (!container) return;

  const { data: userForums } = await supabase.from("forum_posts").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (!userForums || userForums.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">💬</div>
        <div class="empty-title">No Forum Discussions</div>
        <div class="empty-desc">This client has not created any community discussion threads yet.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = userForums.map(f => `
    <div class="card" style="padding: 16px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
        <span class="badge badge-gold" style="font-size: 9px;">${(f.forum_season || 'GENERAL').toUpperCase()}</span>
        <span style="font-size: 10px; color: var(--text-muted);">${fmtDate(f.created_at)}</span>
      </div>
      <h5 style="font-size: 14px; margin: 4px 0; color: var(--text-primary);">${f.title || 'Untitled Discussion'}</h5>
      <p style="font-size: 12px; color: var(--text-secondary); margin: 0 0 10px 0;">${(f.content || '').slice(0, 80)}...</p>
    </div>
  `).join("");
}

function renderUserMarketplacePane(listings, favorited) {
  const container = document.getElementById("ud-marketplace-container");
  const savedContainer = document.getElementById("ud-mp-saved-container");

  const renderCard = (l) => {
    const imgUrl = l._resolvedImageUrl || l._resolved || (Array.isArray(l.images) && l.images[0]) || l.image_url || l.image;
    const isSold = (l.status === 'sold' || l.is_sold === true || l.status === 'completed' || !!l.buyer_user_id);
    const statusBadge = isSold
      ? `<span class="badge badge-declined" style="position: absolute; top: 10px; right: 10px; z-index: 2; font-size: 9px;">SOLD</span>`
      : `<span class="badge badge-approved" style="position: absolute; top: 10px; right: 10px; z-index: 2; font-size: 9px;">ACTIVE</span>`;

    return `
      <div class="garment-card">
        <div class="garment-frame" style="height: 190px; position: relative;">
          ${statusBadge}
          ${imgUrl ? `
            <img src="${imgUrl}" alt="${l.title || l.name || 'Marketplace Garment'}" onerror="this.onerror=null; this.parentElement.innerHTML='${statusBadge}<div style=\\'display:flex; flex-direction:column; align-items:center; color:var(--text-muted); font-size:11px;\\'><span>🛍️</span><span>Photo Unavailable</span></div>';">
          ` : `
            <div style="display:flex; flex-direction:column; align-items:center; color:var(--text-muted); font-size:11px;">
              <span>🛍️</span>
              <span>No Photo</span>
            </div>
          `}
        </div>
        <div style="padding: 14px;">
          <h5 style="font-size: 13px; font-weight: 500; color: var(--text-primary); margin: 0 0 4px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${l.title || l.name || 'Garment'}">${l.title || l.name || 'Garment'}</h5>
          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">
            ${l.brand ? `<span style="color: var(--gold-primary); font-weight: 500;">${l.brand}</span>` : 'Designer Apparel'}
            ${l.size || l.size_value ? ` • Size: <strong style="color: var(--text-primary);">${l.size || l.size_value}</strong>` : ''}
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-subtle); padding-top: 8px;">
            <span style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">${isSold ? 'Sold Price' : 'Listing Price'}</span>
            <span style="font-size: 13px; color: ${isSold ? 'var(--accent-red)' : 'var(--accent-green)'}; font-weight: 600;">${fmt(l.price || 0)}</span>
          </div>
        </div>
      </div>
    `;
  };

  if (container) {
    container.innerHTML = listings.length > 0 ? listings.map(renderCard).join("") : `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">🛍️</div>
        <div class="empty-title">No Created Listings</div>
        <div class="empty-desc">This client has not published any garment listings for sale.</div>
      </div>
    `;
  }

  if (savedContainer) {
    savedContainer.innerHTML = favorited.length > 0 ? favorited.map(renderCard).join("") : `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">💖</div>
        <div class="empty-title">No Favorited Garments</div>
        <div class="empty-desc">No marketplace listings saved or favorited.</div>
      </div>
    `;
  }
}

window.switchMarketplaceSubView = function (view) {
  const createdBtn = document.getElementById("ud-mp-btn-created");
  const savedBtn = document.getElementById("ud-mp-btn-saved");
  const createdContainer = document.getElementById("ud-marketplace-container");
  const savedContainer = document.getElementById("ud-mp-saved-container");
  const heading = document.getElementById("ud-mp-heading");

  if (view === 'created') {
    if (createdBtn) createdBtn.classList.add("active");
    if (savedBtn) savedBtn.classList.remove("active");
    if (createdContainer) createdContainer.classList.remove("hidden");
    if (savedContainer) savedContainer.classList.add("hidden");
    if (heading) heading.innerText = "Marketplace Listings Created by User";
  } else {
    if (savedBtn) savedBtn.classList.add("active");
    if (createdBtn) createdBtn.classList.remove("active");
    if (savedContainer) savedContainer.classList.remove("hidden");
    if (createdContainer) createdContainer.classList.add("hidden");
    if (heading) heading.innerText = "Favorited Marketplace Garments";
  }
};

// Helper parser for structured look name strings: "Title (Vibe)||Description||Accessories||Categories"
function parseLookName(rawName, customNotes) {
  if (!rawName) return { title: 'Untitled Look', vibe: null, description: customNotes || null, tags: [] };

  const parts = rawName.split(/\|\|\||\|\|/);
  let rawTitle = parts[0] ? parts[0].trim() : 'Untitled Look';
  let vibe = null;
  let description = parts[1] ? parts[1].trim() : (customNotes || null);
  const tags = [];

  if (parts[2]) {
    tags.push(...parts[2].split(',').map(s => s.trim()).filter(Boolean));
  }
  if (parts[3]) {
    tags.push(...parts[3].split(',').map(s => s.trim()).filter(Boolean));
  }

  const vibeMatch = rawTitle.match(/^(.+?)\s*\((.+?)\)$/);
  if (vibeMatch) {
    rawTitle = vibeMatch[1].trim();
    vibe = vibeMatch[2].trim();
  }

  return { title: rawTitle, vibe, description, tags: [...new Set(tags)] };
}

function renderUserLookbooksPane(lookbooks, savedLooks, wardrobeItemsMap) {
  const container = document.getElementById("ud-lookbooks-container");
  if (!container) return;

  const allSavedLooks = [...savedLooks];
  (lookbooks || []).forEach(lb => {
    if (Array.isArray(lb.saved_looks)) {
      lb.saved_looks.forEach(sl => {
        if (!allSavedLooks.some(existing => existing.id === sl.id)) {
          allSavedLooks.push(sl);
        }
      });
    }
  });

  if (allSavedLooks.length === 0 && (!lookbooks || lookbooks.length === 0)) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">📖</div>
        <div class="empty-title">No Saved Outfits or Lookbooks</div>
        <div class="empty-desc">This client has not saved any styled lookbooks or custom outfits yet.</div>
      </div>
    `;
    return;
  }

  let html = "";

  if (lookbooks && lookbooks.length > 0) {
    html += lookbooks.map(lb => {
      const folderLooks = Array.isArray(lb.saved_looks) ? lb.saved_looks : [];
      return `
        <div style="grid-column: 1 / -1; background: var(--bg-surface-2); border: 1px solid var(--border-medium); border-radius: var(--radius-md); padding: 16px 20px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-size: 10px; color: var(--gold-primary); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">LOOKBOOK COLLECTION</div>
            <h4 class="font-serif" style="font-size: 19px; margin: 2px 0 0; color: var(--text-primary);">${lb.name || 'Untitled Lookbook'}</h4>
          </div>
          <span class="badge badge-gold">${folderLooks.length} SAVED LOOKS</span>
        </div>
      `;
    }).join("");
  }

  html += allSavedLooks.map((look) => {
    const itemIds = Array.isArray(look.item_ids) ? look.item_ids : [];
    const outfitItems = itemIds.map(id => wardrobeItemsMap.get(id)).filter(Boolean);
    const parsed = parseLookName(look.name, look.custom_notes);
    const tags = Array.isArray(look.occasion_tags) && look.occasion_tags.length > 0 ? look.occasion_tags : parsed.tags;

    return `
      <div class="lookbook-card">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;">
          <div>
            <h4 class="font-serif" style="font-size: 18px; color: var(--text-primary); margin: 0 0 4px 0; font-weight: 600;">${parsed.title}</h4>
            <span style="font-size: 11px; color: var(--text-muted);">${fmtDate(look.created_at)}${look.lookbook_name ? ` • In ${look.lookbook_name}` : ''}</span>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
            <span class="badge badge-gold" style="font-size: 10px;">${outfitItems.length} PIECES</span>
            ${parsed.vibe ? `<span class="badge" style="font-size: 9px; background: var(--bg-surface-2); color: var(--gold-primary); border: 1px solid var(--border-subtle);">${parsed.vibe}</span>` : ''}
          </div>
        </div>

        <div>
          <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-primary); font-weight: 600; margin-bottom: 8px;">Outfit Composition</div>
          <div class="lookbook-composition-grid">
            ${outfitItems.length > 0 ? outfitItems.map(item => {
              const imgUrl = item._resolvedImageUrl || item.image_url || item._resolved;
              return `
                <div class="lookbook-piece-box" title="${item.name || 'Garment Piece'}">
                  <div class="lookbook-piece-thumb">
                    ${imgUrl ? `
                      <img src="${imgUrl}" alt="${item.name || 'Item'}" onerror="this.onerror=null; this.parentElement.innerHTML='<span style=\\'font-size:10px; color:var(--text-muted);\\'>👔</span>';">
                    ` : `
                      <span style="font-size: 10px; color: var(--text-muted);">👔</span>
                    `}
                  </div>
                  <div style="font-size: 10px; color: var(--text-primary); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name || 'Item'}</div>
                  ${item.brand ? `<div style="font-size: 9px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.brand}</div>` : ''}
                </div>
              `;
            }).join("") : `
              <div style="grid-column: 1 / -1; font-size: 11px; color: var(--text-muted); text-align: center; padding: 12px;">No individual wardrobe pieces cataloged in this outfit</div>
            `}
          </div>
        </div>

        ${parsed.description ? `
          <div style="background: var(--bg-surface-2); border-left: 2px solid var(--gold-primary); padding: 10px 14px; border-radius: 0 var(--radius-sm) var(--radius-sm) 0;">
            <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5; font-style: italic;">
              "${parsed.description}"
            </div>
          </div>
        ` : ''}

        ${tags.length > 0 ? `
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${tags.map(t => `<span class="badge" style="font-size: 10px; background: rgba(200, 184, 154, 0.08); color: var(--gold-light); border: 1px solid var(--border-subtle); padding: 2px 8px;">#${t}</span>`).join("")}
          </div>
        ` : ''}
      </div>
    `;
  }).join("");

  container.innerHTML = html;
}

function renderUserMoodboardsPane(moodboards, moodboardItemsMap, wardrobeItemsMap) {
  const container = document.getElementById("ud-moodboards-container");
  if (!container) return;

  if (moodboards.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">🎨</div>
        <div class="empty-title">No Inspiration Moodboards</div>
        <div class="empty-desc">This client has not created any inspiration moodboards yet.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = moodboards.map(mb => `
    <div class="card" style="padding: 18px; margin-bottom: 16px;">
      <h5 class="font-serif" style="font-size: 18px; margin: 0 0 6px 0; color: var(--text-primary);">${mb.name || 'Inspiration Moodboard'}</h5>
      <p style="font-size: 12px; color: var(--text-secondary); margin: 0 0 12px 0;">${mb.description || 'Curated fashion vision board'}</p>
      <span style="font-size: 11px; color: var(--text-muted);">${fmtDate(mb.created_at)}</span>
    </div>
  `).join("");
}

function renderUserFavoritesPane(favoritedListings, wardrobeItems) {
  const container = document.getElementById("ud-unified-favorites-container");
  if (!container) return;

  const allFavs = [
    ...favoritedListings.map(l => ({ title: l.title || l.name, price: l.price, img: l._resolvedImageUrl || l._resolved || (Array.isArray(l.images) && l.images[0]) || l.image_url || l.image })),
    ...wardrobeItems.filter(w => w.is_favorite).map(w => ({ title: w.name, price: w.purchase_price, img: w._resolvedImageUrl || w._resolved || w.image_url || w.photo_url }))
  ];

  if (allFavs.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">🤍</div>
        <div class="empty-title">No Favorited Items</div>
        <div class="empty-desc">No pieces added to favorites or wishlist.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = allFavs.map(f => `
    <div class="card" style="padding: 12px;">
      <div style="width: 100%; height: 160px; background: var(--bg-surface-3); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; overflow: hidden; margin-bottom: 10px;">
        ${f.img ? `<img src="${f.img}" style="max-width: 100%; max-height: 100%; object-fit: contain;">` : '<span style="font-size: 10px; color: var(--text-muted);">No Img</span>'}
      </div>
      <h5 style="font-size: 13px; font-weight: 500; color: var(--text-primary); margin: 0 0 4px 0;">${f.title || 'Favorited Item'}</h5>
      <span style="font-size: 12px; color: var(--gold-primary); font-weight: 600;">${f.price ? fmt(f.price) : 'N/A'}</span>
    </div>
  `).join("");
}

function renderUserShopPane(totalRev, salesList) {
  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  setEl("shop-total-earnings", `$${totalRev.toFixed(2)}`);
  setEl("shop-available-bal", `$${(totalRev * 0.9).toFixed(2)}`);
  setEl("shop-pending-payout", "$0.00");
  setEl("shop-lifetime-rev", `$${totalRev.toFixed(2)}`);

  const tbody = document.getElementById("shop-payouts-tbody");
  if (!tbody) return;

  if (salesList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px;">No Sales Transactions Recorded</td></tr>`;
    return;
  }

  tbody.innerHTML = salesList.map(s => {
    const rawAmt = s.amount ?? s.total_amount ?? s.price ?? 0;
    return `
      <tr>
        <td><code style="color: var(--text-primary); font-size: 11px;">${s.id.slice(0, 8)}...</code></td>
        <td style="color: var(--accent-green); font-weight: 600;">${fmt(rawAmt)}</td>
        <td><span class="badge badge-approved">TRANSFERRED</span></td>
        <td>${fmtDate(s.created_at)}</td>
      </tr>
    `;
  }).join("");
}

function renderUserPurchasesPane(purchasesList) {
  const tbody = document.getElementById("ud-purchases-tbody");
  if (!tbody) return;

  if (purchasesList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">No Client Purchases Recorded</td></tr>`;
    return;
  }

  tbody.innerHTML = purchasesList.map(p => {
    const rawAmt = p.amount ?? p.total_amount ?? p.price ?? 0;
    return `
      <tr>
        <td><code style="color: var(--text-primary); font-size: 11px;">${p.id.slice(0, 8)}...</code></td>
        <td>Garment Order</td>
        <td>Seller ${p.seller_user_id ? p.seller_user_id.slice(0, 8) : 'N/A'}</td>
        <td style="color: var(--text-primary); font-weight: 600;">${fmt(rawAmt)}</td>
        <td><span class="badge badge-approved">DELIVERED</span></td>
        <td>${fmtDate(p.created_at)}</td>
        <td><button class="btn btn-secondary btn-sm" onclick="window.openLuxuryOrderInvoice('${p.id}')">Tax Invoice</button></td>
      </tr>
    `;
  }).join("");
}

function renderUserSubscriptionPane(u) {
  const tierName = u.subscription_tier || u.tier || "FREE";
  const subPlanBadge = document.getElementById("sub-plan-badge");
  if (subPlanBadge) {
    subPlanBadge.innerText = `${tierName.toUpperCase()} MEMBER`;
    subPlanBadge.className = `badge ${tierName.toLowerCase() === 'free' ? 'badge-pending' : 'badge-approved'}`;
  }

  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  setEl("sub-cycle", u.billing_cycle || "Monthly");
  setEl("sub-trial", u.trial_status || (u.is_trial ? "In Trial" : "N/A"));
  setEl("sub-start-date", u.subscription_created_at ? fmtDate(u.subscription_created_at) : fmtDate(u.created_at));
  setEl("sub-renewal-date", u.subscription_renewal_date ? fmtDate(u.subscription_renewal_date) : "Lifetime Free");

  const subStatusBadge = document.getElementById("sub-status-badge");
  if (subStatusBadge) {
    const statusStr = (u.subscription_status || "ACTIVE").toUpperCase();
    subStatusBadge.innerText = statusStr;
    subStatusBadge.className = `badge ${statusStr === 'ACTIVE' ? 'badge-approved' : 'badge-pending'}`;
  }
}

// ─────────────────────────────────────────────────────────────────────
// MODULE 6: COMMUNITY POSTS (MODERATION)
// ─────────────────────────────────────────────────────────────────────

async function loadCommunityPosts() {
  const tbody = document.getElementById("community-table-body");
  if (!tbody) return;

  renderTableSkeleton(tbody, 6, 5);

  const { data: posts, error } = await supabase
    .from("community_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error || !posts || posts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">No community editorial posts found.</td></tr>`;
    return;
  }

  tbody.innerHTML = posts.map((p) => `
    <tr>
      <td><code style="color: var(--text-primary); font-size: 11px;">${p.id.slice(0, 8)}...</code></td>
      <td>${p.user_id ? p.user_id.slice(0, 8) + '...' : 'User'}</td>
      <td>${(p.content || p.caption || '').slice(0, 45)}...</td>
      <td><span class="badge ${p.is_flagged ? 'badge-declined' : 'badge-approved'}">${p.is_flagged ? 'FLAGGED' : 'CLEAN'}</span></td>
      <td>${fmtDate(p.created_at)}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="window.deleteCommunityPost('${p.id}')">Delete</button>
      </td>
    </tr>
  `).join("");
}

window.deleteCommunityPost = async function (id) {
  showConfirmModal({
    title: "Delete Community Post?",
    message: "Are you sure you want to permanently delete this post from the public community feed?",
    btnText: "Yes, Delete Post",
    btnClass: "btn-danger",
    onConfirm: async () => {
      const { error } = await supabase.from("community_posts").delete().eq("id", id);
      if (error) {
        showError("Error deleting post: " + error.message);
      } else {
        showSuccess("Post removed from feed");
        loadCommunityPosts();
      }
    }
  });
};

// ─────────────────────────────────────────────────────────────────────
// MODULE 7: AFFILIATE CATALOG (SERVER PAGINATED)
// ─────────────────────────────────────────────────────────────────────

async function loadAffiliateProducts(page = 1) {
  currentAffiliatePage = page;
  const tbody = document.getElementById("affiliate-table-body");
  const countBadge = document.getElementById("affiliate-count-badge");
  const paginationControls = document.getElementById("affiliate-pagination-controls");
  const searchInput = document.getElementById("search-affiliate-products");
  const networkSelect = document.getElementById("filter-affiliate-network");

  const queryText = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const networkFilter = networkSelect ? networkSelect.value : "all";

  if (tbody) {
    renderTableSkeleton(tbody, 8, 6);
  }

  const from = (page - 1) * AFFILIATE_PAGE_SIZE;
  const to = from + AFFILIATE_PAGE_SIZE - 1;

  let dbQuery = supabase.from("affiliate_products").select("*", { count: "exact" });

  if (networkFilter !== "all") {
    dbQuery = dbQuery.eq("network", networkFilter);
  }

  if (queryText) {
    dbQuery = dbQuery.or(`title.ilike.%${queryText}%,brand.ilike.%${queryText}%,merchant_name.ilike.%${queryText}%`);
  }

  dbQuery = dbQuery.order("created_at", { ascending: false, nullsFirst: false }).range(from, to);

  const { data: items, count, error } = await dbQuery;

  if (error) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--accent-red); padding: 30px;">Error loading catalog: ${error.message}</td></tr>`;
    return;
  }

  const totalCount = count || 0;
  if (countBadge) countBadge.innerText = `${fmtNum(totalCount)} Products`;

  if (!items || items.length === 0) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-state">
              <div class="empty-icon">🛍️</div>
              <div class="empty-title">No Affiliate Products</div>
              <div class="empty-desc">${queryText || networkFilter !== 'all' ? 'No items match your filter criteria.' : 'No affiliate catalog items synced yet.'}</div>
            </div>
          </td>
        </tr>
      `;
    }
    if (paginationControls) paginationControls.innerHTML = "";
    return;
  }

  if (tbody) {
    tbody.innerHTML = items.map((item) => {
      const brandOrMerchant = item.brand || item.merchant_name || item.title || 'P';
      const initialLetter = initial(brandOrMerchant);
      const rawImg = item.image_url || item.image_link || item.image || item.imageUrl;

      let formattedPrice = "N/A";
      if (item.price != null) {
        const numPrice = typeof item.price === "number" ? item.price : parseFloat(item.price);
        const curr = item.currency || "USD";
        formattedPrice = !isNaN(numPrice) ? `${curr} ${numPrice.toFixed(2)}` : `${curr} ${item.price}`;
      }

      const rawLink = item.deep_link || item.deeplink || item.url || item.link || item.product_url || item.affiliate_url || '';
      const encodedLink = encodeURIComponent(rawLink);
      const networkBadge = (item.network || "AWIN").toUpperCase();

      return `
        <tr>
          <td style="width: 50px; text-align: center; padding: 8px;">
            <div style="width: 40px; height: 40px; border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-surface-3); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; margin: 0 auto;">
              ${rawImg ? `<img src="${rawImg}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none';">` : `<span style="font-weight: 700; color: var(--gold-primary); font-size: 13px;">${initialLetter}</span>`}
            </div>
          </td>
          <td style="max-width: 240px;">
            <div style="font-weight: 500; color: var(--text-primary); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.title || ''}">${item.title || 'Untitled Product'}</div>
            <div style="font-size: 10px; color: var(--text-muted);">Ext ID: <code>${item.external_id || (item.id ? item.id.slice(0, 8) : 'N/A')}</code></div>
          </td>
          <td><strong style="color: var(--text-primary); font-size: 12px;">${item.brand || 'Unbranded'}</strong></td>
          <td><div style="font-size: 12px; color: var(--text-secondary);">${item.merchant_name || 'Merchant'}</div></td>
          <td><span class="badge ${networkBadge === 'AWIN' ? 'badge-approved' : 'badge-gold'}" style="font-size: 10px;">${networkBadge}</span></td>
          <td><strong style="color: var(--accent-green); font-size: 13px;">${formattedPrice}</strong></td>
          <td><span class="badge badge-gold" style="font-size: 10px;">${item.category || item.google_product_category || 'Fashion'}</span></td>
          <td style="text-align: right;">
            <button type="button" class="btn btn-primary btn-sm" onclick="window.openAffiliateProductLink('${encodedLink}')">
              <span>View Product ↗</span>
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  const totalPages = Math.ceil(totalCount / AFFILIATE_PAGE_SIZE);
  if (paginationControls) {
    paginationControls.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-top: 1px solid var(--border-subtle); background: var(--bg-surface-2);">
        <div style="font-size: 12px; color: var(--text-muted);">
          Showing <strong style="color: var(--text-primary);">${totalCount > 0 ? from + 1 : 0}–${Math.min(to + 1, totalCount)}</strong> of <strong style="color: var(--text-primary);">${fmtNum(totalCount)}</strong> items
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="btn btn-secondary btn-sm" ${page <= 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''} onclick="window.loadAffiliateProducts(${page - 1})">
            ← Prev
          </button>
          <span style="font-size: 12px; color: var(--text-primary); font-weight: 500; padding: 0 8px;">
            Page ${page} of ${totalPages || 1}
          </span>
          <button class="btn btn-secondary btn-sm" ${page >= totalPages ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''} onclick="window.loadAffiliateProducts(${page + 1})">
            Next →
          </button>
        </div>
      </div>
    `;
  }
}
window.loadAffiliateProducts = loadAffiliateProducts;

window.openAffiliateProductLink = function (encodedUrl) {
  if (!encodedUrl || encodedUrl === '' || encodedUrl === 'undefined') {
    showError("No affiliate link URL available for this product.");
    return;
  }
  let targetUrl = decodeURIComponent(encodedUrl);
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    targetUrl = "https://" + targetUrl;
  }
  window.open(targetUrl, "_blank", "noopener,noreferrer");
};

async function handleAffiliateSync() {
  const btn = document.getElementById("btn-trigger-affiliate-sync");
  if (btn) {
    btn.innerText = "Syncing...";
    btn.disabled = true;
  }
  try {
    const { error } = await supabase.functions.invoke("affiliate-sync");
    if (error) throw error;
    showSuccess("Affiliate catalog sync completed");
  } catch (err) {
    console.warn("Affiliate edge function note:", err);
    showInfo("Sync dispatched; catalog will refresh shortly.");
  } finally {
    if (btn) {
      btn.innerText = "Sync Affiliate Catalog";
      btn.disabled = false;
    }
    loadAffiliateProducts(1);
  }
}

// ─────────────────────────────────────────────────────────────────────
// PUSH BROADCAST VIA EXPO INFRASTRUCTURE
// ─────────────────────────────────────────────────────────────────────

async function handlePushBroadcast(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector("button[type='submit']");
  const title = document.getElementById("push-title")?.value.trim();
  const message = document.getElementById("push-message")?.value.trim();
  const segment = document.getElementById("push-segment")?.value;

  if (!title || !message) {
    showError("Please enter both title and message.");
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = "Transmitting Push Broadcast...";
  }

  try {
    let query = supabase.from("user_profiles").select("*");
    if (segment === "creators") {
      query = query.eq("role", "creator");
    } else if (segment === "premium") {
      query = query.neq("subscription_tier", "free");
    }

    const { data: users, error } = await query;
    if (error) throw error;

    const userIds = (users || []).map(u => u.id);
    const tokensSet = new Set();

    (users || []).forEach(u => {
      const t = u.expo_push_token || u.push_token;
      if (typeof t === "string" && (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken["))) {
        tokensSet.add(t);
      }
    });

    try {
      if (userIds.length > 0) {
        const { data: tokenRows } = await supabase.from("user_push_tokens").select("*").in("user_id", userIds);
        if (tokenRows) {
          tokenRows.forEach(row => {
            const val = row.expo_push_token || row.push_token || row.token || row.expo_token;
            if (typeof val === "string" && (val.startsWith("ExponentPushToken[") || val.startsWith("ExpoPushToken["))) {
              tokensSet.add(val);
            }
          });
        }
      }
    } catch (e) {
      console.warn("Notice: user_push_tokens check note:", e);
    }

    const tokens = Array.from(tokensSet);

    // Also log in-app notification
    try {
      await supabase.from("notifications").insert((users || []).map(u => ({
        user_id: u.id,
        title,
        body: message,
        type: "broadcast",
        is_read: false
      })));
    } catch (logErr) {
      console.warn("Notice: In-app notification insert:", logErr);
    }

    if (tokens.length > 0) {
      const expoMessages = tokens.map(token => ({
        to: token,
        sound: "default",
        title,
        body: message,
        data: { segment, dispatchedAt: new Date().toISOString() }
      }));

      try {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(expoMessages)
        });
        showSuccess(`Expo push transmitted to ${tokens.length} devices!`);
      } catch (fetchErr) {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(expoMessages)
        });
        showSuccess(`Broadcast dispatched to ${tokens.length} active devices.`);
      }
    } else {
      showSuccess(`Broadcast logged in-app for ${users?.length || 0} clients.`);
    }

    document.getElementById("push-form")?.reset();
  } catch (err) {
    showError("Error dispatching push notification: " + (err.message || err));
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = "DISPATCH BROADCAST NOTIFICATION";
    }
  }
}
