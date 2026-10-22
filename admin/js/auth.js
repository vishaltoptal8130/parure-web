// ─────────────────────────────────────────────────────────────────────
// Parure La Plee — Master Admin Authentication Module
// ─────────────────────────────────────────────────────────────────────

import { MASTER_ADMIN_EMAIL } from "./config.js";
import { showSuccess, showError, showInfo } from "./ui.js";

let currentAdminUser = null;
let currentAdminProfile = null;

export function getAdminUser() {
  return currentAdminUser;
}

export function getAdminProfile() {
  return currentAdminProfile;
}

export function showAuthView(errorMsg = "", successMsg = "") {
  const authContainer = document.getElementById("auth-screen") || document.getElementById("auth-container");
  const appContainer = document.getElementById("app-shell") || document.getElementById("app-container");

  if (authContainer) authContainer.classList.remove("hidden");
  if (appContainer) appContainer.classList.add("hidden");

  const errEl = document.getElementById("auth-error");
  const succEl = document.getElementById("auth-success");

  if (errEl) {
    if (errorMsg) {
      errEl.innerText = errorMsg;
      errEl.classList.remove("hidden");
    } else {
      errEl.classList.add("hidden");
    }
  }

  if (succEl) {
    if (successMsg) {
      succEl.innerText = successMsg;
      succEl.classList.remove("hidden");
    } else {
      succEl.classList.add("hidden");
    }
  }
}

export function showDashboardView() {
  const authContainer = document.getElementById("auth-screen") || document.getElementById("auth-container");
  const appContainer = document.getElementById("app-shell") || document.getElementById("app-container");

  if (authContainer) authContainer.classList.add("hidden");
  if (appContainer) appContainer.classList.remove("hidden");
}

export async function verifyAndLoadAdmin(supabase, user, onLoaded) {
  try {
    if (!user || user.email?.toLowerCase() !== MASTER_ADMIN_EMAIL) {
      await supabase.auth.signOut();
      showAuthView(`Access Denied: Only ${MASTER_ADMIN_EMAIL} is authorized as Master Admin.`);
      return false;
    }

    // Call RPC SECURITY DEFINER to ensure master admin elevation
    try {
      await supabase.rpc("setup_master_admin_profile", { p_email: MASTER_ADMIN_EMAIL });
    } catch (e) {
      console.warn("[Auth] RPC setup_master_admin_profile notice:", e);
    }

    // Fetch updated user profile
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    currentAdminUser = user;
    currentAdminProfile = profile || { role: "admin", display_name: "Parure Master Admin" };

    // Update Header & Settings Profile info across DOM
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

    if (typeof onLoaded === "function") {
      await onLoaded(currentAdminUser, currentAdminProfile);
    }

    return true;
  } catch (err) {
    console.error("[Auth] Admin verification error:", err);
    showAuthView("Authentication failed. Please verify admin credentials.");
    return false;
  }
}

export function initAuth(supabase, onLoginSuccess) {
  // Password Visibility Toggle
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

  // Login form submission
  document.getElementById("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById("login-email");
    const passInput = document.getElementById("login-password");
    const btn = document.getElementById("btn-login");

    const email = emailInput?.value.trim().toLowerCase();
    const password = passInput?.value;

    if (!email || !password) {
      showAuthView("Please provide email and password.");
      return;
    }

    if (email !== MASTER_ADMIN_EMAIL) {
      showAuthView(`Access Denied: Only ${MASTER_ADMIN_EMAIL} is authorized as Master Admin.`);
      return;
    }

    if (btn) {
      btn.innerText = "AUTHENTICATING...";
      btn.disabled = true;
    }

    try {
      let { data, error } = await supabase.auth.signInWithPassword({ email, password });

      // Fallback auto-provision if user does not exist yet in test environment
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

      if (error) {
        showAuthView(`Authentication Error: ${error.message}`);
      } else if (data?.user) {
        showSuccess("Authenticated as Master Admin");
        await verifyAndLoadAdmin(supabase, data.user, onLoginSuccess);
      }
    } catch (err) {
      showAuthView(`Unexpected error: ${err.message || err}`);
    } finally {
      if (btn) {
        btn.innerText = "ENTER ADMIN PORTAL";
        btn.disabled = false;
      }
    }
  });

  // Forgot password button
  document.getElementById("btn-forgot-password")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-forgot-password");
    if (btn) btn.disabled = true;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(MASTER_ADMIN_EMAIL, {
        redirectTo: window.location.href
      });

      if (error) {
        showAuthView("Reset Error: " + error.message);
        showError("Failed to dispatch reset link");
      } else {
        showAuthView("", `Password reset link sent to ${MASTER_ADMIN_EMAIL}! Please check your inbox.`);
        showSuccess(`Reset link sent to ${MASTER_ADMIN_EMAIL}`);
      }
    } catch (err) {
      showAuthView("Error: " + err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Logout button
  document.getElementById("btn-logout")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    currentAdminUser = null;
    currentAdminProfile = null;
    showAuthView("", "Signed out successfully.");
    showInfo("Signed out");
  });

  // Check existing session
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      if (session.user.email?.toLowerCase() === MASTER_ADMIN_EMAIL) {
        verifyAndLoadAdmin(supabase, session.user, onLoginSuccess);
      } else {
        supabase.auth.signOut();
        showAuthView(`Access Denied: Only ${MASTER_ADMIN_EMAIL} is authorized.`);
      }
    } else {
      showAuthView();
    }
  });
}
