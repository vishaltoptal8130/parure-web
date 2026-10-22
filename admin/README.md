# Parure La Plee — Executive Admin Console (`/admin/`)

A luxury fashion-tech operations console rebuild for **Parure La Plee**, crafted from scratch with an editorial haute-couture aesthetic, quiet luxury palette, and identical Supabase data operations.

---

## ✦ Key Architectural Enhancements

1. **Modular Architecture**:
   - `styles/tokens.css`: Core design system with CSS custom properties for dark mode (default) and editorial light mode (`data-theme="dark"` / `data-theme="light"`).
   - `styles/base.css`: Complete responsive layout, custom buttons, data-tables, modal animations, toast system, and printable tax invoice.
   - `js/config.js`: Centralized constants (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `MASTER_ADMIN_EMAIL`, `PLATFORM_FEE_RATE = 0.10`, `AFFILIATE_PAGE_SIZE = 25`).
   - `js/ui.js`: Toast notifications, luxury confirmation modal, theme engine, time & currency formatting helpers, and SVG vector library.
   - `js/storage.js`: Signed URL generator and in-memory cache layer for private Supabase Storage buckets (`wardrobe`, `closet`, `avatars`, `selfies`, `user-selfies`).
   - `js/auth.js`: Master admin gateway with email guard (`admin@parure.app`), password visibility toggle, forgot password flow, and RPC elevation.
   - `js/marketplace.js`: Showroom table, high-value queue, image carousel with lightbox, and authenticity toggles.
   - `js/app.js`: Master orchestrator coordinating all tabs, live metrics, 360° client dossiers, Expo push broadcast, and affiliate feeds.

2. **Feature Parity & Fixes**:
   - **Consolidated 10% Platform Fee**: Resolved previous inconsistency where some views used 8% while others used 10%.
   - **Forgot Password**: Password reset button is now present directly on the login screen.
   - **Dual Themes**: Instant seamless toggle between dark and light modes with localStorage persistence (`parure-admin-theme`).
   - **Printable Invoices**: Native browser print styling with clean white background and high-contrast typography, regardless of active theme.
   - **Fast Signed URL Cache**: Avoids redundant signed URL calls by caching in-memory with TTL.

---

## ✦ Running & Deploying

1. **Local Development**:
   Serve the repository root or open `/admin/index.html` via any static file server:
   ```bash
   # From the repository root:
   npx serve .
   # Then visit: http://localhost:3000/admin/
   ```

2. **Master Admin Credentials**:
   - Email: `admin@parure.app`
   - Role: Protected master administrator (elevated via `setup_master_admin_profile` RPC)
