// Parure La Plee Admin: shared data layer for the new console pages.
// Live-only rule: marketplace_transactions and marketplace_listings carry a `livemode`
// flag (true = live Stripe / App Store build, false = Parure Sandbox). Every money and
// listing query here filters on livemode = true, so sandbox data never shows up.
import { SUPABASE_URL, SUPABASE_ANON_KEY, MASTER_ADMIN_EMAIL, PLATFORM_FEE_RATE } from "./config.js";

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export { MASTER_ADMIN_EMAIL, PLATFORM_FEE_RATE };

export const SETTLED = ["paid", "payout_pending", "paid_out"];

export async function requireAdmin() {
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;
  if (!user || user.email?.toLowerCase() !== MASTER_ADMIN_EMAIL) {
    if (user) await supabase.auth.signOut();
    location.replace("login.html");
    return null;
  }
  try { await supabase.rpc("setup_master_admin_profile", { p_email: MASTER_ADMIN_EMAIL }); } catch (e) {}
  const { data: profile } = await supabase.from("user_profiles").select("*").eq("id", user.id).single();
  return { user, profile };
}

export async function logout() {
  await supabase.auth.signOut();
  location.replace("login.html");
}

// Live-only queries
export const liveTx = (cols = "*") => supabase.from("marketplace_transactions").select(cols).eq("livemode", true);
export const liveListings = (cols = "*", opts) => supabase.from("marketplace_listings").select(cols, opts).eq("livemode", true);

// Money helpers (all DB amounts are integer cents)
export const usd = (cents, dec = 2) => "$" + (Number(cents || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
export function txParts(t) {
  const gross = t.amount ?? 0;
  const fee = t.platform_fee_amount ?? Math.round(gross * PLATFORM_FEE_RATE);
  const net = (t.seller_net_amount ?? gross - fee) - (t.seller_reversed_amount ?? 0);
  return { gross, fee, net };
}
export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  const m = s / 60; if (m < 60) return Math.round(m) + "m ago";
  const h = m / 60; if (h < 24) return Math.round(h) + "h ago";
  const d = h / 24; if (d < 60) return Math.round(d) + "d ago";
  return Math.round(d / 30) + "mo ago";
}
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
