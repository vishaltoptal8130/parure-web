// ─────────────────────────────────────────────────────────────────────
// Season Letter — send calendar + late-signup catch-up helpers
// Timezone: America/New_York (Florida / S9 Enterprises)
// ─────────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs';
import { resolve } from 'path';

/** @typedef {{ id: string, sendDate: string, subject: string, file: string, preview?: string }} SeasonLetterIssue */

/** Weekly build-up + launch. Dates are YYYY-MM-DD in America/New_York. */
export const SEASON_LETTER_ISSUES = /** @type {SeasonLetterIssue[]} */ ([
  {
    id: 'nl1',
    sendDate: '2026-08-11',
    subject: 'Welcome, Founding Member',
    file: 'broadcast_1_aug11.html',
  },
  {
    id: 'nl2',
    sendDate: '2026-08-18',
    subject: 'The Question Behind Everything We Build',
    file: 'broadcast_2_aug18.html',
  },
  {
    id: 'nl3',
    sendDate: '2026-08-25',
    subject: 'What We Hope You Feel',
    file: 'broadcast_3_aug25.html',
  },
  {
    id: 'nl4',
    sendDate: '2026-09-01',
    subject: 'The Pieces You Keep Reaching Past',
    file: 'broadcast_4_sept1.html',
  },
  {
    id: 'nl5',
    sendDate: '2026-09-08',
    subject: 'Inside the Community Closet',
    file: 'broadcast_5_sept8.html',
  },
  {
    id: 'nl6',
    sendDate: '2026-09-15',
    subject: 'Packed Before You Even Left',
    file: 'broadcast_6_sept15.html',
  },
  {
    id: 'nl7',
    sendDate: '2026-09-22',
    subject: 'Seven Days Out',
    file: 'broadcast_7_sept22.html',
  },
  {
    id: 'launch',
    sendDate: '2026-09-29',
    subject: "It's Here",
    file: 'broadcast_8_launch_sept29.html',
  },
]);

const TZ = 'America/New_York';

/** Today's calendar date in America/New_York as YYYY-MM-DD */
export function todayInEastern(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Issues already sent (send date is strictly before today in Eastern).
 * Same-day joiners still get that day's scheduled Resend Broadcast —
 * catch-up only covers emails that already went out on a prior day.
 */
export function getMissedIssues(now = new Date()) {
  const today = todayInEastern(now);
  return SEASON_LETTER_ISSUES.filter((issue) => issue.sendDate < today);
}

const htmlCache = new Map();

export function loadIssueHtml(file) {
  if (htmlCache.has(file)) return htmlCache.get(file);
  try {
    const path = resolve(process.cwd(), 'emails', file);
    const html = readFileSync(path, 'utf-8');
    htmlCache.set(file, html);
    return html;
  } catch (err) {
    console.error(`[season-letter] ✗ Failed to load ${file}:`, err.message);
    htmlCache.set(file, '');
    return '';
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send missed Season Letter issues to a late signup.
 * Welcome is sent separately by waitlist.js before this runs.
 *
 * @param {import('resend').Resend} resend
 * @param {{ email: string, fromEmail: string, now?: Date }} opts
 */
export async function sendCatchUpEmails(resend, { email, fromEmail, now = new Date() }) {
  const missed = getMissedIssues(now);
  if (missed.length === 0) {
    console.log(`[season-letter] No catch-up needed for ${email} (nothing sent yet)`);
    return { sent: [], skipped: [] };
  }

  console.log(
    `[season-letter] Catch-up for ${email}: ${missed.map((i) => i.id).join(', ')} (${missed.length} issue(s))`
  );

  const sent = [];
  const skipped = [];

  for (let i = 0; i < missed.length; i++) {
    const issue = missed[i];
    const html = loadIssueHtml(issue.file);
    if (!html) {
      skipped.push(issue.id);
      continue;
    }

    try {
      const { data, error } = await resend.emails.send(
        {
          from: fromEmail,
          to: [email],
          subject: issue.subject,
          html,
        },
        { idempotencyKey: `season-letter-${issue.id}:${email}` }
      );

      if (error) {
        console.error(`[season-letter] ✗ Catch-up ${issue.id} failed:`, JSON.stringify(error));
        skipped.push(issue.id);
      } else {
        console.log(`[season-letter] ✓ Catch-up ${issue.id} sent to ${email} (id: ${data?.id})`);
        sent.push(issue.id);
      }
    } catch (err) {
      console.error(`[season-letter] ✗ Catch-up ${issue.id} exception:`, err.message);
      skipped.push(issue.id);
    }

    // Small gap between sends (keeps one request under function timeout)
    if (i < missed.length - 1) {
      await sleep(400);
    }
  }

  return { sent, skipped };
}
