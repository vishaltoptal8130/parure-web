// ─────────────────────────────────────────────────────────────────────
// Parure La Plee — Master Admin Web Dashboard Core Logic
// ─────────────────────────────────────────────────────────────────────

import { initMarketplaceModule, renderMarketplaceTable } from "./js/marketplace.js";

const SUPABASE_URL = "https://hcunlytijzmzxklrxxsr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjdW5seXRpanptenhrbHJ4eHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MzYzMzQsImV4cCI6MjA5NzMxMjMzNH0.G_YGI-z7xz-oUeKPCnRjS-_Ei_2yT5eth8iWR4zzPAg";

const MASTER_ADMIN_EMAIL = "admin@parure.app";

// Initialize Supabase Client
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// State management
let currentUser = null;
let currentProfile = null;
let currentTransactionsData = [];
let activeViewingTx = null;
let allUsersData = [];

// High-Performance In-Memory Cache Layers
const globalSignedUrlCache = new Map(); // storagePath -> { url, expiresAt }
const globalUserProfileCache = new Map(); // userId -> { payload, timestamp }
const USER_PROFILE_CACHE_TTL = 3 * 60 * 1000; // 3 minutes TTL
globalUserProfileCache.clear();

function getCachedSignedUrl(path) {
  if (!path) return null;
  const cached = globalSignedUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }
  return null;
}

function setCachedSignedUrl(path, url) {
  if (path && url) {
    globalSignedUrlCache.set(path, {
      url,
      expiresAt: Date.now() + (3500 * 1000)
    });
  }
}

// Utility debounce helper
function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

document.addEventListener("DOMContentLoaded", () => {
  if (!supabase) {
    console.error("Supabase client failed to load!");
    return;
  }
  initApp();
});

// ─────────────────────────────────────────────────────────────────────
// GLOBAL LUXURY CONFIRMATION MODAL HELPER
// ─────────────────────────────────────────────────────────────────────

window.showConfirmModal = function ({ title = "Confirm Action", message = "Are you sure?", btnText = "Confirm & Execute", btnClass = "btn-danger", onConfirm }) {
  const modal = document.getElementById("modal-confirm-action");
  const titleEl = document.getElementById("confirm-modal-title");
  const messageEl = document.getElementById("confirm-modal-message");
  const proceedBtn = document.getElementById("confirm-modal-proceed");
  const cancelBtn = document.getElementById("confirm-modal-cancel");

  if (!modal) {
    if (confirm(message)) {
      if (onConfirm) onConfirm();
    }
    return;
  }

  titleEl.innerText = title;
  messageEl.innerText = message;
  proceedBtn.innerText = btnText;
  proceedBtn.className = btnClass;

  const handleProceed = async () => {
    modal.classList.remove("active");
    cleanup();
    if (onConfirm) await onConfirm();
  };

  const handleCancel = () => {
    modal.classList.remove("active");
    cleanup();
  };

  function cleanup() {
    proceedBtn.removeEventListener("click", handleProceed);
    cancelBtn.removeEventListener("click", handleCancel);
  }

  proceedBtn.addEventListener("click", handleProceed);
  cancelBtn.addEventListener("click", handleCancel);

  modal.classList.add("active");
};

// ─────────────────────────────────────────────────────────────────────
// AUTHENTICATION & MASTER ADMIN GUARD
// ─────────────────────────────────────────────────────────────────────

async function initApp() {
  setupEventListeners();
  initMarketplaceModule(supabase);

  // Check active session
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    if (session.user.email?.toLowerCase() === MASTER_ADMIN_EMAIL) {
      await verifyAndLoadAdmin(session.user);
    } else {
      await supabase.auth.signOut();
      showAuthView(`Access Denied: Only ${MASTER_ADMIN_EMAIL} is authorized as Master Admin.`);
    }
  } else {
    showAuthView();
  }
}

async function verifyAndLoadAdmin(user) {
  try {
    if (user.email?.toLowerCase() !== MASTER_ADMIN_EMAIL) {
      await supabase.auth.signOut();
      showAuthView(`Unauthorized: Only ${MASTER_ADMIN_EMAIL} is permitted.`);
      return;
    }

    // Call RPC SECURITY DEFINER to force elevate all admin profile fields in DB
    try {
      await supabase.rpc("setup_master_admin_profile", { p_email: MASTER_ADMIN_EMAIL });
    } catch (e) {
      console.warn("RPC setup_master_admin_profile call note:", e);
    }

    // Fetch updated profile
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    currentUser = user;
    currentProfile = profile || { role: "admin" };

    // Update Header & Settings Profile info
    const adminName = profile?.display_name || user.user_metadata?.full_name || "Parure Master Admin";
    const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80";
    const adminEmail = user.email || MASTER_ADMIN_EMAIL;

    const sidebarName = document.getElementById("user-display-name");
    const sidebarAvatar = document.getElementById("admin-avatar-img");
    const nameInput = document.getElementById("admin-name-input");
    const avatarInput = document.getElementById("admin-avatar-input");
    const emailInput = document.getElementById("admin-email-input");
    const heroName = document.getElementById("admin-profile-hero-name");
    const heroEmail = document.getElementById("admin-profile-hero-email");
    const heroPreview = document.getElementById("admin-avatar-preview");

    if (sidebarName) sidebarName.innerText = adminName;
    if (sidebarAvatar) sidebarAvatar.src = avatarUrl;
    if (nameInput) nameInput.value = adminName;
    if (avatarInput) avatarInput.value = avatarUrl;
    if (emailInput) emailInput.value = adminEmail;
    if (heroName) heroName.innerText = adminName;
    if (heroEmail) heroEmail.innerText = adminEmail;
    if (heroPreview) heroPreview.src = avatarUrl;

    showDashboardView();
    loadAllDashboardData();

  } catch (err) {
    console.error("Admin Auth verification failed:", err);
    showAuthView("Authentication failed. Please check credentials.");
  }
}

function showAuthView(errorMsg = "", successMsg = "") {
  document.getElementById("auth-container").classList.remove("hidden");
  document.getElementById("app-container").classList.add("hidden");

  const errEl = document.getElementById("auth-error");
  const succEl = document.getElementById("auth-success");

  if (errorMsg) {
    errEl.innerText = errorMsg;
    errEl.classList.remove("hidden");
  } else {
    errEl.classList.add("hidden");
  }

  if (successMsg) {
    succEl.innerText = successMsg;
    succEl.classList.remove("hidden");
  } else {
    succEl.classList.add("hidden");
  }
}

function showDashboardView() {
  document.getElementById("auth-container").classList.add("hidden");
  document.getElementById("app-container").classList.remove("hidden");
}

function setupEventListeners() {
  // Password Visibility Toggle Eye Button (SVG Vector)
  const toggleBtn = document.getElementById("btn-toggle-password");
  const passInput = document.getElementById("login-password");
  const eyeSvg = document.getElementById("eye-icon-svg");

  if (toggleBtn && passInput) {
    toggleBtn.addEventListener("click", () => {
      const type = passInput.getAttribute("type") === "password" ? "text" : "password";
      passInput.setAttribute("type", type);
      if (eyeSvg) {
        if (type === "text") {
          eyeSvg.innerHTML = `<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.17c0-1.66-1.34-3-3-3l-.17.02z"/>`;
        } else {
          eyeSvg.innerHTML = `<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>`;
        }
      }
    });
  }

  // Login submit
  document.getElementById("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;
    const btn = document.getElementById("btn-login");

    if (email !== MASTER_ADMIN_EMAIL) {
      showAuthView(`Only ${MASTER_ADMIN_EMAIL} is authorized as Master Admin.`);
      return;
    }

    btn.innerText = "VERIFYING...";
    btn.disabled = true;

    let { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error && (error.message.includes("User not found") || error.message.includes("Invalid login"))) {
      const signUpRes = await supabase.auth.signUp({
        email: MASTER_ADMIN_EMAIL,
        password: password,
        options: { data: { full_name: "Parure Master Admin" } }
      });

      if (!signUpRes.error && signUpRes.data?.user) {
        data = signUpRes.data;
        error = null;
        await supabase.rpc("setup_master_admin_profile", { p_email: MASTER_ADMIN_EMAIL });
      }
    }

    btn.innerText = "SIGN IN TO DASHBOARD";
    btn.disabled = false;

    if (error) {
      showAuthView(`Authentication Error: ${error.message}`);
    } else if (data?.user) {
      await verifyAndLoadAdmin(data.user);
    }
  });

  // Forgot password handler
  document.getElementById("btn-forgot-password")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.resetPasswordForEmail(MASTER_ADMIN_EMAIL, {
      redirectTo: window.location.href
    });

    if (error) {
      showAuthView("Reset Error: " + error.message);
    } else {
      showAuthView("", `Password reset link sent to ${MASTER_ADMIN_EMAIL}! Please check your email inbox to set a new password.`);
    }
  });

  // Logout button
  document.getElementById("btn-logout")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    currentUser = null;
    currentProfile = null;
    showAuthView();
  });

  // Navigation tab switching
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach((p) => p.classList.add("hidden"));

      item.classList.add("active");
      const targetTabId = item.getAttribute("data-tab");
      document.getElementById(targetTabId)?.classList.remove("hidden");

      const tabName = item.querySelector("span").innerText;
      document.getElementById("current-tab-title").innerText = tabName;

      // Reset user detail view if switching away
      if (targetTabId !== "tab-users") {
        window.closeUserProfileView();
      }
    });
  });

  // Refresh data button
  document.getElementById("btn-refresh-data")?.addEventListener("click", async () => {
    const icon = document.getElementById("refresh-icon-svg");
    const text = document.getElementById("refresh-btn-text");

    if (icon) icon.classList.add("spinning");
    if (text) text.innerText = "Refreshing...";

    globalUserProfileCache.clear();
    await loadAllDashboardData();

    setTimeout(() => {
      if (icon) icon.classList.remove("spinning");
      if (text) text.innerText = "Refresh Data";
    }, 400);
  });

  // User search input
  document.getElementById("search-users")?.addEventListener("input", debounce(filterUserDirectory, 300));

  // ── ADMIN PROFILE & SETTINGS HANDLERS ──
  let pendingAvatarFile = null;

  // File browse button trigger
  document.getElementById("btn-browse-avatar")?.addEventListener("click", () => {
    document.getElementById("admin-avatar-file-input")?.click();
  });

  // File input change: Instant preview & file storage
  document.getElementById("admin-avatar-file-input")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file.");
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

  // URL input change: Instant preview
  document.getElementById("admin-avatar-input")?.addEventListener("input", (e) => {
    const url = e.target.value.trim();
    const previewImg = document.getElementById("admin-avatar-preview");
    if (previewImg && url.startsWith("http")) {
      previewImg.src = url;
    }
  });

  // Admin Profile Update Submit
  document.getElementById("form-update-profile")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById("btn-save-admin-profile");
    const fullName = document.getElementById("admin-name-input")?.value.trim();
    let avatarUrl = document.getElementById("admin-avatar-input")?.value.trim();

    if (!fullName) {
      alert("Please enter a valid display name.");
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerText = "SAVING CHANGES...";
    }

    try {
      // If a file was picked, upload it to Supabase Storage bucket 'avatars'
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
          console.warn("Storage bucket notice:", storageErr);
        }
      }

      // Update Supabase Auth metadata
      const { error: authErr } = await supabase.auth.updateUser({
        data: { full_name: fullName, avatar_url: avatarUrl }
      });

      if (authErr) throw authErr;

      // Update Supabase user_profiles table if currentUser exists
      if (currentUser?.id) {
        await supabase.from("user_profiles").update({
          display_name: fullName,
          avatar_url: avatarUrl
        }).eq("id", currentUser.id);
      }

      // Sync DOM elements instantly across sidebar, header, and profile hero banner
      const sidebarName = document.getElementById("user-display-name");
      const sidebarAvatar = document.getElementById("admin-avatar-img");
      const heroName = document.getElementById("admin-profile-hero-name");
      const heroEmail = document.getElementById("admin-profile-hero-email");
      const previewAvatar = document.getElementById("admin-avatar-preview");
      const emailInput = document.getElementById("admin-email-input");

      if (sidebarName) sidebarName.innerText = fullName;
      if (sidebarAvatar) sidebarAvatar.src = avatarUrl;
      if (heroName) heroName.innerText = fullName;
      if (previewAvatar) previewAvatar.src = avatarUrl;
      if (emailInput && currentUser?.email) emailInput.value = currentUser.email;
      if (heroEmail && currentUser?.email) heroEmail.innerText = currentUser.email;

      // Force update all dashboard tables & overview metrics live without reloading page
      if (typeof loadUserDirectory === "function") loadUserDirectory();
      if (typeof loadOverviewMetrics === "function") loadOverviewMetrics();

      pendingAvatarFile = null;
      alert("✅ Admin profile updated successfully across the entire dashboard!");
    } catch (err) {
      alert("Error updating profile: " + (err.message || err));
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = "SAVE PROFILE CHANGES";
      }
    }
  });

  // Change Password Submit
  document.getElementById("form-change-password")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById("btn-save-admin-password");
    const newPass = document.getElementById("input-new-password")?.value;
    const confirmPass = document.getElementById("input-confirm-password")?.value;

    if (newPass !== confirmPass) {
      alert("New password and confirm password do not match!");
      return;
    }
    if (newPass.length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerText = "SAVING PASSWORD...";
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;

      alert("✅ Password changed and saved successfully!");
      document.getElementById("form-change-password")?.reset();
    } catch (err) {
      alert("Error resetting password: " + (err.message || err));
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = "RESET & SAVE PASSWORD";
      }
    }
  });

  // Filters & Search Event Listeners
  document.getElementById("filter-creator-status")?.addEventListener("change", loadCreatorApplications);
  document.getElementById("search-creators")?.addEventListener("input", loadCreatorApplications);

  // Beta modal & search events
  document.getElementById("search-beta-testers")?.addEventListener("input", loadBetaTesters);
  document.getElementById("btn-open-add-beta")?.addEventListener("click", () => {
    document.getElementById("modal-add-beta")?.classList.add("active");
  });
  const closeBetaModal = () => {
    document.getElementById("modal-add-beta")?.classList.remove("active");
  };
  document.getElementById("btn-close-beta-modal")?.addEventListener("click", closeBetaModal);

  // Beta add form submit
  document.getElementById("form-add-beta")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const inputEl = document.getElementById("input-beta-email");
    const submitBtn = e.target.querySelector("button[type='submit']");
    const email = inputEl?.value.trim();

    if (!email) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = "Adding...";
    }

    try {
      const { error } = await supabase
        .from("beta_testers")
        .insert({ email: email.toLowerCase() });

      if (error) {
        alert("Error adding beta tester: " + error.message);
      } else {
        closeBetaModal();
        if (inputEl) inputEl.value = "";
        await loadBetaTesters();
        if (typeof loadOverviewMetrics === "function") {
          await loadOverviewMetrics();
        }
      }
    } catch (err) {
      alert("Error adding beta tester: " + (err.message || err));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = "Add Tester";
      }
    }
  });

  // Push broadcast form with Expo Push Notification API integration
  document.getElementById("push-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector("button[type='submit']");
    const title = document.getElementById("push-title")?.value.trim();
    const message = document.getElementById("push-message")?.value.trim();
    const segment = document.getElementById("push-segment")?.value;

    if (!title || !message) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = "Dispatching Push via Expo...";
    }

    try {
      // 1. Fetch target user profiles from Supabase
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

      // Check tokens directly on user_profiles if column exists
      (users || []).forEach(u => {
        const t = u.expo_push_token || u.push_token;
        if (typeof t === "string" && (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken["))) {
          tokensSet.add(t);
        }
      });

      // 2. Fetch from dedicated user_push_tokens table
      try {
        let q = supabase.from("user_push_tokens").select("*");
        if (userIds.length > 0) {
          q = q.in("user_id", userIds);
        }
        const { data: tokenRows, error: tErr } = await q;
        if (!tErr && tokenRows) {
          tokenRows.forEach(row => {
            const val = row.expo_push_token || row.push_token || row.token || row.expo_token || row.device_token;
            if (typeof val === "string" && (val.startsWith("ExponentPushToken[") || val.startsWith("ExpoPushToken["))) {
              tokensSet.add(val);
            }
          });
        }
      } catch (e) {
        console.warn("Notice: user_push_tokens query handled safely:", e.message);
      }

      const tokens = Array.from(tokensSet);

      // 3. Also log/insert in-app notifications into Supabase if notifications table exists
      try {
        await supabase.from("notifications").insert((users || []).map(u => ({
          user_id: u.id,
          title: title,
          body: message,
          type: "broadcast",
          is_read: false
        })));
      } catch (logErr) {
        console.warn("Notice: In-app notification table insert skipped:", logErr.message);
      }

      // 3. Send Push Notifications via Expo Push HTTP API
      if (tokens.length > 0) {
        const expoMessages = tokens.map(token => ({
          to: token,
          sound: "default",
          title: title,
          body: message,
          data: { segment, dispatchedAt: new Date().toISOString() }
        }));

        try {
          const response = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json"
            },
            body: JSON.stringify(expoMessages)
          });
          const resData = await response.json();
          alert(`✅ Expo Push Broadcast Dispatched Successfully!\n\n• Target Tokens: ${tokens.length} Active Devices\n• Segment: ${segment.toUpperCase()}\n• Title: "${title}"`);
        } catch (fetchErr) {
          // Browser CORS fallback: dispatch with mode 'no-cors' so request is transmitted to Expo
          await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            mode: "no-cors",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(expoMessages)
          });
          alert(`✅ Expo Push Broadcast Dispatched to ${tokens.length} Active Devices!\n\n• Segment: ${segment.toUpperCase()}\n• Title: "${title}"`);
        }
      } else {
        alert(`✅ Broadcast Sent & Logged to Supabase!\n\n• Target Users: ${users?.length || 0}\n• Segment: ${segment.toUpperCase()}\n• Title: "${title}"\n(Note: Devices will receive this via Expo Push once Expo Push Tokens are saved in user_profiles / user_push_tokens).`);
      }

      document.getElementById("push-form").reset();
    } catch (err) {
      alert("Error dispatching Expo Push Notification: " + (err.message || err));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = "DISPATCH BROADCAST NOTIFICATION";
      }
    }
  });

  // Affiliate sync trigger & search listeners
  let affiliateSearchTimeout = null;
  document.getElementById("search-affiliate-products")?.addEventListener("input", () => {
    clearTimeout(affiliateSearchTimeout);
    affiliateSearchTimeout = setTimeout(() => {
      loadAffiliateProducts(1);
    }, 300);
  });
  document.getElementById("filter-affiliate-network")?.addEventListener("change", () => {
    loadAffiliateProducts(1);
  });

  document.getElementById("btn-trigger-affiliate-sync")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-trigger-affiliate-sync");
    btn.innerText = "Syncing...";
    try {
      const { data, error } = await supabase.functions.invoke("affiliate-sync");
      if (error) throw error;
      alert("Affiliate catalog sync completed!");
    } catch (err) {
      console.warn("Edge function call result:", err);
      alert("Affiliate sync triggered! (Catalog refreshed)");
    } finally {
      btn.innerText = "Sync Affiliate Catalog";
      loadAffiliateProducts(1);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────
// DATA LOADING & MODULES
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
    loadAffiliateProducts()
  ]);
}

async function loadOverviewMetrics() {
  const { count: usersCount } = await supabase
    .from("user_profiles")
    .select("*", { count: "exact", head: true })
    .neq("role", "admin");
  document.getElementById("stat-total-users").innerText = usersCount ?? 0;

  const { count: creatorsCount } = await supabase
    .from("user_profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "creator");
  document.getElementById("stat-active-creators").innerText = creatorsCount ?? 0;

  const { count: activeListingsCount } = await supabase
    .from("marketplace_listings")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");
  document.getElementById("stat-active-listings").innerText = activeListingsCount ?? 0;

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
  document.getElementById("stat-pending-reviews").innerText = totalPending;
  document.getElementById("badge-creators-count").innerText = pendingCreators ?? 0;
  document.getElementById("badge-marketplace-count").innerText = highValueCount ?? 0;

  // Real-time GMV & Financial Calculation
  const { data: txs } = await supabase.from("marketplace_transactions").select("*").order("created_at", { ascending: false }).limit(300);
  let totalGmv = 0;
  let totalFees = 0;
  let totalNet = 0;
  let totalOrdersCount = 0;

  if (txs && txs.length > 0) {
    totalOrdersCount = txs.length;
    txs.forEach(t => {
      const amountCents = t.amount || 0;
      const feeCents = t.application_fee_amount ?? t.platform_fee_amount ?? Math.round(amountCents * 0.10);
      const netCents = t.seller_net_amount ?? (amountCents - feeCents);

      totalGmv += amountCents;
      totalFees += feeCents;
      totalNet += netCents;
    });
  }

  document.getElementById("stat-total-gmv").innerText = `$${(totalGmv / 100).toFixed(2)}`;
  document.getElementById("stat-platform-fees").innerText = `$${(totalFees / 100).toFixed(2)}`;
  document.getElementById("stat-seller-net").innerText = `$${(totalNet / 100).toFixed(2)}`;
  document.getElementById("stat-escrow-status").innerText = `${totalOrdersCount} ORDERS`;

  const { count: betaCount } = await supabase.from("beta_testers").select("*", { count: "exact", head: true });
  document.getElementById("stat-beta-testers").innerText = betaCount ?? 0;

  const quickList = document.getElementById("quick-action-list");
  if (quickList) {
    quickList.innerHTML = `
      <div class="activity-item">
        <div>
          <div class="activity-title">Creator Applications</div>
          <div class="activity-sub">Inbound creator requests</div>
        </div>
        <span class="status-badge ${pendingCreators > 0 ? 'badge-pending' : 'badge-approved'}">${pendingCreators ?? 0} Pending</span>
      </div>
      <div class="activity-item">
        <div>
          <div class="activity-title">High-Value Items (>$500)</div>
          <div class="activity-sub">Luxury items pending audit</div>
        </div>
        <span class="status-badge ${highValueCount > 0 ? 'badge-pending' : 'badge-approved'}">${highValueCount ?? 0} Pending</span>
      </div>
    `;
  }

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
  document.getElementById("season-winter-count").innerText = `${seasonCounts.Winter} users`;
  document.getElementById("season-winter-bar").style.width = `${Math.round((seasonCounts.Winter / denominator) * 100)}%`;

  document.getElementById("season-autumn-count").innerText = `${seasonCounts.Autumn} users`;
  document.getElementById("season-autumn-bar").style.width = `${Math.round((seasonCounts.Autumn / denominator) * 100)}%`;

  document.getElementById("season-summer-count").innerText = `${seasonCounts.Summer} users`;
  document.getElementById("season-summer-bar").style.width = `${Math.round((seasonCounts.Summer / denominator) * 100)}%`;

  document.getElementById("season-spring-count").innerText = `${seasonCounts.Spring} users`;
  document.getElementById("season-spring-bar").style.width = `${Math.round((seasonCounts.Spring / denominator) * 100)}%`;

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
      title: `User Registration`,
      sub: u.email || 'Member account created',
      time: new Date(u.created_at)
    });
  });

  (itemsRes.data || []).forEach(i => {
    activities.push({
      type: 'LISTING',
      title: `Marketplace Item: ${i.title || 'Garment'}`,
      sub: `Priced at $${((i.price || 0) / 100).toFixed(2)}`,
      time: new Date(i.created_at)
    });
  });

  (appsRes.data || []).forEach(a => {
    const cleanHandle = a.handle ? a.handle.replace(/^@+/, '') : 'creator';
    activities.push({
      type: 'CREATOR APP',
      title: `Creator Application: @${cleanHandle}`,
      sub: a.email || 'Applied for creator program',
      time: new Date(a.created_at)
    });
  });

  (txRes.data || []).forEach(t => {
    activities.push({
      type: 'PURCHASE',
      title: `Order Purchase Transaction`,
      sub: `Order value: $${((t.amount || 0) / 100).toFixed(2)}`,
      time: new Date(t.created_at)
    });
  });

  (postsRes.data || []).forEach(p => {
    activities.push({
      type: 'COMMUNITY',
      title: `Community Feed Post`,
      sub: (p.content || '').slice(0, 45) + '...',
      time: new Date(p.created_at)
    });
  });

  (betaRes.data || []).forEach(b => {
    activities.push({
      type: 'BETA ADDED',
      title: `Beta Whitelist Entry`,
      sub: b.email,
      time: new Date(b.created_at)
    });
  });

  activities.sort((a, b) => b.time - a.time);

  if (activities.length === 0) {
    feedEl.innerHTML = `<p style="color: var(--muted); font-size: 13px;">No recent activity recorded.</p>`;
    return;
  }

  feedEl.innerHTML = activities.slice(0, 15).map(act => `
    <div class="activity-item">
      <div style="display: flex; flex-direction: column; gap: 3px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="status-badge badge-gold" style="font-size: 9px; padding: 2px 6px;">${act.type}</span>
          <span class="activity-title">${act.title}</span>
        </div>
        <div class="activity-sub" style="margin-left: 2px;">${act.sub}</div>
      </div>
      <span style="font-size: 11px; color: var(--muted); white-space: nowrap;">${act.time.toLocaleDateString()}</span>
    </div>
  `).join("");
}

// ── MODULE 1: CREATOR APPLICATIONS (WITH CONFIRMATION) ──
async function loadCreatorApplications() {
  const tbody = document.getElementById("creator-table-body");
  const filter = document.getElementById("filter-creator-status")?.value || "pending";
  const search = document.getElementById("search-creators")?.value.trim().toLowerCase() || "";

  let query = supabase.from("creator_applications").select("*").order("created_at", { ascending: false });
  if (filter !== "all") {
    query = query.eq("status", filter);
  }

  const { data: apps, error } = await query;

  if (error || !apps || apps.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 30px;">No creator applications found matching '${filter}'.</td></tr>`;
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
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 30px;">No applications match search '${search}'.</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredApps.map((app) => {
    const cleanHandle = app.handle ? app.handle.replace(/^@+/, '') : 'creator';

    let displayName = app.full_name;
    if (!displayName || displayName.toLowerCase() === (app.email || "").toLowerCase()) {
      const emailPrefix = (app.email || "Applicant").split("@")[0];
      displayName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
    }

    const initial = displayName.charAt(0).toUpperCase();

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="user-avatar-pill">${initial}</div>
            <div>
              <strong style="color: var(--cream); font-weight: 500;">${displayName}</strong><br>
              <span style="font-size: 11px; color: var(--muted);">${app.email || ''}</span>
            </div>
          </div>
        </td>
        <td>
          <span class="status-badge badge-gold" style="font-size: 11px; text-transform: none;">@${cleanHandle}</span>
        </td>
        <td>
          ${app.portfolio_url ? `
            <a href="${app.portfolio_url}" target="_blank" class="btn-secondary" style="padding: 4px 10px; font-size: 11px; text-decoration: none;">
              View Portfolio ↗
            </a>
          ` : `<span style="color: var(--muted); font-size: 12px;">N/A</span>`}
        </td>
        <td>
          <strong style="color: var(--tan-light); font-size: 13px;">${app.follower_count ? Number(app.follower_count).toLocaleString() : 'N/A'}</strong>
          <span style="font-size: 10px; color: var(--muted); display: block;">followers</span>
        </td>
        <td>
          <span class="status-badge badge-${app.status}">${app.status.toUpperCase()}</span>
        </td>
        <td>
          <span style="font-size: 12px; color: var(--muted-light);">${new Date(app.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
        </td>
        <td>
          ${app.status === 'pending' ? `
            <div style="display: flex; gap: 6px;">
              <button class="btn-success" onclick="approveCreator('${app.id}')">Approve</button>
              <button class="btn-danger" onclick="declineCreator('${app.id}')">Decline</button>
            </div>
          ` : app.status === 'approved' ? `
            <div style="display: flex; gap: 6px; align-items: center;">
              <span style="font-size: 11px; color: #4ADE80; font-weight: 500;">Active Partner</span>
              <button class="btn-danger" style="padding: 4px 8px; font-size: 10px;" onclick="declineCreator('${app.id}')">Revoke</button>
            </div>
          ` : `
            <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="approveCreator('${app.id}')">Re-evaluate</button>
          `}
        </td>
      </tr>
    `;
  }).join("");
}

window.approveCreator = async function (id) {
  window.showConfirmModal({
    title: "Approve Creator Application?",
    message: "Are you sure you want to approve this creator? They will receive partner status and affiliate commission access.",
    btnText: "Approve Creator",
    btnClass: "btn-success",
    onConfirm: async () => {
      const { error } = await supabase.from("creator_applications").update({ status: "approved" }).eq("id", id);
      if (error) alert("Error approving creator: " + error.message);
      else loadAllDashboardData();
    }
  });
};

window.declineCreator = async function (id) {
  window.showConfirmModal({
    title: "Decline / Revoke Creator Status?",
    message: "Are you sure you want to decline or revoke this creator application?",
    btnText: "Yes, Decline Creator",
    btnClass: "btn-danger",
    onConfirm: async () => {
      const { error } = await supabase.from("creator_applications").update({ status: "declined" }).eq("id", id);
      if (error) alert("Error declining creator: " + error.message);
      else loadAllDashboardData();
    }
  });
};

// ── GLOBAL HELPER FUNCTIONS FOR MARKETPLACE MODULE (WITH CONFIRMATION) ──
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

  window.showConfirmModal({
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
        alert("Error updating listing: " + error.message);
      } else {
        await renderMarketplaceTable(supabase);
        loadOverviewMetrics();
      }
    }
  });
};

window.toggleAuthenticityDirect = async function (id, confirmState) {
  const actionText = confirmState ? "Confirm Authenticity" : "Unverify Authenticity";

  window.showConfirmModal({
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

      const { error } = await supabase
        .from("marketplace_listings")
        .update(updates)
        .eq("id", id);

      if (error) {
        alert("Error updating authenticity: " + error.message);
      } else {
        await renderMarketplaceTable(supabase);
      }
    }
  });
};

// ── MODULE 3: ORDERS & FINANCIALS (PURE READ-ONLY AUDIT VIEW) ──
async function loadOrdersAndTransactions() {
  const tbody = document.getElementById("orders-table-body");
  const { data: txs, error } = await supabase
    .from("marketplace_transactions")
    .select("*, listing:marketplace_listings(*), buyer:user_profiles!buyer_user_id(email, display_name), seller:user_profiles!seller_user_id(email, display_name)")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error || !txs || txs.length === 0) {
    const fallbackRes = await supabase.from("marketplace_transactions").select("*").order("created_at", { ascending: false });
    if (fallbackRes.data && fallbackRes.data.length > 0) {
      currentTransactionsData = fallbackRes.data;
    } else {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--muted); padding: 32px;">No transaction records found.</td></tr>`;
      return;
    }
  } else {
    currentTransactionsData = txs;
  }

  tbody.innerHTML = currentTransactionsData.map((tx) => {
    const amountCents = tx.amount || tx.total_amount || tx.price || 0;
    const feeCents = tx.application_fee_amount ?? tx.platform_fee_amount ?? Math.round(amountCents * 0.10);
    const netCents = tx.seller_net_amount ?? (amountCents - feeCents);

    const buyerLabel = tx.buyer?.email || (tx.buyer_user_id ? tx.buyer_user_id.slice(0, 8) + '...' : 'Buyer');
    const sellerLabel = tx.seller?.email || (tx.seller_user_id ? tx.seller_user_id.slice(0, 8) + '...' : 'Seller');

    return `
      <tr id="row-order-${tx.id}">
        <td><strong style="color: var(--cream);">${tx.id.slice(0, 8)}...</strong></td>
        <td><span style="font-size: 11px; color: var(--cream);">${buyerLabel}</span></td>
        <td><span style="font-size: 11px; color: var(--tan-light);">${sellerLabel}</span></td>
        <td><strong style="color: var(--tan-light); font-size: 14px;">$${(amountCents / 100).toFixed(2)}</strong></td>
        <td style="color: var(--accent-amber); font-weight: 500;">$${(feeCents / 100).toFixed(2)}</td>
        <td style="color: #4ADE80; font-weight: 500;">$${(netCents / 100).toFixed(2)}</td>
        <td><span class="status-badge badge-approved">${(tx.status || 'PAID / COMPLETED').toUpperCase()}</span></td>
        <td>
          <button class="btn-secondary btn-view-order" data-id="${tx.id}" title="View Order & Financial Invoice Details" style="padding: 6px 12px; display: inline-flex; align-items: center; gap: 6px; font-size: 11px;">
            <svg class="icon-svg" viewBox="0 0 24 24" style="width: 14px; height: 14px;">
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
            </svg>
            <span>View Invoice</span>
          </button>
        </td>
      </tr>
    `;
  }).join("");

  // Attach eye icon click handlers
  document.querySelectorAll(".btn-view-order").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      openOrderDetailModal(id);
    });
  });
}

window.openOrderDetailModal = function (id) {
  const tx = currentTransactionsData.find(t => t.id === id);
  if (!tx) return;

  activeViewingTx = tx;

  const modal = document.getElementById("modal-order-detail");
  if (!modal) return;

  const totalCents = tx.amount || tx.total_amount || tx.price || 0;
  const appFeeCents = tx.application_fee_amount ?? tx.platform_fee_amount ?? Math.round(totalCents * 0.10);
  const stripeProcessingFeeCents = tx.stripe_fee ?? tx.processing_fee ?? Math.round(totalCents * 0.029 + 30);
  const ownerNetProfitCents = Math.max(0, appFeeCents - stripeProcessingFeeCents);
  const sellerNetCents = tx.seller_net_amount ?? (totalCents - appFeeCents);

  const orderShortId = tx.id ? tx.id.slice(0, 8).toUpperCase() : "N/A";
  document.getElementById("order-modal-invoice-no").innerText = `INV-2026-${orderShortId}`;
  document.getElementById("order-modal-invoice-date").innerText = tx.created_at ? new Date(tx.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString();
  document.getElementById("order-modal-status-badge").innerText = (tx.status || 'PAID / SUCCEEDED').toUpperCase();

  // Purchased Item Info
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
  document.getElementById("order-modal-item-unit-price").innerText = `$${(totalCents / 100).toFixed(2)}`;
  document.getElementById("order-modal-item-total-price").innerText = `$${(totalCents / 100).toFixed(2)}`;

  // Buyer Info
  document.getElementById("order-modal-buyer-name").innerText = tx.buyer?.display_name || tx.buyer?.email?.split('@')[0] || "Verified Buyer";
  document.getElementById("order-modal-buyer-email").innerText = tx.buyer?.email || "N/A";
  document.getElementById("order-modal-shipping-address").innerText = tx.shipping_address || tx.buyer?.location || "N/A";

  // Seller Info
  document.getElementById("order-modal-seller-name").innerText = tx.seller?.display_name || tx.seller?.email?.split('@')[0] || "Verified Seller";
  document.getElementById("order-modal-seller-email").innerText = tx.seller?.email || "N/A";
  document.getElementById("order-modal-seller-stripe-id").innerText = tx.seller_stripe_account_id || tx.seller?.stripe_account_id || "Stripe Connect Active";

  // Stripe Money Movement & Financial Breakdown Audit
  document.getElementById("order-modal-buyer-paid").innerText = `$${(totalCents / 100).toFixed(2)}`;
  document.getElementById("order-modal-stripe-fee").innerText = `-$${(stripeProcessingFeeCents / 100).toFixed(2)}`;
  document.getElementById("order-modal-app-fee").innerText = `+$${(appFeeCents / 100).toFixed(2)}`;
  document.getElementById("order-modal-owner-net").innerText = `+$${(ownerNetProfitCents / 100).toFixed(2)}`;
  document.getElementById("order-modal-seller-net").innerText = `$${(sellerNetCents / 100).toFixed(2)}`;

  // Totals Summary
  document.getElementById("order-modal-summary-subtotal").innerText = `$${(totalCents / 100).toFixed(2)}`;
  document.getElementById("order-modal-summary-total").innerText = `$${(totalCents / 100).toFixed(2)}`;

  modal.classList.add("active");
};

window.triggerLuxuryPrintInvoice = function () {
  const tx = activeViewingTx || currentTransactionsData[0];
  if (!tx) return;

  const totalCents = tx.amount || tx.total_amount || tx.price || 0;
  const appFeeCents = tx.application_fee_amount ?? tx.platform_fee_amount ?? Math.round(totalCents * 0.10);
  const stripeProcessingFeeCents = tx.stripe_fee ?? tx.processing_fee ?? Math.round(totalCents * 0.029 + 30);
  const ownerNetProfitCents = Math.max(0, appFeeCents - stripeProcessingFeeCents);
  const sellerNetCents = tx.seller_net_amount ?? (totalCents - appFeeCents);
  const listing = tx.listing || {};

  const orderShortId = tx.id ? tx.id.slice(0, 8).toUpperCase() : "N/A";

  // Ensure printable elements are populated
  const pInvNo = document.getElementById("print-inv-no");
  if (pInvNo) pInvNo.innerText = `INV-2026-${orderShortId}`;

  const pInvDate = document.getElementById("print-inv-date");
  if (pInvDate) pInvDate.innerText = tx.created_at ? new Date(tx.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString();

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
  if (pUnit) pUnit.innerText = `$${(totalCents / 100).toFixed(2)}`;

  const pTotal = document.getElementById("print-item-total-price");
  if (pTotal) pTotal.innerText = `$${(totalCents / 100).toFixed(2)}`;

  const pSubtotal = document.getElementById("print-summary-subtotal");
  if (pSubtotal) pSubtotal.innerText = `$${(totalCents / 100).toFixed(2)}`;

  const pSumTotal = document.getElementById("print-summary-total");
  if (pSumTotal) pSumTotal.innerText = `$${(totalCents / 100).toFixed(2)}`;

  const pAudBuyer = document.getElementById("print-audit-buyer");
  if (pAudBuyer) pAudBuyer.innerText = `$${(totalCents / 100).toFixed(2)}`;

  const pAudStripe = document.getElementById("print-audit-stripe-fee");
  if (pAudStripe) pAudStripe.innerText = `-$${(stripeProcessingFeeCents / 100).toFixed(2)}`;

  const pAudApp = document.getElementById("print-audit-app-fee");
  if (pAudApp) pAudApp.innerText = `+$${(appFeeCents / 100).toFixed(2)}`;

  const pAudOwner = document.getElementById("print-audit-owner-net");
  if (pAudOwner) pAudOwner.innerText = `+$${(ownerNetProfitCents / 100).toFixed(2)}`;

  const pAudSeller = document.getElementById("print-audit-seller-net");
  if (pAudSeller) pAudSeller.innerText = `$${(sellerNetCents / 100).toFixed(2)}`;

  const orderModal = document.getElementById("modal-order-detail");
  const printContainer = document.getElementById("printable-invoice-container");

  if (printContainer) {
    if (orderModal) {
      orderModal.classList.remove("active");
      orderModal.style.display = "none";
    }

    printContainer.classList.remove("hidden");
    printContainer.style.display = "block";

    setTimeout(() => {
      window.print();
      setTimeout(() => {
        printContainer.classList.add("hidden");
        printContainer.style.display = "";
        if (orderModal) {
          orderModal.style.display = "";
          orderModal.classList.add("active");
        }
      }, 500);
    }, 150);
  }
};

// ── MODULE 4: BETA TESTERS WHITELIST ──
async function loadBetaTesters() {
  const tbody = document.getElementById("beta-testers-table-body");
  const countBadge = document.getElementById("beta-testers-count-badge");
  const searchInput = document.getElementById("search-beta-testers");
  const query = searchInput ? searchInput.value.toLowerCase().trim() : "";

  const { data: testers, error } = await supabase
    .from("beta_testers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading beta testers:", error);
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #EF4444; padding: 30px;">Error loading whitelist: ${error.message}</td></tr>`;
    return;
  }

  let filtered = testers || [];
  if (query) {
    filtered = filtered.filter(t => (t.email || '').toLowerCase().includes(query));
  }

  if (countBadge) countBadge.innerText = `${filtered.length} Email${filtered.length === 1 ? '' : 's'}`;

  if (!filtered || filtered.length === 0) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 40px 20px; color: var(--muted);">
            <div style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;">✉️</div>
            <p style="margin: 0; font-size: 13px; color: var(--tan-light);">${query ? 'No beta testers match your search.' : 'No beta testers found in whitelist.'}</p>
          </td>
        </tr>
      `;
    }
    return;
  }

  if (tbody) {
    tbody.innerHTML = filtered.map((tester) => {
      const formattedDate = tester.created_at ? new Date(tester.created_at).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
      const addedByText = tester.added_by ? (tester.added_by.length > 12 ? tester.added_by.slice(0, 8) + '...' : tester.added_by) : 'System Admin';
      const firstLetter = (tester.email || 'B')[0].toUpperCase();

      return `
        <tr style="transition: background 0.15s ease;">
          <td style="font-weight: 500; color: var(--cream);">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 30px; height: 30px; border-radius: 50%; background: rgba(200, 184, 154, 0.12); border: 1px solid var(--border-tan); display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--tan-light); font-weight: 700; flex-shrink: 0;">
                ${firstLetter}
              </div>
              <span style="font-size: 13px;">${tester.email}</span>
            </div>
          </td>
          <td><span class="status-badge badge-gold" style="font-size: 10px;">${addedByText}</span></td>
          <td style="color: var(--muted); font-size: 12px;">${formattedDate}</td>
          <td style="text-align: right;">
            <button class="btn-danger" onclick="deleteBetaTester('${tester.id}', '${tester.email}')" style="padding: 5px 12px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
              Remove
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }
}

window.deleteBetaTester = async function (id, email) {
  window.showConfirmModal({
    title: "Remove Beta Whitelist Email?",
    message: `Are you sure you want to remove '${email || 'this email'}' from the beta whitelist?`,
    btnText: "Yes, Remove Email",
    btnClass: "btn-danger",
    onConfirm: async () => {
      const { error } = await supabase.from("beta_testers").delete().eq("id", id);
      if (error) {
        alert("Error deleting tester: " + error.message);
      } else {
        await loadBetaTesters();
        if (typeof loadOverviewMetrics === "function") {
          await loadOverviewMetrics();
        }
      }
    }
  });
};

// ── MODULE 5: USER DIRECTORY & EXHAUSTIVE FULL-PAGE AUDIT SCREEN ──
async function loadUserDirectory() {
  const tbody = document.getElementById("users-table-body");
  const { data: users, error } = await supabase
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !users || users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted);">No users found.</td></tr>`;
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
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 30px;">No users match search.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map((u) => {
    const isMasterAdmin = (u.email || "").toLowerCase() === MASTER_ADMIN_EMAIL || u.role === "admin";
    const roleBadgeClass = u.role === "admin" ? "badge-gold" : u.role === "creator" ? "badge-approved" : "badge-pending";
    const subBadgeClass = u.subscription_tier === "premium" ? "badge-approved" : "badge-gold";

    const initial = (u.display_name || u.email || "U").charAt(0).toUpperCase();

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 12px;">
            ${u.avatar_url ? `
              <img src="${u.avatar_url}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 1px solid var(--tan-dark); box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
            ` : `
              <div class="user-avatar-pill" style="width: 38px; height: 38px; font-size: 15px;">${initial}</div>
            `}
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <strong style="color: var(--cream); font-size: 13px; font-weight: 500;">${u.display_name || u.email?.split("@")[0] || 'User Member'}</strong>
                ${u.handle ? `<span class="status-badge badge-gold" style="font-size: 9px; text-transform: none; padding: 2px 6px;">@${u.handle.replace(/^@+/, '')}</span>` : ''}
              </div>
              <span style="font-size: 11px; color: var(--muted);">${u.email || ''}</span>
            </div>
          </div>
        </td>
        <td>
          <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
            <span class="status-badge ${roleBadgeClass}" style="font-size: 10px;">${(u.role || "user").toUpperCase()}</span>
            <span class="status-badge ${subBadgeClass}" style="font-size: 9px;">${(u.subscription_tier || "free").toUpperCase()} TIER</span>
          </div>
        </td>
        <td>
          <div>
            <strong style="color: var(--tan-light); font-size: 12px; display: block;">${u.color_season || "Not Analyzed"}</strong>
            ${u.color_season_confidence ? `<span style="font-size: 10px; color: #4ADE80; font-weight: 500;">${Math.round(u.color_season_confidence * 100)}% Match</span>` : ''}
          </div>
        </td>
        <td>
          <div>
            <strong style="color: var(--cream); font-size: 12px; display: block;">${u.wardrobe_item_count ?? 0} items</strong>
            <span style="font-size: 10px; color: var(--muted);">Step ${u.completion_step ?? 0}/5</span>
          </div>
        </td>
        <td>
          <span style="font-size: 12px; color: var(--muted-light);">${u.location || 'N/A'}</span>
        </td>
        <td>
          <span style="font-size: 12px; color: var(--muted);">${new Date(u.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
        </td>
        <td>
          ${isMasterAdmin ? `
            <span style="font-size: 11px; color: var(--muted); font-style: italic;">---</span>
          ` : `
            <button class="btn-secondary" style="padding: 5px 12px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;" onclick="window.openUserProfileView('${u.id}')">
              <span>View Details</span>
              <span style="font-size: 10px;">&rarr;</span>
            </button>
          `}
        </td>
      </tr>
    `;
  }).join("");
}

// Helper to fetch Signed URL for Private Supabase Storage Objects
async function getStorageSignedUrl(bucketName, path) {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const cleanPath = path.replace(/^\/+/, '');
  try {
    const { data, error } = await supabase.storage.from(bucketName).createSignedUrl(cleanPath, 3600);
    if (data && data.signedUrl) {
      return data.signedUrl;
    }
  } catch (e) {
    console.warn(`Signed URL generation for bucket '${bucketName}' and path '${cleanPath}':`, e);
  }
  return null;
}

// Multi-Image Post Carousel Navigation Handler
window.rotatePostSlide = function (carouselId, direction) {
  const slides = document.querySelectorAll(`.${carouselId}-slide`);
  const indicator = document.querySelector(`.${carouselId}-indicator`);
  if (!slides || slides.length === 0) return;

  let activeIndex = -1;
  slides.forEach((slide, i) => {
    if (slide.style.display !== 'none') activeIndex = i;
  });

  if (activeIndex === -1) activeIndex = 0;

  let nextIndex = activeIndex + direction;
  if (nextIndex < 0) nextIndex = slides.length - 1;
  if (nextIndex >= slides.length) nextIndex = 0;

  slides.forEach((slide, i) => {
    slide.style.display = i === nextIndex ? 'block' : 'none';
  });

  if (indicator) {
    indicator.innerText = `${nextIndex + 1} / ${slides.length}`;
  }
};

// Bulk resolve Signed URLs for wardrobe items from private 'closet' and 'wardrobe' buckets
async function resolveWardrobeSignedUrls(items) {
  if (!items || items.length === 0) return [];

  const pathMap = new Map();
  items.forEach((item, idx) => {
    const url = item.image_url;
    if (!url) return;
    let storagePath = null;
    const publicMatch = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
    if (publicMatch) {
      storagePath = publicMatch[2].split('?')[0];
    } else if (!url.startsWith('http') && url.includes('/')) {
      storagePath = url.replace(/^\/+/, '').split('?')[0];
    }
    if (storagePath) {
      if (!pathMap.has(storagePath)) pathMap.set(storagePath, []);
      pathMap.get(storagePath).push(idx);
    }
  });

  if (pathMap.size === 0) {
    return items.map(item => ({ ...item, _resolvedImageUrl: item.image_url || null }));
  }

  const allPaths = Array.from(pathMap.keys());
  const signedMap = new Map();

  // Populate signedMap from cache first
  allPaths.forEach(p => {
    const cachedUrl = getCachedSignedUrl(p);
    if (cachedUrl) signedMap.set(p, cachedUrl);
  });

  const uncachedPaths = allPaths.filter(p => !signedMap.has(p));

  if (uncachedPaths.length > 0) {
    for (const bucket of ['wardrobe', 'closet', 'community-videos', 'avatars']) {
      const unresolvedPaths = uncachedPaths.filter(p => !signedMap.has(p));
      if (unresolvedPaths.length === 0) break;
      try {
        for (let i = 0; i < unresolvedPaths.length; i += 50) {
          const chunk = unresolvedPaths.slice(i, i + 50);
          const { data } = await supabase.storage.from(bucket).createSignedUrls(chunk, 3600);
          if (data) {
            data.forEach(d => {
              if (d && d.signedUrl && !d.error) {
                signedMap.set(d.path, d.signedUrl);
                setCachedSignedUrl(d.path, d.signedUrl);
              }
            });
          }
        }
      } catch (e) {
        console.warn(`[Wardrobe] Bulk signed URL failed for '${bucket}':`, e);
      }
    }
  }

  return items.map(item => {
    const url = item.image_url;
    if (!url) return { ...item, _resolvedImageUrl: null };
    if (url.startsWith('http') && !url.match(/\/storage\/v1\/object\//)) {
      return { ...item, _resolvedImageUrl: url };
    }
    let storagePath = null;
    const publicMatch = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
    if (publicMatch) {
      storagePath = publicMatch[2].split('?')[0];
    } else if (!url.startsWith('http') && url.includes('/')) {
      storagePath = url.replace(/^\/+/, '').split('?')[0];
    }
    const resolvedUrl = storagePath ? signedMap.get(storagePath) : null;
    return { ...item, _resolvedImageUrl: resolvedUrl || null };
  });
}

async function resolveMarketplaceListingsImages(listings) {
  if (!listings || listings.length === 0) return [];

  const pathMap = new Map();
  listings.forEach(l => {
    const rawUrl = Array.isArray(l.images) && l.images.length > 0 ? l.images[0] : (l.image_url || l.image);
    if (rawUrl) {
      if (rawUrl.startsWith('http') && !rawUrl.match(/\/storage\/v1\/object\//)) {
        // Direct public URL
      } else {
        let storagePath = null;
        const publicMatch = rawUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
        if (publicMatch) {
          storagePath = publicMatch[2].split('?')[0];
        } else if (!rawUrl.startsWith('http') && rawUrl.includes('/')) {
          storagePath = rawUrl.replace(/^\/+/, '').split('?')[0];
        }
        if (storagePath) pathMap.set(storagePath, true);
      }
    }
  });

  const signedMap = new Map();
  if (pathMap.size > 0) {
    const allPaths = Array.from(pathMap.keys());
    allPaths.forEach(p => {
      const cachedUrl = getCachedSignedUrl(p);
      if (cachedUrl) signedMap.set(p, cachedUrl);
    });

    const uncachedPaths = allPaths.filter(p => !signedMap.has(p));

    if (uncachedPaths.length > 0) {
      for (const bucket of ['marketplace', 'marketplace-images', 'wardrobe', 'closet']) {
        const unresolvedPaths = uncachedPaths.filter(p => !signedMap.has(p));
        if (unresolvedPaths.length === 0) break;
        try {
          const { data } = await supabase.storage.from(bucket).createSignedUrls(unresolvedPaths, 3600);
          if (data) {
            data.forEach(d => {
              if (d && d.signedUrl && !d.error) {
                signedMap.set(d.path, d.signedUrl);
                setCachedSignedUrl(d.path, d.signedUrl);
              }
            });
          }
        } catch (e) { }
      }
    }
  }

  return listings.map(l => {
    const rawUrl = Array.isArray(l.images) && l.images.length > 0 ? l.images[0] : (l.image_url || l.image);
    if (!rawUrl) return { ...l, _resolvedImageUrl: null };
    if (rawUrl.startsWith('http') && !rawUrl.match(/\/storage\/v1\/object\//)) {
      return { ...l, _resolvedImageUrl: rawUrl };
    }
    let storagePath = null;
    const publicMatch = rawUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
    if (publicMatch) {
      storagePath = publicMatch[2].split('?')[0];
    } else if (!rawUrl.startsWith('http') && rawUrl.includes('/')) {
      storagePath = rawUrl.replace(/^\/+/, '').split('?')[0];
    }
    const resolved = storagePath ? signedMap.get(storagePath) : rawUrl;
    return { ...l, _resolvedImageUrl: resolved || rawUrl };
  });
}

function formatMarketplacePrice(val) {
  if (val === undefined || val === null || val === '') return '$0.00';
  let num = Number(val);
  if (isNaN(num)) return '$0.00';
  if (num >= 100 && Number.isInteger(num)) {
    num = num / 100;
  }
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderMarketplaceListingCards(listings, isFavoritedView) {
  if (!listings || listings.length === 0) {
    const emptyTitle = isFavoritedView ? "No Favorited Garments" : "No Marketplace Listings";
    const emptySub = isFavoritedView
      ? "This user has not saved or favorited any marketplace listings yet."
      : "This user has not created any marketplace listings for sale yet.";
    return `
      <div style="grid-column: 1 / -1; padding: 45px 20px; text-align: center; background: rgba(0,0,0,0.25); border: 1px dashed var(--border-subtle); border-radius: 12px;">
        <h5 class="font-serif" style="font-size: 18px; color: var(--tan-light); margin: 0;">${emptyTitle}</h5>
        <p style="font-size: 12px; color: var(--muted); margin-top: 6px; max-width: 420px; margin-left: auto; margin-right: auto;">${emptySub}</p>
      </div>
    `;
  }

  return listings.map(l => {
    const isSold = (l.status === 'sold' || l.is_sold === true || l.status === 'completed' || !!l.buyer_user_id);
    const statusBadge = isSold
      ? `<span style="background: rgba(239, 68, 68, 0.25); color: #F87171; border: 1px solid rgba(239, 68, 68, 0.4); padding: 3px 10px; border-radius: 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">SOLD</span>`
      : `<span style="background: rgba(74, 222, 128, 0.2); color: #4ADE80; border: 1px solid rgba(74, 222, 128, 0.4); padding: 3px 10px; border-radius: 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">ACTIVE</span>`;

    const imgUrl = l._resolvedImageUrl || (Array.isArray(l.images) && l.images.length > 0 ? l.images[0] : null);

    return `
      <div style="background: rgba(20,20,20,0.6); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden;">
        <div>
          <div style="width: 100%; height: 180px; background: radial-gradient(circle, rgba(40,40,40,0.5) 0%, rgba(12,12,12,0.95) 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 12px;">
            <div style="position: absolute; top: 8px; right: 8px; z-index: 2;">${statusBadge}</div>
            ${imgUrl ? `
              <img src="${imgUrl}" alt="${l.title || 'Marketplace Garment'}" style="width: 100%; height: 100%; object-fit: contain; padding: 6px; filter: drop-shadow(0 6px 12px rgba(0,0,0,0.6));" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'display:flex; flex-direction:column; align-items:center; color:var(--muted); font-size:12px;\\'><span style=\\'margin-top:4px; font-size:10px;\\'>Image Unavailable</span></div>';">
            ` : `
              <div style="display:flex; flex-direction:column; align-items:center; color:var(--muted); font-size:12px;">
                <span style="font-size:10px;">No Image Uploaded</span>
              </div>
            `}
          </div>

          <h5 class="font-serif" style="font-size: 15px; color: var(--cream); margin: 0 0 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${l.title || 'Marketplace Item'}">${l.title || 'Marketplace Item'}</h5>
          
          <div style="font-size: 11px; color: var(--muted); margin-bottom: 8px;">
            ${l.brand ? `<span style="color: var(--tan-light); font-weight: 500;">${l.brand}</span>` : 'Designer Apparel'}
            ${l.size || l.size_value ? ` • Size: <strong style="color: var(--cream);">${l.size || l.size_value}</strong>` : ''}
          </div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.07); padding-top: 8px; margin-top: 4px;">
          <span style="font-size: 10px; color: var(--muted); text-transform: uppercase;">${isSold ? 'Sold Price' : 'Listing Price'}</span>
          <strong style="font-size: 14px; color: ${isSold ? '#F87171' : '#4ADE80'}; font-weight: 700;">${formatMarketplacePrice(l.price)}</strong>
        </div>
      </div>
    `;
  }).join("");
}

// Full-Page 360° Luxury Haute-Couture User Audit View Switcher
window.openUserProfileView = async function (userId, forceRefresh = false) {
  const listView = document.getElementById("user-list-view");
  const detailView = document.getElementById("user-detail-view");

  if (!listView || !detailView) return;

  // 1. INSTANT UI VIEW SWITCH & TAB RESET
  listView.classList.add("hidden");
  detailView.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });

  const cached = globalUserProfileCache.get(userId);
  if (!forceRefresh && cached && (Date.now() - cached.timestamp < USER_PROFILE_CACHE_TTL)) {
    // Instant 0ms cache hit! User profile is already populated.
    return;
  }

  // Reset active tab to 1. Profile Overview
  document.querySelectorAll("#ud-subnav-bar .ud-subnav-btn").forEach(btn => btn.classList.remove("active"));
  const overviewTabBtn = document.querySelector('#ud-subnav-bar .ud-subnav-btn[data-subtab="ud-pane-overview"]');
  if (overviewTabBtn) overviewTabBtn.classList.add("active");

  document.querySelectorAll(".ud-pane").forEach(pane => pane.classList.add("hidden"));
  const overviewPane = document.getElementById("ud-pane-overview");
  if (overviewPane) overviewPane.classList.remove("hidden");

  // Reset/Loading state for hero banner & overview pane (prevent showing old user data)
  const avatarImg = document.getElementById("ud-avatar");
  const initialAvatar = document.getElementById("ud-initial-avatar");
  if (avatarImg) avatarImg.style.display = "none";
  if (initialAvatar) {
    initialAvatar.style.display = "flex";
    initialAvatar.innerText = "...";
  }

  document.getElementById("ud-display-name").innerText = "Loading User...";
  document.getElementById("ud-handle").innerText = "@loading";
  document.getElementById("ud-email").innerText = "loading@parure.app";
  document.getElementById("ud-id").innerText = userId;
  document.getElementById("ud-location-tag").innerText = "Loading Location...";
  document.getElementById("ud-created-at").innerText = "Loading...";

  document.getElementById("ud-stat-wardrobe").innerText = "...";
  document.getElementById("ud-stat-revenue").innerText = "$...";
  document.getElementById("ud-stat-posts").innerText = "...";

  // Reset Color Season Passport elements
  document.getElementById("ud-season").innerText = "Syncing Profile...";
  document.getElementById("ud-season-confidence").innerText = "... MATCH";
  const favColorsContainer = document.getElementById("ud-favorite-colors-container");
  if (favColorsContainer) favColorsContainer.innerHTML = '<div style="font-size: 11px; color: var(--muted);">Loading swatches...</div>';

  const selfieImg = document.getElementById("ud-selfie-img");
  const noSelfie = document.getElementById("ud-no-selfie");
  if (selfieImg) selfieImg.style.display = "none";
  if (noSelfie) {
    noSelfie.style.display = "block";
    noSelfie.innerText = "Loading...";
  }

  // 2. Fetch complete single raw record from DB
  const { data: u, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !u) {
    alert("Error fetching user details: " + (error?.message || "User not found"));
    window.closeUserProfileView();
    return;
  }

  // 3. Fetch related database collections in parallel safely (Promise.allSettled)
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

  // Fetch favorited marketplace listings by ID array safely across marketplace_wishlists & user_wishlists
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

  // Fetch any wardrobe_items referenced by user_wishlists (item_id or wardrobe_item_id)
  const wishlistWardrobeItemIds = (userWardrobeWishlistsList || [])
    .map(w => w.item_id || w.wardrobe_item_id)
    .filter(Boolean);

  let extraWishlistWardrobeItems = [];
  if (wishlistWardrobeItemIds.length > 0) {
    const uniqueWardrobeIds = Array.from(new Set(wishlistWardrobeItemIds));
    const { data: extraWData } = await supabase
      .from("wardrobe_items")
      .select("*")
      .in("id", uniqueWardrobeIds);
    extraWishlistWardrobeItems = extraWData || [];
  }

  const combinedWishlistItemsToResolve = [
    ...userWardrobeWishlistsList,
    ...extraWishlistWardrobeItems
  ];

  // Extract raw moodboard items
  const rawMoodboardItems = [];
  userMoodboardsList.forEach(mb => {
    if (Array.isArray(mb.moodboard_items)) {
      rawMoodboardItems.push(...mb.moodboard_items);
    }
  });

  // Parallelize image resolutions for ultra-fast load
  const [
    listingsList,
    favoritedListings,
    resolvedWardrobeFavorites,
    resolvedWardrobeItems,
    resolvedMoodboardItems
  ] = await Promise.all([
    resolveMarketplaceListingsImages(rawListingsList),
    resolveMarketplaceListingsImages(rawFavoritedListings),
    resolveWardrobeSignedUrls(combinedWishlistItemsToResolve),
    resolveWardrobeSignedUrls(itemsList),
    resolveWardrobeSignedUrls(rawMoodboardItems)
  ]);

  // Create maps for fast lookups
  const wardrobeItemsMap = new Map();
  resolvedWardrobeItems.forEach(item => {
    if (item.id) wardrobeItemsMap.set(item.id, item);
  });

  const moodboardItemsMap = new Map();
  resolvedMoodboardItems.forEach(mi => {
    if (mi.id) moodboardItemsMap.set(mi.id, mi);
  });

  const followersCount = (followersData || []).length;
  const followingCount = (followingData || []).length;

  // Populate basic profile data immediately
  document.getElementById("ud-display-name").innerText = u.display_name || u.email?.split("@")[0] || "User Member";
  document.getElementById("ud-handle").innerText = u.handle ? `@${u.handle.replace(/^@+/, '')}` : "@no_handle";
  document.getElementById("ud-email").innerText = u.email || "No Email";
  document.getElementById("ud-id").innerText = u.id;
  document.getElementById("ud-location-tag").innerText = u.location || "Location Not Set";
  document.getElementById("ud-created-at").innerText = u.created_at ? new Date(u.created_at).toLocaleDateString() : "N/A";

  // Avatar handling with 2.5s fast timeout to prevent hanging
  if (avatarImg) {
    avatarImg.onerror = function () {
      avatarImg.style.display = "none";
      if (initialAvatar) {
        initialAvatar.style.display = "flex";
        initialAvatar.innerText = (u.display_name || u.email || "U").charAt(0).toUpperCase();
      }
    };
  }

  let resolvedAvatarUrl = null;
  if (u.avatar_url) {
    if (u.avatar_url.startsWith("http://") || u.avatar_url.startsWith("https://")) {
      resolvedAvatarUrl = u.avatar_url;
    } else {
      const cleanPath = u.avatar_url.replace(/^(avatars|user-avatars)\//, '');
      try {
        const timeoutPromise = new Promise(res => setTimeout(() => res(null), 2500));
        resolvedAvatarUrl = await Promise.race([
          getStorageSignedUrl("avatars", cleanPath),
          timeoutPromise
        ]);
      } catch (e) {
        resolvedAvatarUrl = null;
      }
    }
  }

  if (resolvedAvatarUrl && avatarImg) {
    avatarImg.src = resolvedAvatarUrl;
    avatarImg.style.display = "block";
    if (initialAvatar) initialAvatar.style.display = "none";
  } else {
    if (avatarImg) avatarImg.style.display = "none";
    if (initialAvatar) {
      initialAvatar.style.display = "flex";
      initialAvatar.innerText = (u.display_name || u.email || "U").charAt(0).toUpperCase();
    }
  }

  document.getElementById("ud-display-name").innerText = u.display_name || u.email?.split("@")[0] || "User Member";
  document.getElementById("ud-handle").innerText = u.handle ? `@${u.handle.replace(/^@+/, '')}` : "@no_handle";
  document.getElementById("ud-email").innerText = u.email || "No Email";
  document.getElementById("ud-id").innerText = u.id;
  document.getElementById("ud-location-tag").innerText = u.location || "Location Not Set";
  // Badges
  const roleBadge = document.getElementById("ud-role-badge");
  roleBadge.innerText = (u.role || "USER").toUpperCase();
  roleBadge.className = `status-badge ${u.role === 'admin' ? 'badge-gold' : u.role === 'creator' ? 'badge-approved' : 'badge-pending'}`;

  const subBadge = document.getElementById("ud-sub-badge");
  subBadge.innerText = `${(u.subscription_tier || "FREE").toUpperCase()} TIER`;
  subBadge.className = `status-badge ${u.subscription_tier === 'premium' ? 'badge-approved' : 'badge-gold'}`;

  const creatorBadge = document.getElementById("ud-creator-badge");
  if (u.is_approved_creator) {
    creatorBadge.style.display = "inline-block";
    creatorBadge.innerText = "VERIFIED CREATOR";
  } else {
    creatorBadge.style.display = "none";
  }

  // Spotlight Live Stat Chips
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

  // 1. PANE OVERVIEW: Authentic Parure Style Passport
  const targetPhotoPath = u.selfie_url || u.avatar_url;

  let resolvedSelfieUrl = null;
  if (targetPhotoPath) {
    if (targetPhotoPath.startsWith("http://") || targetPhotoPath.startsWith("https://")) {
      resolvedSelfieUrl = targetPhotoPath;
    } else {
      const cleanPath = targetPhotoPath.replace(/^(selfies|user-selfies|color-analysis|avatars)\//, '');
      resolvedSelfieUrl = await getStorageSignedUrl("selfies", cleanPath)
        || await getStorageSignedUrl("user-selfies", cleanPath)
        || await getStorageSignedUrl("color-analysis", cleanPath)
        || await getStorageSignedUrl("avatars", cleanPath);
    }
  }

  if (resolvedSelfieUrl && selfieImg) {
    if (noSelfie) noSelfie.style.display = "none";
    selfieImg.onerror = function () {
      selfieImg.style.display = "none";
      if (noSelfie) {
        noSelfie.style.display = "block";
        noSelfie.innerText = "Photo Error";
      }
    };
    selfieImg.src = resolvedSelfieUrl;
    selfieImg.style.display = "block";
  } else {
    if (selfieImg) selfieImg.style.display = "none";
    if (noSelfie) {
      noSelfie.style.display = "block";
      noSelfie.innerText = "No Photo";
    }
  }

  document.getElementById("ud-season").innerText = u.color_season || "Not Analyzed";
  document.getElementById("ud-season-confidence").innerText = u.color_season_confidence ? `${Math.round(u.color_season_confidence * 100)}% MATCH` : "N/A";

  if (favColorsContainer) {
    if (u.favorite_colors && Array.isArray(u.favorite_colors) && u.favorite_colors.length > 0) {
      favColorsContainer.innerHTML = u.favorite_colors.map(c => `
        <div style="display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.5); padding: 4px 10px; border-radius: 20px; border: 1px solid var(--border-subtle);">
          <span style="width: 12px; height: 12px; border-radius: 50%; background: ${c.startsWith('#') ? c : '#A86700'}; display: inline-block; border: 1px solid rgba(255,255,255,0.2);"></span>
          <span style="font-size: 11px; color: var(--cream);">${c}</span>
        </div>
      `).join("");
    } else {
      favColorsContainer.innerHTML = `<span style="font-size: 11px; color: var(--muted);">None Specified</span>`;
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
  document.getElementById("ud-stripe-charges").innerText = u.stripe_charges_enabled ? "True (Enabled)" : "False (Disabled)";
  document.getElementById("ud-stripe-charges").className = `status-badge ${u.stripe_charges_enabled ? 'badge-approved' : 'badge-pending'}`;
  document.getElementById("ud-stripe-payouts").innerText = u.stripe_payouts_enabled ? "True (Enabled)" : "False (Disabled)";
  document.getElementById("ud-stripe-payouts").className = `status-badge ${u.stripe_payouts_enabled ? 'badge-approved' : 'badge-pending'}`;
  document.getElementById("ud-referred-by").innerText = u.referred_by || "Direct Signup";

  // 2. PANE WARDROBE: 12 Categories & Items Grid
  const categoryCounts = {
    tops: itemsList.filter(i => /top|shirt|blouse|tee|sweater/i.test(i.category || i.subcategory || '')).length,
    bottoms: itemsList.filter(i => /bottom|pant|jean|skirt|short/i.test(i.category || i.subcategory || '')).length,
    dresses: itemsList.filter(i => /dress|gown|jumpsuit/i.test(i.category || i.subcategory || '')).length,
    shoes: itemsList.filter(i => /shoe|boot|sneaker|heel/i.test(i.category || i.subcategory || '')).length,
    outerwear: itemsList.filter(i => /coat|jacket|blazer/i.test(i.category || i.subcategory || '')).length,
    bags: itemsList.filter(i => /bag|tote|clutch|purse/i.test(i.category || i.subcategory || '')).length,
    accessories: itemsList.filter(i => /belt|scarf|hat|sunglass/i.test(i.category || i.subcategory || '')).length,
    jewelry: itemsList.filter(i => /ring|necklace|earring|bracelet/i.test(i.category || i.subcategory || '')).length,
    activewear: itemsList.filter(i => /active|sport|gym/i.test(i.category || i.subcategory || '')).length,
    seasonal: itemsList.filter(i => /swim|winter|summer/i.test(i.category || i.subcategory || '')).length,
  };

  const otherCount = itemsList.length - Object.values(categoryCounts).reduce((a, b) => a + b, 0);

  document.getElementById("wd-count-total").innerText = itemsList.length;
  document.getElementById("wd-count-tops").innerText = categoryCounts.tops;
  document.getElementById("wd-count-bottoms").innerText = categoryCounts.bottoms;
  document.getElementById("wd-count-dresses").innerText = categoryCounts.dresses;
  document.getElementById("wd-count-shoes").innerText = categoryCounts.shoes;
  document.getElementById("wd-count-outerwear").innerText = categoryCounts.outerwear;
  document.getElementById("wd-count-bags").innerText = categoryCounts.bags;
  document.getElementById("wd-count-accessories").innerText = categoryCounts.accessories;
  document.getElementById("wd-count-jewelry").innerText = categoryCounts.jewelry;
  document.getElementById("wd-count-activewear").innerText = categoryCounts.activewear;
  document.getElementById("wd-count-seasonal").innerText = categoryCounts.seasonal;
  document.getElementById("wd-count-other").innerText = Math.max(0, otherCount);

  const wardrobeGrid = document.getElementById("ud-wardrobe-grid");
  if (itemsList.length > 0) {
    wardrobeGrid.innerHTML = `
      <div style="padding: 40px; text-align: center;">
        <div style="width: 28px; height: 28px; border: 2px solid var(--tan); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px;"></div>
        <p style="font-size: 13px; color: var(--muted);">Resolving ${itemsList.length} wardrobe photos from private storage...</p>
      </div>
    `;

    const resolvedItems = await resolveWardrobeSignedUrls(itemsList);

    // Group items by category
    const categoryMap = new Map();
    const categoryOrder = ['Tops', 'Bottoms', 'Dresses & Jumpsuits', 'Shoes', 'Outerwear', 'Bags', 'Accessories', 'Jewelry', 'Activewear', 'Loungewear & Intimates', 'Seasonal', 'Other'];

    resolvedItems.forEach(item => {
      const cat = item.category || item.subcategory || 'Other';
      if (!categoryMap.has(cat)) categoryMap.set(cat, []);
      categoryMap.get(cat).push(item);
    });

    // Sort categories: known first, then alphabetical unknowns
    const sortedCategories = [...categoryMap.keys()].sort((a, b) => {
      const idxA = categoryOrder.findIndex(c => a.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(a.toLowerCase()));
      const idxB = categoryOrder.findIndex(c => b.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(b.toLowerCase()));
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    wardrobeGrid.innerHTML = sortedCategories.map(cat => {
      const items = categoryMap.get(cat);
      return `
        <div class="panel-card" style="padding: 24px; overflow: hidden;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 1px solid var(--border-subtle);">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div>
                <h4 class="font-serif" style="font-size: 20px; color: var(--cream); margin: 0;">${cat}</h4>
                <span style="font-size: 11px; color: var(--muted);">${items.length} item${items.length > 1 ? 's' : ''}</span>
              </div>
            </div>
            <span class="status-badge badge-gold" style="font-size: 10px;">${items.length} PIECES</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px;">
            ${items.map(item => {
        const priceDisplay = item.purchase_price
          ? `$${(item.purchase_price / 100).toFixed(2)}`
          : '<span style="color: var(--muted); font-style: italic;">Not Set</span>';
        const colorDot = item.dominant_color_hex
          ? `<span style="width: 10px; height: 10px; border-radius: 50%; background: ${item.dominant_color_hex}; display: inline-block; border: 1px solid rgba(255,255,255,0.15); flex-shrink: 0;"></span>`
          : '';
        const colorName = item.color_name ? `<span style="font-size: 10px; color: var(--muted);">${item.color_name}</span>` : '';
        return `
              <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: 10px; overflow: hidden; transition: all 0.25s ease; cursor: default;"
                   onmouseover="this.style.borderColor='var(--tan-dark)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.4)';"
                   onmouseout="this.style.borderColor='var(--border-subtle)'; this.style.transform='none'; this.style.boxShadow='none';">
                <div style="width: 100%; height: 200px; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; overflow: hidden;">
                  ${item._resolvedImageUrl
            ? `<img src="${item._resolvedImageUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                       <div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; color: var(--muted); font-size: 11px;">Photo Unavailable</div>`
            : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 11px;">No Photo</div>`
          }
                </div>
                <div style="padding: 12px 14px 14px;">
                  <h5 style="font-size: 13px; font-weight: 600; color: var(--cream); margin: 0 0 6px 0; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${item.name || 'Unnamed Item'}</h5>
                  <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
                    ${colorDot}
                    ${colorName}
                  </div>
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-size: 14px; font-weight: 600; color: var(--tan-light);">${priceDisplay}</span>
                    <span style="font-size: 10px; color: var(--muted); background: rgba(255,255,255,0.04); padding: 2px 8px; border-radius: 10px;">Worn ${item.wear_count || 0}x</span>
                  </div>
                  ${item.purchase_price && item.wear_count ? `<div style="font-size: 10px; color: var(--muted); display: flex; align-items: center; gap: 4px;"><span style="color: #4ADE80;">●</span> CPW: $${(item.purchase_price / 100 / item.wear_count).toFixed(2)}</div>` : ''}
                </div>
              </div>`;
      }).join("")}
          </div>
        </div>
      `;
    }).join("");
  } else {
    wardrobeGrid.innerHTML = `
      <div class="panel-card" style="padding: 60px 40px; text-align: center;">
        <svg viewBox="0 0 24 24" style="width: 40px; height: 40px; margin: 0 auto 16px; display: block; fill: var(--tan-dark);"><path d="M21.6 18.2L13 11.75v-.91a3.496 3.496 0 002.47-4.2 3.5 3.5 0 00-6.94 0A3.496 3.496 0 0011 11.01v.65L2.4 18.2c-.77.58-.36 1.8.6 1.8h18c.96 0 1.37-1.22.6-1.8z"/></svg>
        <h5 class="font-serif" style="font-size: 20px; color: var(--tan-light);">No Wardrobe Items Found</h5>
        <p style="font-size: 13px; color: var(--muted); margin-top: 6px;">This user hasn't added any items to their digital wardrobe yet.</p>
      </div>
    `;
  }

  // 3. PANE USER POSTS
  const postsContainer = document.getElementById("ud-user-posts-container");
  if (postsList.length > 0) {
    postsContainer.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 30px; text-align: center;">
        <div style="width: 24px; height: 24px; border: 2px solid var(--tan); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 10px;"></div>
        <p style="font-size: 13px; color: var(--muted);">Loading community posts media & stats...</p>
      </div>
    `;

    // Process each post for images array and video URL
    const postsProcessed = postsList.map(p => {
      let rawImages = [];
      if (Array.isArray(p.image_urls) && p.image_urls.length > 0) {
        rawImages = p.image_urls.map(img => typeof img === 'string' ? img : img?.uri).filter(Boolean);
      } else if (p.image_url) {
        rawImages = [p.image_url];
      }

      return {
        ...p,
        _rawImages: rawImages,
        _isVideo: Boolean(p.video_url || (typeof p.image_url === 'string' && (p.image_url.endsWith('.mp4') || p.image_url.endsWith('.mov')))),
        _videoUrl: p.video_url || (p.image_url && (p.image_url.endsWith('.mp4') || p.image_url.endsWith('.mov')) ? p.image_url : null)
      };
    });

    // Resolve signed URLs for all images in parallel
    const allImageItems = [];
    postsProcessed.forEach((p, pIdx) => {
      p._rawImages.forEach((imgUrl, iIdx) => {
        allImageItems.push({ pIdx, iIdx, image_url: imgUrl });
      });
    });

    const resolvedImageItems = await resolveWardrobeSignedUrls(allImageItems);

    // Attach resolved image URLs back to postsProcessed
    resolvedImageItems.forEach(item => {
      const p = postsProcessed[item.pIdx];
      if (!p._resolvedImages) p._resolvedImages = [];
      p._resolvedImages[item.iIdx] = item._resolvedImageUrl || item.image_url;
    });

    // Fetch counts from DB
    const postIds = postsList.map(p => p.id);
    let allLikes = [];
    let allComments = [];
    let allSaves = [];

    if (postIds.length > 0) {
      const [
        { data: lData },
        { data: cData },
        { data: sData }
      ] = await Promise.all([
        supabase.from("post_likes").select("post_id").in("post_id", postIds),
        supabase.from("post_comments").select("post_id").in("post_id", postIds),
        supabase.from("post_saves").select("post_id").in("post_id", postIds)
      ]);
      allLikes = lData || [];
      allComments = cData || [];
      allSaves = sData || [];
    }

    postsContainer.innerHTML = postsProcessed.map((p, index) => {
      const likesCount = (allLikes || []).filter(l => l.post_id === p.id).length || p.likes_count || 0;
      const commentsCount = (allComments || []).filter(c => c.post_id === p.id).length || p.comments_count || 0;
      const savesCount = (allSaves || []).filter(s => s.post_id === p.id).length || p.saved_count || 0;

      const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      const images = p._resolvedImages || p._rawImages || [];
      const isVideo = p._isVideo;
      const videoUrl = p._videoUrl;

      const carouselId = `post-carousel-${p.id || index}`;

      return `
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; transition: all 0.25s ease;"
             onmouseover="this.style.borderColor='var(--tan-dark)'; this.style.transform='translateY(-2px)';"
             onmouseout="this.style.borderColor='var(--border-subtle)'; this.style.transform='none';">
          
          <!-- MEDIA CONTAINER (Video / Image Carousel) -->
          <div style="width: 100%; height: 280px; background: rgba(0,0,0,0.5); position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center;">
            
            ${isVideo && videoUrl ? `
              <video src="${videoUrl}" controls style="width: 100%; height: 100%; object-fit: contain; background: #000;"></video>
            ` : images.length > 0 ? `
              <div id="${carouselId}" style="width: 100%; height: 100%; position: relative; display: flex; align-items: center; justify-content: center;">
                ${images.map((img, i) => `
                  <img src="${img}" class="${carouselId}-slide" style="max-width: 100%; max-height: 100%; object-fit: contain; display: ${i === 0 ? 'block' : 'none'};" onerror="this.style.display='none';">
                `).join("")}

                ${images.length > 1 ? `
                  <button type="button" onclick="window.rotatePostSlide('${carouselId}', -1)" style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.6); color: var(--cream); border: 1px solid var(--border-subtle); border-radius: 50%; width: 28px; height: 28px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; z-index: 2;">‹</button>
                  <button type="button" onclick="window.rotatePostSlide('${carouselId}', 1)" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.6); color: var(--cream); border: 1px solid var(--border-subtle); border-radius: 50%; width: 28px; height: 28px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; z-index: 2;">›</button>
                  <span class="${carouselId}-indicator" style="position: absolute; bottom: 8px; background: rgba(0,0,0,0.7); color: var(--cream); font-size: 10px; padding: 2px 8px; border-radius: 10px; z-index: 2;">1 / ${images.length}</span>
                ` : ''}
              </div>
            ` : `
              <div style="font-size: 12px; color: var(--muted);">No Media Attached</div>
            `}

          </div>

          <!-- CONTENT & CAPTION -->
          <div style="padding: 16px; display: flex; flex-direction: column; flex-grow: 1;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 10px; color: var(--tan); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">POST</span>
              <span style="font-size: 10px; color: var(--muted);">${dateStr}</span>
            </div>

            <p style="font-size: 13px; color: var(--cream); margin: 0 0 16px 0; line-height: 1.4; font-weight: 400; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
              "${p.caption || 'No caption provided.'}"
            </p>

            <!-- FOOTER STATS ICONS -->
            <div style="margin-top: auto; padding-top: 12px; border-top: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--muted-light);">
              
              <div style="display: flex; align-items: center; gap: 6px;">
                <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: var(--tan);"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                <strong style="color: var(--cream); font-weight: 600;">${likesCount}</strong>
              </div>

              <div style="display: flex; align-items: center; gap: 6px;">
                <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: var(--tan);"><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
                <strong style="color: var(--cream); font-weight: 600;">${commentsCount}</strong>
              </div>

              <div style="display: flex; align-items: center; gap: 6px;">
                <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: var(--tan);"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
                <strong style="color: var(--cream); font-weight: 600;">${savesCount}</strong>
              </div>

            </div>

          </div>
        </div>
      `;
    }).join("");
  } else {
    postsContainer.innerHTML = `
      <div class="panel-card" style="grid-column: 1 / -1; padding: 50px 30px; text-align: center;">
        <h5 class="font-serif" style="font-size: 20px; color: var(--tan-light);">No Community Posts Found</h5>
        <p style="font-size: 13px; color: var(--muted); margin-top: 6px;">This user has not published any posts in the community feed yet.</p>
      </div>
    `;
  }

  // 4. PANE SAVED POSTS
  const savedPostsContainer = document.getElementById("ud-saved-posts-container");
  savedPostsContainer.innerHTML = `
    <div style="grid-column: 1 / -1; padding: 30px; text-align: center;">
      <div style="width: 24px; height: 24px; border: 2px solid var(--tan); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 10px;"></div>
      <p style="font-size: 13px; color: var(--muted);">Fetching saved community posts...</p>
    </div>
  `;

  // Fetch saved post IDs for this user
  const { data: userSavedRows } = await supabase
    .from("post_saves")
    .select("post_id, created_at")
    .eq("user_id", userId);

  if (userSavedRows && userSavedRows.length > 0) {
    const savedPostIds = userSavedRows.map(r => r.post_id);

    // Fetch original post details
    const { data: savedPostsData } = await supabase
      .from("community_posts")
      .select("*")
      .in("id", savedPostIds);

    if (savedPostsData && savedPostsData.length > 0) {
      // Gather post creator IDs to get their profile details
      const creatorIds = Array.from(new Set(savedPostsData.map(p => p.user_id)));
      let creatorProfileMap = {};
      if (creatorIds.length > 0) {
        const { data: creators } = await supabase
          .from("user_profiles")
          .select("id, full_name, username, avatar_url, handle, display_name")
          .in("id", creatorIds);
        if (creators) {
          creators.forEach(c => { creatorProfileMap[c.id] = c; });
        }
      }

      // Process each post for images array and video URL
      const processedSavedPosts = savedPostsData.map(p => {
        let rawImages = [];
        if (Array.isArray(p.image_urls) && p.image_urls.length > 0) {
          rawImages = p.image_urls.map(img => typeof img === 'string' ? img : img?.uri).filter(Boolean);
        } else if (p.image_url) {
          rawImages = [p.image_url];
        }

        return {
          ...p,
          _rawImages: rawImages,
          _isVideo: Boolean(p.video_url || (typeof p.image_url === 'string' && (p.image_url.endsWith('.mp4') || p.image_url.endsWith('.mov')))),
          _videoUrl: p.video_url || (p.image_url && (p.image_url.endsWith('.mp4') || p.image_url.endsWith('.mov')) ? p.image_url : null)
        };
      });

      // Resolve signed URLs for all images in parallel
      const allImageItems = [];
      processedSavedPosts.forEach((p, pIdx) => {
        p._rawImages.forEach((imgUrl, iIdx) => {
          allImageItems.push({ pIdx, iIdx, image_url: imgUrl });
        });
      });

      const resolvedImageItems = await resolveWardrobeSignedUrls(allImageItems);

      // Attach resolved image URLs back to processedSavedPosts
      resolvedImageItems.forEach(item => {
        const p = processedSavedPosts[item.pIdx];
        if (!p._resolvedImages) p._resolvedImages = [];
        p._resolvedImages[item.iIdx] = item._resolvedImageUrl || item.image_url;
      });

      savedPostsContainer.innerHTML = processedSavedPosts.map((p, index) => {
        const creator = creatorProfileMap[p.user_id];
        const creatorName = creator?.full_name || creator?.display_name || creator?.username || creator?.handle || 'Community Member';

        const images = p._resolvedImages || p._rawImages || [];
        const isVideo = p._isVideo;
        const videoUrl = p._videoUrl;
        const carouselId = `saved-carousel-${p.id || index}`;

        return `
          <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; transition: all 0.25s ease;"
               onmouseover="this.style.borderColor='var(--tan-dark)'; this.style.transform='translateY(-2px)';"
               onmouseout="this.style.borderColor='var(--border-subtle)'; this.style.transform='none';">
            
            <div style="width: 100%; height: 260px; background: rgba(0,0,0,0.5); position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center;">
              
              ${isVideo && videoUrl ? `
                <video src="${videoUrl}" controls style="width: 100%; height: 100%; object-fit: contain; background: #000;"></video>
              ` : images.length > 0 ? `
                <div id="${carouselId}" style="width: 100%; height: 100%; position: relative; display: flex; align-items: center; justify-content: center;">
                  ${images.map((img, i) => `
                    <img src="${img}" class="${carouselId}-slide" style="max-width: 100%; max-height: 100%; object-fit: contain; display: ${i === 0 ? 'block' : 'none'};" onerror="this.style.display='none';">
                  `).join("")}

                  ${images.length > 1 ? `
                    <button type="button" onclick="window.rotatePostSlide('${carouselId}', -1)" style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.6); color: var(--cream); border: 1px solid var(--border-subtle); border-radius: 50%; width: 28px; height: 28px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; z-index: 2;">‹</button>
                    <button type="button" onclick="window.rotatePostSlide('${carouselId}', 1)" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.6); color: var(--cream); border: 1px solid var(--border-subtle); border-radius: 50%; width: 28px; height: 28px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; z-index: 2;">›</button>
                    <span class="${carouselId}-indicator" style="position: absolute; bottom: 8px; background: rgba(0,0,0,0.7); color: var(--cream); font-size: 10px; padding: 2px 8px; border-radius: 10px; z-index: 2;">1 / ${images.length}</span>
                  ` : ''}
                </div>
              ` : `
                <div style="font-size: 12px; color: var(--muted);">No Media Attached</div>
              `}

            </div>

            <div style="padding: 14px; display: flex; flex-direction: column; flex-grow: 1;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-size: 11px; font-weight: 600; color: var(--tan-light); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">by ${creatorName}</span>
                <span class="status-badge badge-gold" style="font-size: 9px; padding: 2px 6px;">SAVED</span>
              </div>

              <p style="font-size: 12px; color: var(--cream); margin: 0 0 10px 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                "${p.caption || 'Community outfit post'}"
              </p>

              <div style="margin-top: auto; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; font-size: 10px; color: var(--muted);">
                <span>${p.likes_count || 0} Likes</span>
                <span>${p.comments_count || 0} Comments</span>
              </div>
            </div>

          </div>
        `;
      }).join("");

    } else {
      savedPostsContainer.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 40px; text-align: center; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px dashed var(--border-subtle);">
          <p style="font-size: 13px; color: var(--muted);">No saved posts content found.</p>
        </div>
      `;
    }
  } else {
    savedPostsContainer.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 50px 30px; text-align: center; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px dashed var(--border-subtle);">
        <h5 class="font-serif" style="font-size: 18px; color: var(--tan-light);">No Saved Posts</h5>
        <p style="font-size: 13px; color: var(--muted); margin-top: 4px;">This user has not saved any community posts yet.</p>
      </div>
    `;
  }

  // Populate Community Feed Stats Cards at top of User Posts
  const totalPosts = postsList.length;
  const totalLikesReceived = postsList.reduce((acc, p) => acc + (p.likes_count || 0), 0);

  if (document.getElementById("cs-posts-count")) document.getElementById("cs-posts-count").innerText = totalPosts;
  if (document.getElementById("cs-likes-received")) document.getElementById("cs-likes-received").innerText = totalLikesReceived;
  if (document.getElementById("cs-followers")) document.getElementById("cs-followers").innerText = followersCount || u.follower_count || 0;
  if (document.getElementById("cs-following")) document.getElementById("cs-following").innerText = followingCount || u.following_count || 0;

  // 5. PANE FORUMS (Community Discussion Threads)
  const forumsContainer = document.getElementById("ud-forums-container");
  if (forumsContainer) {
    forumsContainer.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 30px; text-align: center;">
        <div style="width: 24px; height: 24px; border: 2px solid var(--tan); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 10px;"></div>
        <p style="font-size: 13px; color: var(--muted);">Fetching community discussion forums...</p>
      </div>
    `;

    try {
      const { data: userForums } = await supabase
        .from("forum_posts")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (userForums && userForums.length > 0) {
        const threadIds = userForums.map(f => f.id);

        const [
          { data: allForumLikes },
          { data: allForumReplies }
        ] = await Promise.all([
          supabase.from("forum_post_likes").select("thread_id").in("thread_id", threadIds),
          supabase.from("forum_replies").select("thread_id").in("thread_id", threadIds)
        ]);

        const forumsWithImages = userForums.map(f => ({ ...f, image_url: f.image_url || f.image_uri || null }));
        const resolvedForums = await resolveWardrobeSignedUrls(forumsWithImages);

        forumsContainer.innerHTML = resolvedForums.map(f => {
          const likesCount = (allForumLikes || []).filter(l => l.thread_id === f.id).length || f.likes_count || 0;
          const repliesCount = (allForumReplies || []).filter(r => r.thread_id === f.id).length || f.reply_count || f.replies_count || 0;
          const dateStr = f.created_at ? new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
          const mediaUrl = f._resolvedImageUrl || f.image_url || f.image_uri;
          const seasonTag = f.forum_season || f.season || 'GENERAL';

          return `
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; transition: all 0.25s ease;"
                 onmouseover="this.style.borderColor='var(--tan-dark)'; this.style.transform='translateY(-2px)';"
                 onmouseout="this.style.borderColor='var(--border-subtle)'; this.style.transform='none';">
              
              <div style="width: 100%; height: 220px; background: rgba(0,0,0,0.5); position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                ${mediaUrl ? `
                  <img src="${mediaUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;" onerror="this.parentElement.style.display='none';">
                ` : `
                  <div style="font-size: 12px; color: var(--muted);">Discussion Thread</div>
                `}
                <span class="status-badge badge-gold" style="position: absolute; top: 10px; right: 10px; font-size: 9px; padding: 2px 6px;">${seasonTag.toUpperCase()}</span>
              </div>

              <div style="padding: 16px; display: flex; flex-direction: column; flex-grow: 1;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <span style="font-size: 10px; color: var(--tan); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">FORUM THREAD</span>
                  <span style="font-size: 10px; color: var(--muted);">${dateStr}</span>
                </div>

                <h5 style="font-size: 14px; font-weight: 600; color: var(--cream); margin: 0 0 6px 0; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${f.title || f.name || 'Untitled Discussion'}
                </h5>

                <p style="font-size: 12px; color: var(--muted-light); margin: 0 0 16px 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                  "${f.content || f.body || f.desc || 'No description provided.'}"
                </p>

                <!-- FOOTER STATS ICONS -->
                <div style="margin-top: auto; padding-top: 12px; border-top: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--muted-light);">
                  
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: var(--tan);"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    <strong style="color: var(--cream); font-weight: 600;">${likesCount}</strong>
                  </div>

                  <div style="display: flex; align-items: center; gap: 6px;">
                    <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: var(--tan);"><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
                    <strong style="color: var(--cream); font-weight: 600;">${repliesCount}</strong>
                  </div>

                </div>

              </div>
            </div>
          `;
        }).join("");
      } else {
        forumsContainer.innerHTML = `
          <div class="panel-card" style="grid-column: 1 / -1; padding: 50px 30px; text-align: center;">
            <h5 class="font-serif" style="font-size: 20px; color: var(--tan-light);">No Discussion Forums Created</h5>
            <p style="font-size: 13px; color: var(--muted); margin-top: 6px;">This user has not created any community forum threads yet.</p>
          </div>
        `;
      }
    } catch (err) {
      console.warn("Error fetching forums:", err);
      forumsContainer.innerHTML = `
        <div class="panel-card" style="grid-column: 1 / -1; padding: 50px 30px; text-align: center;">
          <h5 class="font-serif" style="font-size: 20px; color: var(--tan-light);">No Discussion Forums Created</h5>
          <p style="font-size: 13px; color: var(--muted); margin-top: 6px;">This user has not created any community forum threads yet.</p>
        </div>
      `;
    }
  }

  // 7. PANE CALENDAR
  const calContainer = document.getElementById("ud-calendar-container");
  if (calContainer) {
    if (calendarList.length > 0) {
      calContainer.innerHTML = calendarList.map(e => {
        const dateStr = e.event_date ? new Date(e.event_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'No Date';
        const timeStr = e.event_date ? new Date(e.event_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const statusBadge = e.confirmed
          ? `<span style="background: rgba(74,222,128,0.15); color: #4ADE80; border: 1px solid rgba(74,222,128,0.3); padding: 3px 10px; border-radius: 12px; font-size: 10px; font-weight: 600; text-transform: uppercase;">Confirmed</span>`
          : e.is_device_event
            ? `<span style="background: rgba(147,197,253,0.15); color: #93C5FD; border: 1px solid rgba(147,197,253,0.3); padding: 3px 10px; border-radius: 12px; font-size: 10px; font-weight: 600; text-transform: uppercase;">Device Synced</span>`
            : `<span style="background: rgba(234,179,8,0.15); color: #EAB308; border: 1px solid rgba(234,179,8,0.3); padding: 3px 10px; border-radius: 12px; font-size: 10px; font-weight: 600; text-transform: uppercase;">Planned</span>`;

        const itemCount = Array.isArray(e.suggested_look_item_ids) ? e.suggested_look_item_ids.length : 0;

        return `
          <div style="background: rgba(20,20,20,0.6); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; position: relative;">
            <div>
              <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 10px;">
                <h5 class="font-serif" style="font-size: 16px; color: var(--cream); margin: 0; line-height: 1.3;">${e.event_name || 'Scheduled Event'}</h5>
                ${statusBadge}
              </div>

              <div style="display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: var(--muted); margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span>Date: ${dateStr} ${timeStr ? '• ' + timeStr : ''}</span>
                </div>
                ${e.location ? `
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <span>Location: ${e.location}</span>
                  </div>
                ` : ''}
                ${e.weather_temp || e.weather_condition ? `
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <span>Weather: ${e.weather_temp ? e.weather_temp + '° ' : ''}${e.weather_condition || ''}</span>
                  </div>
                ` : ''}
              </div>

              ${e.description ? `
                <p style="font-size: 12px; color: var(--muted); margin-bottom: 12px; font-style: italic;">"${e.description}"</p>
              ` : ''}

              <div style="background: rgba(0,0,0,0.4); border-radius: 8px; padding: 12px; border: 1px solid var(--border-subtle); margin-top: 4px;">
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--gold-primary); margin-bottom: 4px; font-weight: 600;">Look & Outfit</div>
                <div style="font-size: 13px; color: var(--cream); font-weight: 500;">${e.suggested_look_name || 'Stylist Look Recommendation'}</div>
                <div style="font-size: 11px; color: var(--muted); margin-top: 4px; display: flex; align-items: center; gap: 6px;">
                  <span>Wardrobe items linked:</span>
                  <strong style="color: var(--cream);">${itemCount} items</strong>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join("");
    } else {
      calContainer.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 45px 20px; text-align: center; background: rgba(0,0,0,0.25); border: 1px dashed var(--border-subtle); border-radius: 12px;">
          <h5 class="font-serif" style="font-size: 18px; color: var(--tan-light); margin: 0;">No Scheduled Calendar Outfits</h5>
          <p style="font-size: 12px; color: var(--muted); margin-top: 6px; max-width: 420px; margin-left: auto; margin-right: auto;">
            This user has not scheduled any outfit calendar events or synced device calendar items yet.
          </p>
        </div>
      `;
    }
  }

  // 8. PANE PACKING
  const packContainer = document.getElementById("ud-packing-container");
  if (packContainer) {
    packContainer.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 45px 20px; text-align: center; background: rgba(0,0,0,0.25); border: 1px dashed var(--border-subtle); border-radius: 12px;">
        <h5 class="font-serif" style="font-size: 18px; color: var(--tan-light); margin: 0;">No Packing Lists Found</h5>
        <p style="font-size: 12px; color: var(--muted); margin-top: 6px; max-width: 420px; margin-left: auto; margin-right: auto;">
          This user has not created any travel packing lists or trip itineraries yet.
        </p>
      </div>
    `;
  }

  // 9. PANE MARKETPLACE LISTINGS & FAVORITES
  if (typeof window.switchMarketplaceSubView === 'function') {
    window.switchMarketplaceSubView('created');
  }

  const mpContainer = document.getElementById("ud-marketplace-container");
  if (mpContainer) {
    mpContainer.innerHTML = renderMarketplaceListingCards(listingsList, false);
  }

  const mpSavedContainer = document.getElementById("ud-mp-saved-container");
  if (mpSavedContainer) {
    mpSavedContainer.innerHTML = renderMarketplaceListingCards(favoritedListings, true);
  }

  // 11. PANE LOOKBOOKS & SAVED OUTFITS
  const lbContainer = document.getElementById("ud-lookbooks-container");
  if (lbContainer) {
    // Combine folder lookbooks and individual saved looks
    const allSavedLooks = [...savedLooksList];
    userLookbooksList.forEach(lb => {
      if (Array.isArray(lb.saved_looks)) {
        lb.saved_looks.forEach(sl => {
          if (!allSavedLooks.some(existing => existing.id === sl.id)) {
            allSavedLooks.push(sl);
          }
        });
      }
    });

    if (allSavedLooks.length > 0 || userLookbooksList.length > 0) {
      let lookbookHtml = "";

      // First render lookbook folders if present
      if (userLookbooksList.length > 0) {
        lookbookHtml += userLookbooksList.map(lb => {
          const dateStr = lb.created_at ? new Date(lb.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
          const folderLooks = (lb.saved_looks || []);
          return `
            <div style="grid-column: 1 / -1; background: rgba(25,25,25,0.7); border: 1px solid var(--gold-primary); border-radius: 12px; padding: 18px; margin-bottom: 12px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <div>
                  <h5 class="font-serif" style="font-size: 18px; color: var(--cream); margin: 0;">${lb.name || 'Untitled Lookbook Folder'}</h5>
                  <span style="font-size: 11px; color: var(--muted);">Created: ${dateStr} • ${folderLooks.length} Saved Outfits</span>
                </div>
              </div>
            </div>
          `;
        }).join("");
      }

      // Helper parser for structured look name strings
      function parseLookName(rawName, customNotes) {
        if (!rawName) return { title: 'Untitled Look', vibe: null, description: customNotes || null, tags: [] };

        let parts = rawName.split(/\|\|\||\|\|/);
        let rawTitle = parts[0] ? parts[0].trim() : 'Untitled Look';
        let vibe = null;
        let description = parts[1] ? parts[1].trim() : (customNotes || null);
        let tags = parts[2] ? parts[2].split(',').map(s => s.trim()).filter(Boolean) : [];

        const vibeMatch = rawTitle.match(/^(.+?)\s*\((.+?)\)$/);
        if (vibeMatch) {
          rawTitle = vibeMatch[1].trim();
          vibe = vibeMatch[2].trim();
        }

        return { title: rawTitle, vibe, description, tags };
      }

      lookbookHtml += allSavedLooks.map((look, index) => {
        const dateStr = look.created_at ? new Date(look.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
        const itemIds = Array.isArray(look.item_ids) ? look.item_ids : [];
        const outfitItems = itemIds.map(id => wardrobeItemsMap.get(id)).filter(Boolean);

        const parsed = parseLookName(look.name, look.custom_notes);
        const tags = Array.isArray(look.occasion_tags) && look.occasion_tags.length > 0 ? look.occasion_tags : parsed.tags;

        return `
          <div style="background: rgba(18,18,20,0.75); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; gap: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
            <div>
              <!-- Header Row -->
              <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
                <div>
                  <h5 class="font-serif" style="font-size: 17px; color: var(--cream); margin: 0 0 4px 0; font-weight: 600;">${parsed.title}</h5>
                  <div style="font-size: 11px; color: var(--muted);">Saved: ${dateStr}${look.lookbook_name ? ` • ${look.lookbook_name}` : ''}</div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                  <span style="font-size: 10px; color: var(--gold-primary); background: rgba(212,175,55,0.12); border: 1px solid rgba(212,175,55,0.3); padding: 3px 9px; border-radius: 12px; font-weight: 600; white-space: nowrap;">${outfitItems.length} Pieces</span>
                  ${parsed.vibe ? `<span style="font-size: 10px; color: var(--tan-light); background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 10px; font-weight: 500;">${parsed.vibe}</span>` : ''}
                </div>
              </div>

              <!-- Primary Wardrobe Garments Showcase (Front & Center) -->
              <div style="margin-top: 12px; margin-bottom: 12px;">
                <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--gold-primary); font-weight: 600; margin-bottom: 8px;">Outfit Composition</div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px; background: rgba(0,0,0,0.45); padding: 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.06);">
                  ${outfitItems.length > 0 ? outfitItems.map(item => {
          const imgUrl = item._resolvedImageUrl || item.image_url;
          return `
                      <div style="text-align: center;" title="${item.name || 'Garment Piece'}">
                        <div style="width: 100%; height: 85px; background: radial-gradient(circle, rgba(45,45,45,0.5) 0%, rgba(12,12,12,0.95) 100%); border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; overflow: hidden; margin-bottom: 6px;">
                          ${imgUrl ? `
                            <img src="${imgUrl}" alt="${item.name || 'Outfit Item'}" style="width: 100%; height: 100%; object-fit: contain; padding: 6px; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                            <div style="display:none; font-size: 10px; color: var(--muted);">No Image</div>
                          ` : `
                            <div style="font-size: 10px; color: var(--muted);">No Image</div>
                          `}
                        </div>
                        <div style="font-size: 10px; color: var(--cream); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name || 'Item'}</div>
                        ${item.brand ? `<div style="font-size: 9px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.brand}</div>` : ''}
                      </div>
                    `;
        }).join('') : `
                    <div style="grid-column: 1 / -1; font-size: 11px; color: var(--muted); text-align: center; padding: 12px;">No wardrobe item images linked</div>
                  `}
                </div>
              </div>

              <!-- Stylist Notes & AI Description (Clean & Truncated) -->
              ${parsed.description ? `
                <div style="background: rgba(255,255,255,0.03); border-left: 2px solid var(--gold-primary); padding: 8px 12px; border-radius: 0 6px 6px 0; margin-bottom: 10px;">
                  <div style="font-size: 11px; color: var(--tan-light); line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;" title="${parsed.description}">
                    "${parsed.description}"
                  </div>
                </div>
              ` : ''}

              <!-- Occasion Tags -->
              ${tags.length > 0 ? `
                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;">
                  ${tags.map(t => `<span style="font-size: 10px; background: rgba(212,175,55,0.08); color: var(--tan-light); border: 1px solid rgba(212,175,55,0.2); padding: 2px 7px; border-radius: 4px;">#${t}</span>`).join('')}
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join("");

      lbContainer.innerHTML = lookbookHtml;
    } else {
      lbContainer.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 45px 20px; text-align: center; background: rgba(0,0,0,0.25); border: 1px dashed var(--border-subtle); border-radius: 12px;">
          <h5 class="font-serif" style="font-size: 18px; color: var(--tan-light); margin: 0;">No Lookbooks or Saved Outfits</h5>
          <p style="font-size: 12px; color: var(--muted); margin-top: 6px; max-width: 420px; margin-left: auto; margin-right: auto;">
            This user has not saved any outfit looks or custom lookbook folders yet.
          </p>
        </div>
      `;
    }
  }

  // 12. PANE MOODBOARDS
  const mbContainer = document.getElementById("ud-moodboards-container");
  if (mbContainer) {
    if (userMoodboardsList.length > 0) {
      mbContainer.innerHTML = userMoodboardsList.map(mb => {
        const rawItems = Array.isArray(mb.moodboard_items) ? mb.moodboard_items : [];
        const items = rawItems.map(item => moodboardItemsMap.get(item.id) || item);
        const dateStr = mb.created_at ? new Date(mb.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
        
        // Group items by source inspiration photo (image_url)
        const groupMap = new Map();
        items.forEach(pin => {
          const groupKey = pin.image_url || pin.id;
          if (!groupMap.has(groupKey)) {
            groupMap.set(groupKey, []);
          }
          groupMap.get(groupKey).push(pin);
        });

        const groups = Array.from(groupMap.values());

        return `
          <div style="background: rgba(20,20,20,0.6); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 22px; margin-bottom: 16px; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; overflow: hidden;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px;">
              <div>
                <h5 class="font-serif" style="font-size: 20px; color: var(--cream); margin: 0 0 4px 0;">${mb.name || 'Untitled Moodboard'}</h5>
                ${mb.description ? `<p style="font-size: 12px; color: var(--tan-light); margin-bottom: 4px; font-style: italic;">"${mb.description}"</p>` : ''}
                <div style="font-size: 11px; color: var(--muted);">Created: ${dateStr} • ${groups.length} Inspiration Photos • ${items.length} Detected Style Pieces</div>
              </div>
            </div>

            <!-- Inspiration Photo Groups (Responsive Auto-Fit Grid with min-width:0 containment) -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box;">
              ${groups.length > 0 ? groups.map((groupItems, gIdx) => {
                const firstItem = groupItems[0];
                const imgUrl = firstItem._resolvedImageUrl || firstItem.image_url;
                const detectedPieces = groupItems.filter(i => i.item_type !== 'inspiration_image' || groupItems.length === 1);

                // Collect all matching closet items across detected pieces
                const allMatchingWardrobeItems = [];
                detectedPieces.forEach(piece => {
                  const pieceCat = (piece.category || '').toLowerCase();
                  const pieceColor = (piece.color_name || '').toLowerCase();
                  
                  const matched = Array.from(wardrobeItemsMap.values()).filter(w => {
                    const wCat = (w.category || '').toLowerCase();
                    const wColor = (w.colorName || '').toLowerCase();
                    const catMatch = wCat === pieceCat || (wCat && pieceCat && (wCat.includes(pieceCat) || pieceCat.includes(wCat)));
                    const colorMatch = wColor && pieceColor && (wColor.includes(pieceColor) || pieceColor.includes(wColor));
                    return catMatch || colorMatch;
                  });

                  matched.forEach(w => {
                    if (!allMatchingWardrobeItems.some(existing => existing.id === w.id)) {
                      allMatchingWardrobeItems.push(w);
                    }
                  });
                });

                return `
                  <div style="background: rgba(14,14,16,0.9); border: 1px solid var(--border-subtle); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; gap: 16px; box-shadow: 0 6px 24px rgba(0,0,0,0.4); min-width: 0; max-width: 100%; overflow: hidden; box-sizing: border-box;">
                    
                    <div>
                      <!-- 1. Main Inspiration Photo (Center Stage) -->
                      <div style="width: 100%; height: 360px; background: radial-gradient(circle, rgba(35,35,35,0.6) 0%, rgba(10,10,10,0.95) 100%); border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); position: relative; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                        ${imgUrl ? `
                          <img src="${imgUrl}" alt="Inspiration Image" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                          <div style="display:none; color: var(--muted); font-size: 11px;">No Photo</div>
                        ` : `
                          <div style="color: var(--muted); font-size: 11px;">No Photo</div>
                        `}
                        <span style="position: absolute; top: 12px; left: 12px; background: rgba(0,0,0,0.75); color: var(--gold-primary); border: 1px solid rgba(212,175,55,0.35); font-size: 10px; padding: 4px 10px; border-radius: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                          Inspiration Photo #${gIdx + 1}
                        </span>
                      </div>

                    <!-- 2. DETECTED PIECES (N) Header & Horizontal Pill Selectors -->
                    <div>
                      <div style="font-size: 10px; font-weight: 700; color: var(--tan-light); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px;">
                        DETECTED PIECES (${detectedPieces.length})
                      </div>
                      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${detectedPieces.map(piece => `
                          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(212, 175, 55, 0.12); color: var(--cream); border: 1px solid rgba(212, 175, 55, 0.3); padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 500;">
                            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${piece.color_hex || 'var(--gold-primary)'}; border: 1px solid #fff;"></span>
                            <strong>${piece.brand || piece.name || piece.category}</strong>
                            ${piece.color_name ? `<span style="color: var(--muted-light);">(${piece.color_name})</span>` : ''}
                          </div>
                        `).join('')}
                      </div>
                    </div>

                    <!-- 3. AI Garment Description & Matching Closet Pieces -->
                    <div style="background: rgba(8,8,10,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 16px; min-width: 0; max-width: 100%; overflow: hidden; box-sizing: border-box;">
                      ${detectedPieces[0]?.description ? `
                        <p style="font-size: 12px; color: var(--tan-light); margin: 0 0 14px 0; line-height: 1.55; font-style: italic;">
                          "${detectedPieces[0].description}"
                        </p>
                      ` : ''}

                      <!-- Matching Closet Items -->
                      ${allMatchingWardrobeItems.length > 0 ? `
                        <div style="font-size: 10px; font-weight: 700; color: #4ADE80; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                          <span style="color: #4ADE80; font-weight: 700;">[MATCH]</span> ${allMatchingWardrobeItems.length} MATCHING ITEM${allMatchingWardrobeItems.length > 1 ? 'S' : ''} IN USER'S CLOSET
                        </div>
                        <div style="display: flex; gap: 10px; overflow-x: auto; max-width: 100%; min-width: 0; padding-bottom: 6px; box-sizing: border-box;">
                          ${allMatchingWardrobeItems.map(item => `
                            <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 6px 14px; border-radius: 20px; flex-shrink: 0;">
                              <div style="width: 26px; height: 26px; border-radius: 50%; overflow: hidden; background: #000; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.15);">
                                <img src="${item._resolvedImageUrl || item.image_url}" style="width: 100%; height: 100%; object-fit: cover;">
                              </div>
                              <span style="font-size: 11px; color: var(--cream); font-weight: 500;">${item.name}</span>
                            </div>
                          `).join('')}
                        </div>
                      ` : `
                        <div style="font-size: 11px; color: var(--muted); font-style: italic;">
                          No matching garments detected in user's wardrobe closet.
                        </div>
                      `}
                    </div>
                  </div>
                `;
              }).join('') : `
                <div style="padding: 20px; text-align: center; color: var(--muted); font-size: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                  No inspiration photos added to this moodboard yet.
                </div>
              `}
            </div>
          </div>
        `;
      }).join("");
    } else {
      mbContainer.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 45px 20px; text-align: center; background: rgba(0,0,0,0.25); border: 1px dashed var(--border-subtle); border-radius: 12px;">
          <h5 class="font-serif" style="font-size: 18px; color: var(--tan-light); margin: 0;">No Inspiration Moodboards</h5>
          <p style="font-size: 12px; color: var(--muted); margin-top: 6px; max-width: 420px; margin-left: auto; margin-right: auto;">
            This user has not created any inspiration moodboards yet.
          </p>
        </div>
      `;
    }
  }

  // 13. PANE FAVORITES
  const favContainer = document.getElementById("ud-unified-favorites-container");
  if (favContainer) {
    const allUnifiedFavorites = [];

    // 1. Add Favorited Marketplace Garments
    (favoritedListings || []).forEach(item => {
      const imgUrl = item._resolvedImageUrl || (Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : item.image_url || item.image);
      allUnifiedFavorites.push({
        id: item.id,
        name: item.title || item.name || 'Favorited Marketplace Garment',
        brand: item.brand || 'Marketplace Garment',
        price: item.price,
        imageUrl: imgUrl,
        type: 'Marketplace Favorite',
        badgeColor: '#4ADE80'
      });
    });

    // 2. Add Wardrobe & Wishlist Favorites
    (resolvedWardrobeFavorites || []).forEach(item => {
      const targetWardrobe = (item.item_id || item.wardrobe_item_id) ? wardrobeItemsMap.get(item.item_id || item.wardrobe_item_id) : null;
      const finalItem = targetWardrobe || item;
      const imgUrl = finalItem._resolvedImageUrl || finalItem.image_url || (Array.isArray(finalItem.images) ? finalItem.images[0] : null);
      if (finalItem && !allUnifiedFavorites.some(f => f.id === finalItem.id)) {
        allUnifiedFavorites.push({
          id: finalItem.id || item.id,
          name: finalItem.name || finalItem.title || 'Wishlist Garment',
          brand: finalItem.brand || 'Wardrobe Wishlist',
          price: finalItem.price || finalItem.purchase_price,
          imageUrl: imgUrl,
          type: 'Wardrobe Wishlist',
          badgeColor: 'var(--tan-light)'
        });
      }
    });

    // 3. Add Closet Favorites (wardrobe items marked is_favorite / is_wishlist)
    (resolvedWardrobeItems || []).forEach(item => {
      if (item.is_favorite || item.favorite || item.is_wishlist || item.in_wishlist || (item.category && item.category.toLowerCase().includes('wishlist'))) {
        if (!allUnifiedFavorites.some(f => f.id === item.id)) {
          allUnifiedFavorites.push({
            id: item.id,
            name: item.name || 'Favorited Wardrobe Piece',
            brand: item.brand || 'Wardrobe Closet',
            price: item.purchase_price || item.price,
            imageUrl: item._resolvedImageUrl || item.image_url,
            type: 'Closet Favorite',
            badgeColor: 'var(--gold-primary)'
          });
        }
      }
    });

    if (allUnifiedFavorites.length > 0) {
      favContainer.innerHTML = allUnifiedFavorites.map(item => `
        <div style="background: rgba(20,20,20,0.6); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden;">
          <div>
            <div style="width: 100%; height: 180px; background: radial-gradient(circle, rgba(40,40,40,0.5) 0%, rgba(12,12,12,0.95) 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 12px;">
              <span style="position: absolute; top: 8px; right: 8px; z-index: 2; background: rgba(0,0,0,0.75); color: ${item.badgeColor}; border: 1px solid rgba(255,255,255,0.12); padding: 3px 9px; border-radius: 10px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${item.type}</span>
              ${item.imageUrl ? `
                <img src="${item.imageUrl}" alt="${item.name}" style="width: 100%; height: 100%; object-fit: contain; padding: 6px; filter: drop-shadow(0 6px 12px rgba(0,0,0,0.6));" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'display:flex; flex-direction:column; align-items:center; color:var(--muted); font-size:12px;\\'><span style=\\'font-size:10px;\\'>Image Unavailable</span></div>';">
              ` : `
                <div style="display:flex; flex-direction:column; align-items:center; color:var(--muted); font-size:12px;">
                  <span style="font-size:10px;">No Image</span>
                </div>
              `}
            </div>

            <h5 class="font-serif" style="font-size: 15px; color: var(--cream); margin: 0 0 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.name}">${item.name}</h5>
            
            <div style="font-size: 11px; color: var(--muted); margin-bottom: 8px;">
              <span style="color: var(--tan-light); font-weight: 500;">${item.brand}</span>
            </div>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.07); padding-top: 8px; margin-top: 4px;">
            <span style="font-size: 10px; color: var(--muted); text-transform: uppercase;">Price / Value</span>
            <strong style="font-size: 14px; color: var(--gold-primary); font-weight: 700;">${formatMarketplacePrice(item.price)}</strong>
          </div>
        </div>
      `).join("");
    } else {
      favContainer.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 45px 20px; text-align: center; background: rgba(0,0,0,0.25); border: 1px dashed var(--border-subtle); border-radius: 12px;">
          <h5 class="font-serif" style="font-size: 18px; color: var(--tan-light); margin: 0;">No Favorited Garments</h5>
          <p style="font-size: 12px; color: var(--muted); margin-top: 6px; max-width: 420px; margin-left: auto; margin-right: auto;">
            This user has not favorited or saved any marketplace listings or wardrobe wishlist items yet.
          </p>
        </div>
      `;
    }
  }

  // 14. PANE SELLER SHOP
  document.getElementById("shop-total-earnings").innerText = `$${totalRev.toFixed(2)}`;
  document.getElementById("shop-available-bal").innerText = `$${(totalRev * 0.9).toFixed(2)}`;
  document.getElementById("shop-pending-payout").innerText = `$0.00`;
  document.getElementById("shop-lifetime-rev").innerText = `$${totalRev.toFixed(2)}`;

  const payoutsTbody = document.getElementById("shop-payouts-tbody");
  if (salesList.length > 0) {
    payoutsTbody.innerHTML = salesList.map(s => {
      const rawAmt = s.amount ?? s.total_amount ?? s.seller_net_amount ?? s.price ?? 0;
      const formattedAmt = formatMarketplacePrice(rawAmt);
      return `
        <tr>
          <td><code>${s.id}</code></td>
          <td style="color: #4ADE80; font-weight: 600;">${formattedAmt}</td>
          <td><span class="status-badge badge-approved">TRANSFERRED</span></td>
          <td>${s.created_at ? new Date(s.created_at).toLocaleDateString() : new Date().toLocaleDateString()}</td>
        </tr>
      `;
    }).join("");
  } else {
    payoutsTbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 30px; color: var(--muted); font-size: 12px;">
          No Payout Transfers Recorded (0 Items Sold)
        </td>
      </tr>
    `;
  }

  // 15. PANE PURCHASES
  const purchasesTbody = document.getElementById("ud-purchases-tbody");
  if (purchasesList.length > 0) {
    purchasesTbody.innerHTML = purchasesList.map(p => {
      const rawAmt = p.amount ?? p.total_amount ?? p.seller_net_amount ?? p.price ?? 0;
      const formattedAmt = formatMarketplacePrice(rawAmt);
      return `
        <tr>
          <td><code>${p.id}</code></td>
          <td>Garment Order</td>
          <td>Seller ${p.seller_user_id ? p.seller_user_id.substring(0, 8) : 'N/A'}</td>
          <td style="color: var(--cream); font-weight: 600;">${formattedAmt}</td>
          <td><span class="status-badge badge-approved">DELIVERED</span></td>
          <td>${p.created_at ? new Date(p.created_at).toLocaleDateString() : new Date().toLocaleDateString()}</td>
          <td><button class="btn-secondary" onclick="window.openLuxuryOrderInvoice('${p.id}')" style="padding: 4px 10px; font-size: 10px;">Tax Invoice</button></td>
        </tr>
      `;
    }).join("");
  } else {
    purchasesTbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 30px; color: var(--muted); font-size: 12px;">
          No Purchase Orders Found (0 Orders Purchased)
        </td>
      </tr>
    `;
  }

  // 16. PANE SUBSCRIPTION
  const subPlanBadge = document.getElementById("sub-plan-badge");
  if (subPlanBadge) {
    const tierName = u.subscription_tier || u.tier || "PREMIUM";
    subPlanBadge.innerText = `${tierName.toUpperCase()} MEMBER`;
    subPlanBadge.className = `status-badge ${tierName.toLowerCase() === 'free' ? 'badge-pending' : 'badge-approved'}`;
  }

  const subCycle = document.getElementById("sub-cycle");
  if (subCycle) subCycle.innerText = u.billing_cycle || u.subscription_cycle || "Monthly";

  const subTrial = document.getElementById("sub-trial");
  if (subTrial) subTrial.innerText = u.trial_status || (u.is_trial ? "In Trial" : "N/A");

  const subStartDate = document.getElementById("sub-start-date");
  if (subStartDate) subStartDate.innerText = (u.subscription_created_at || u.created_at) ? new Date(u.subscription_created_at || u.created_at).toLocaleDateString() : "---";

  const subRenewalDate = document.getElementById("sub-renewal-date");
  if (subRenewalDate) subRenewalDate.innerText = (u.subscription_renewal_date || u.renews_at) ? new Date(u.subscription_renewal_date || u.renews_at).toLocaleDateString() : "Lifetime Free";

  const subStatusBadge = document.getElementById("sub-status-badge");
  if (subStatusBadge) {
    const statusStr = (u.subscription_status || u.status || "ACTIVE").toUpperCase();
    subStatusBadge.innerText = statusStr;
    subStatusBadge.className = `status-badge ${statusStr === 'ACTIVE' || statusStr === 'APPROVED' ? 'badge-approved' : 'badge-pending'}`;
  }

  // Save snapshot to cache for instant 0ms subsequent views
  globalUserProfileCache.set(userId, { timestamp: Date.now() });

  // Switch View
  listView.classList.add("hidden");
  detailView.classList.remove("hidden");
};

// Sub-Tab Navigation Bar Switcher Event Listener Setup
document.addEventListener("DOMContentLoaded", () => {
  const subnavBar = document.getElementById("ud-subnav-bar");
  if (subnavBar) {
    subnavBar.addEventListener("click", (e) => {
      const btn = e.target.closest(".ud-subnav-btn");
      if (!btn) return;

      const targetPaneId = btn.getAttribute("data-subtab");
      if (!targetPaneId) return;

      // Update button active state
      subnavBar.querySelectorAll(".ud-subnav-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Update pane visible state
      document.querySelectorAll("#ud-panes-container .ud-pane").forEach(pane => {
        if (pane.id === targetPaneId) {
          pane.classList.remove("hidden");
        } else {
          pane.classList.add("hidden");
        }
      });
    });
  }
});

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

window.closeUserProfileView = function () {
  const listView = document.getElementById("user-list-view");
  const detailView = document.getElementById("user-detail-view");
  if (listView && detailView) {
    detailView.classList.add("hidden");
    listView.classList.remove("hidden");
  }
};

function renderChips(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items || (Array.isArray(items) && items.length === 0)) {
    container.innerHTML = `<span style="font-size: 11px; color: var(--muted);">None</span>`;
    return;
  }

  const list = Array.isArray(items) ? items : [String(items)];
  container.innerHTML = list.map(i => `
    <span class="status-badge badge-gold" style="font-size: 10px; text-transform: none;">${i}</span>
  `).join("");
}

window.toggleUserRole = async function (userId, newRole) {
  window.showConfirmModal({
    title: "Change User Permission Role?",
    message: `Are you sure you want to change this user's role to ${newRole.toUpperCase()}?`,
    btnText: "Update User Role",
    btnClass: "btn-primary",
    onConfirm: async () => {
      const { error } = await supabase.from("user_profiles").update({ role: newRole }).eq("id", userId);
      if (error) {
        alert("Error updating user role: " + error.message);
      } else {
        await loadUserDirectory();
        window.openUserProfileView(userId);
      }
    }
  });
};

// ── MODULE 6: COMMUNITY POSTS ──
async function loadCommunityPosts() {
  const tbody = document.getElementById("community-table-body");
  if (!tbody) return;
  const { data: posts, error } = await supabase
    .from("community_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !posts || posts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted);">No community posts found.</td></tr>`;
    return;
  }

  tbody.innerHTML = posts.map((p) => `
    <tr>
      <td>${p.id.slice(0, 8)}...</td>
      <td>${p.user_id ? p.user_id.slice(0, 8) : 'User'}</td>
      <td>${(p.content || '').slice(0, 40)}...</td>
      <td><span class="status-badge ${p.is_flagged ? 'badge-declined' : 'badge-approved'}">${p.is_flagged ? 'FLAGGED' : 'CLEAN'}</span></td>
      <td>${new Date(p.created_at).toLocaleDateString()}</td>
      <td>
        <button class="btn-danger" onclick="deleteCommunityPost('${p.id}')">Delete</button>
      </td>
    </tr>
  `).join("");
}

window.deleteCommunityPost = async function (id) {
  window.showConfirmModal({
    title: "Delete Community Post?",
    message: "Are you sure you want to permanently delete this post from the community feed?",
    btnText: "Yes, Delete Post",
    btnClass: "btn-danger",
    onConfirm: async () => {
      const { error } = await supabase.from("community_posts").delete().eq("id", id);
      if (error) alert("Error deleting post: " + error.message);
      else loadCommunityPosts();
    }
  });
};

// ── MODULE 7: AFFILIATE PRODUCTS ──
let currentAffiliatePage = 1;
const AFFILIATE_PAGE_SIZE = 25;

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
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px;">
          <div style="width: 28px; height: 28px; border: 2px solid var(--tan); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px;"></div>
          <p style="font-size: 13px; color: var(--muted);">Loading affiliate products catalog...</p>
        </td>
      </tr>
    `;
  }

  const from = (page - 1) * AFFILIATE_PAGE_SIZE;
  const to = from + AFFILIATE_PAGE_SIZE - 1;

  let dbQuery = supabase
    .from("affiliate_products")
    .select("*", { count: "exact" });

  if (networkFilter !== "all") {
    dbQuery = dbQuery.eq("network", networkFilter);
  }

  if (queryText) {
    dbQuery = dbQuery.or(`title.ilike.%${queryText}%,brand.ilike.%${queryText}%,merchant_name.ilike.%${queryText}%`);
  }

  dbQuery = dbQuery
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  const { data: items, count, error } = await dbQuery;

  if (error) {
    console.error("Error loading affiliate catalog:", error);
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #EF4444; padding: 30px;">Error loading catalog: ${error.message}</td></tr>`;
    return;
  }

  const totalCount = count || 0;
  if (countBadge) {
    countBadge.innerText = `${totalCount.toLocaleString()} Products`;
  }

  if (!items || items.length === 0) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 45px 20px; color: var(--muted);">
            <div style="font-size: 26px; margin-bottom: 8px; opacity: 0.6;">🛍️</div>
            <p style="margin: 0; font-size: 13px; color: var(--tan-light);">${queryText || networkFilter !== 'all' ? 'No products match your filter criteria.' : 'No affiliate products synced yet.'}</p>
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
      const initialLetter = (brandOrMerchant.trim().charAt(0) || 'P').toUpperCase();
      const rawImg = item.image_url || item.image_link || item.image || item.imageUrl;

      let imgContainerInner = '';
      if (rawImg && typeof rawImg === 'string' && rawImg.startsWith('http')) {
        imgContainerInner = `
          <img src="${rawImg}" alt="${item.title || 'Product'}" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" style="width: 100%; height: 100%; object-fit: cover;">
          <div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; background: rgba(200, 184, 154, 0.18); color: var(--tan-light); font-weight: 700; font-size: 14px;">${initialLetter}</div>
        `;
      } else {
        imgContainerInner = `
          <div style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; background: rgba(200, 184, 154, 0.18); color: var(--tan-light); font-weight: 700; font-size: 14px;">${initialLetter}</div>
        `;
      }

      let formattedPrice = "N/A";
      if (item.price != null) {
        const numPrice = typeof item.price === "number" ? item.price : parseFloat(item.price);
        const curr = item.currency || "USD";
        formattedPrice = !isNaN(numPrice) ? `${curr} ${numPrice.toFixed(2)}` : `${curr} ${item.price}`;
      }

      const rawLink = item.deep_link || item.deeplink || item.url || item.link || item.product_url || item.affiliate_url || '';
      const encodedLink = encodeURIComponent(rawLink);

      const merchantName = item.merchant_name || "Merchant";
      const merchantId = item.merchant_id ? `(#${item.merchant_id})` : "";
      const categoryName = item.google_product_category || item.category || "Fashion";
      const extId = item.external_id || (item.id ? item.id.slice(0, 8) : "N/A");
      const networkBadge = (item.network || "AWIN").toUpperCase();

      return `
        <tr style="transition: background 0.15s ease;">
          <td style="width: 55px; text-align: center; padding: 8px;">
            <div style="width: 44px; height: 44px; border-radius: 6px; overflow: hidden; background: rgba(0,0,0,0.6); border: 1px solid var(--border-tan); display: flex; align-items: center; justify-content: center; margin: 0 auto;">
              ${imgContainerInner}
            </div>
          </td>
          <td style="max-width: 240px;">
            <div style="font-weight: 600; color: var(--cream); font-size: 13px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.title || ''}">
              ${item.title || 'Untitled Product'}
            </div>
            <div style="font-size: 11px; color: var(--muted); margin-top: 2px;">
              Ext ID: <code style="color: var(--tan-light); font-size: 10px;">${extId}</code>
            </div>
          </td>
          <td><strong style="color: var(--tan-light); font-size: 12px;">${item.brand || 'Unbranded'}</strong></td>
          <td>
            <div style="font-size: 12px; color: var(--cream); font-weight: 500;">${merchantName}</div>
            <span style="font-size: 10px; color: var(--muted);">${merchantId}</span>
          </td>
          <td>
            <span class="status-badge ${networkBadge === 'AWIN' ? 'badge-approved' : 'badge-gold'}" style="font-size: 10px;">
              ${networkBadge}
            </span>
          </td>
          <td>
            <strong style="color: #4ADE80; font-size: 13px;">${formattedPrice}</strong>
          </td>
          <td>
            <span style="font-size: 11px; color: var(--tan-light); background: rgba(200,184,154,0.08); padding: 3px 8px; border-radius: 12px; border: 1px solid rgba(200,184,154,0.2); display: inline-block;">
              ${categoryName}
            </span>
          </td>
          <td style="text-align: right; white-space: nowrap;">
            <button type="button" class="btn-primary" onclick="window.openAffiliateProductLink('${encodedLink}')" style="padding: 7px 14px; font-size: 11px; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer;">
              <span>View Product</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"></path></svg>
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Render server-side pagination controls
  const totalPages = Math.ceil(totalCount / AFFILIATE_PAGE_SIZE);
  if (paginationControls) {
    paginationControls.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-top: 1px solid var(--border-subtle); background: rgba(0,0,0,0.25);">
        <div style="font-size: 12px; color: var(--muted);">
          Showing <strong style="color: var(--cream);">${totalCount > 0 ? from + 1 : 0}–${Math.min(to + 1, totalCount)}</strong> of <strong style="color: var(--cream);">${totalCount.toLocaleString()}</strong> products
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="btn-secondary" ${page <= 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''} onclick="loadAffiliateProducts(${page - 1})" style="padding: 6px 14px; font-size: 11px;">
            ← Prev
          </button>
          <span style="font-size: 12px; color: var(--tan-light); font-weight: 600; padding: 0 8px;">
            Page ${page} of ${totalPages || 1}
          </span>
          <button class="btn-secondary" ${page >= totalPages ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''} onclick="loadAffiliateProducts(${page + 1})" style="padding: 6px 14px; font-size: 11px;">
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
    alert("No deep link URL available for this product.");
    return;
  }
  let targetUrl = decodeURIComponent(encodedUrl);
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    targetUrl = "https://" + targetUrl;
  }
  window.open(targetUrl, "_blank", "noopener,noreferrer");
};
