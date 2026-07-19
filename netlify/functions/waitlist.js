// ─────────────────────────────────────────────────────────────────────
// Netlify Function: waitlist.js
// ─────────────────────────────────────────────────────────────────────
// Phase 1 — Waitlist flow for Parure La Plee
//
// What this function does:
//   1. Receives a POST with { email } from the frontend
//   2. Creates (or gracefully handles existing) contact in Resend Audience
//   3. Sends the Season Letter welcome email to new subscribers
//   4. Returns a clean JSON response
//
// Environment variables required (set in Netlify Dashboard):
//   - RESEND_API_KEY      — Your Resend API key
//   - RESEND_AUDIENCE_ID  — Your Resend Audience ID
//   - RESEND_FROM_EMAIL   — Verified sender (e.g. "The Season Letter <anne@parureapp.com>")
//
// The Resend Audience is the single source of truth for the waitlist.
// No Supabase. No duplicate emails. No exposed API keys.
// ─────────────────────────────────────────────────────────────────────

import { Resend } from 'resend';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Initialize Resend client (runs once per cold start) ──────────────
const resend = new Resend(process.env.RESEND_API_KEY);

// ── Load the welcome email HTML template at cold start ───────────────
// The template lives at emails/season_letter_welcome_template.html
// We read it once and cache it in memory for all subsequent requests.
let welcomeEmailHtml = '';
try {
  // Resolve the path relative to the project root.
  // In Netlify Functions, process.cwd() points to the project root.
  const templatePath = resolve(process.cwd(), 'emails', 'season_letter_welcome_template.html');
  welcomeEmailHtml = readFileSync(templatePath, 'utf-8');
  console.log('[waitlist] ✓ Welcome email template loaded successfully');
} catch (err) {
  console.error('[waitlist] ✗ Failed to load welcome email template:', err.message);
  // Function will still work — contact will be added to audience,
  // but the welcome email will contain a fallback message.
}

// ── Simple email validation ──────────────────────────────────────────
function isValidEmail(email) {
  // RFC-5322 simplified — good enough for a waitlist form
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── CORS headers (allows frontend to call this function) ─────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Helper: build a JSON Response ────────────────────────────────────
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Main handler — Netlify Functions v2 (ESM default export)
// ─────────────────────────────────────────────────────────────────────
export default async (req, context) => {

  // ── Handle CORS preflight ────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ── Only accept POST ─────────────────────────────────────────────
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  // ── Parse the request body ───────────────────────────────────────
  let email;
  try {
    const body = await req.json();
    email = body.email?.trim().toLowerCase();
  } catch (err) {
    console.error('[waitlist] ✗ Invalid JSON body:', err.message);
    return jsonResponse({ success: false, error: 'Invalid request body' }, 400);
  }

  // ── Validate the email ───────────────────────────────────────────
  if (!email || !isValidEmail(email)) {
    console.warn('[waitlist] ✗ Invalid email received:', email);
    return jsonResponse({ success: false, error: 'A valid email is required' }, 400);
  }

  console.log(`[waitlist] → Processing signup for: ${email}`);

  // ── Configuration ────────────────────────────────────────────────
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'The Season Letter <anne@parureapp.com>';
  const emailSubject = 'Welcome to The Season Letter ✦';

  if (!audienceId) {
    console.error('[waitlist] ✗ RESEND_AUDIENCE_ID is not set');
    return jsonResponse({ success: false, error: 'Server configuration error' }, 500);
  }

  // ─────────────────────────────────────────────────────────────────
  // Step 1: Add contact to Resend Audience
  // ─────────────────────────────────────────────────────────────────
  let isNewContact = true;

  try {
    const { data, error } = await resend.contacts.create({
      email: email,
      unsubscribed: false,
      audienceId: audienceId,
    });

    if (error) {
      // ── Handle duplicate gracefully ────────────────────────────
      // Resend returns a validation_error when the contact already exists.
      // This is expected behavior — treat it as success, skip welcome email.
      if (error.name === 'validation_error' || error.message?.includes('already exists')) {
        console.log(`[waitlist] ℹ Contact already exists: ${email} — skipping welcome email`);
        isNewContact = false;
      } else {
        // Unexpected error — log it but still return success to the user
        console.error('[waitlist] ✗ Resend contacts.create error:', JSON.stringify(error));
        // Return success anyway — the email was already captured by Netlify Forms
        return jsonResponse({ success: true, message: 'Signed up successfully' });
      }
    } else {
      console.log(`[waitlist] ✓ New contact created: ${email} (id: ${data?.id})`);
    }
  } catch (err) {
    console.error('[waitlist] ✗ Resend contacts.create exception:', err.message);
    // Return success — Netlify Forms has the email as a fallback
    return jsonResponse({ success: true, message: 'Signed up successfully' });
  }

  // ─────────────────────────────────────────────────────────────────
  // Step 2: Send welcome email (only for NEW subscribers)
  // ─────────────────────────────────────────────────────────────────
  if (isNewContact) {
    // Use the loaded HTML template, or a minimal fallback if template failed to load
    const htmlContent = welcomeEmailHtml || `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;text-align:center;">
        <h1 style="font-size:28px;color:#1A1A18;">Welcome to The Season Letter ✦</h1>
        <p style="font-size:16px;color:#3A3733;line-height:1.6;">
          Thank you for joining the Parure La Plee waitlist. We'll be in touch soon with updates, 
          early access, and everything you need to know before launch.
        </p>
        <p style="font-size:14px;color:#7A7468;margin-top:30px;">— The Parure La Plee Team</p>
      </div>
    `;

    try {
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: [email],
        subject: emailSubject,
        html: htmlContent,
      });

      if (error) {
        // Log but don't fail — the contact is already in the audience
        console.error('[waitlist] ✗ Welcome email send error:', JSON.stringify(error));
      } else {
        console.log(`[waitlist] ✓ Welcome email sent to: ${email} (id: ${data?.id})`);
      }
    } catch (err) {
      console.error('[waitlist] ✗ Welcome email send exception:', err.message);
      // Don't fail — contact is in the audience, email can be retried later
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Step 3: Return success
  // ─────────────────────────────────────────────────────────────────
  console.log(`[waitlist] ✓ Signup complete for: ${email} (new: ${isNewContact})`);
  return jsonResponse({
    success: true,
    message: isNewContact ? 'Welcome! Check your inbox.' : 'You\'re already on the list!',
  });
};
