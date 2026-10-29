# TrackSheet CRM

A lite version of the Quiethouse Recording CRM for independent audio professionals: recording studios, mixing engineers and mastering engineers. It keeps the business side in one place without the bloat.

Each studio runs its **own private copy** on free hosting accounts in its own name. Your clients, invoices and payments live in your database and go to your bank; nobody else (including the people who made TrackSheet) can see them.

## What's in it

| Area | What it does |
| --- | --- |
| **Clients** | Contacts and the artists or bands they belong to, notes, history of sessions, projects and invoices, CSV import, merge duplicates |
| **Calendar and booking** | Day, week and month calendar by room, holds and confirmed sessions, conflict warnings, recurring sessions, closed days, a private calendar feed for your phone |
| **Online booking page** | A public page (`/book/your-studio`) where clients pick a day and tell you about the project. You accept or decline with an email you can edit. You can embed it on your own website |
| **Projects** | Status, milestones (optionally billed), a song list moving from pre-production to done, sessions, notes and to-dos |
| **Quotes and invoices** | Price list, quotes clients accept online, invoices with deposits, card payments through your own Stripe, cash / Venmo / Zelle / check payments, refunds, print or save as PDF |
| **Client emails** | Booking received, accepted, confirmed, reminder, quote, invoice, receipt, payment reminders and overdue notices, all editable, with a preview before anything is sent |
| **Client page** | One private link per client with their upcoming sessions, what they owe and have paid, and project progress |
| **Dashboard** | Today's sessions, booking requests waiting, money received, unpaid and overdue invoices, monthly revenue chart, your to-dos |
| **Team and safety** | Team logins with roles (engineers don't see money), two-step login, weekly email backups, sign-in lockout, spam limits on the booking page |
| **Look** | Dark "night session" look with a light mode switch; works on phones |

## What you need

All of these have free plans. Setup takes about 20 minutes and no coding.

- A **GitHub** account (holds your copy of the code): [github.com/signup](https://github.com/signup)
- A **Vercel** account (runs the website): [vercel.com/signup](https://vercel.com/signup). Sign up with your GitHub account.
- Later, optional: a **Stripe** account for card payments and a **Resend** account for sending client emails.

> **About Vercel's free plan:** Vercel's free "Hobby" plan is for personal, non-commercial use. If you run your studio business on TrackSheet, Vercel expects you to be on the **Pro** plan (about $20 a month). Try everything on Hobby first, then upgrade under Vercel → Settings → Billing when you start using it for real.

---

## 1. Make your own copy of the code

1. Sign in to GitHub and open [github.com/dereck-boop/tracksheetcrm](https://github.com/dereck-boop/tracksheetcrm).
2. Click **Fork** (top right), then **Create fork**. You now have `github.com/<your-name>/tracksheetcrm`.

Forking (rather than downloading) is what lets you get updates later with one click.

## 2. Deploy to Vercel

1. In Vercel click **Add New… → Project**, find your `tracksheetcrm` fork and click **Import**.
2. Open **Environment Variables** on that screen and add these four (name on the left, value on the right):

   | Name | What to put |
   | --- | --- |
   | `AUTH_SECRET` | A long random password, at least 32 characters. Use a password generator (for example [1password.com/password-generator](https://1password.com/password-generator), set to 40 characters). **Never change it later**: everyone would be signed out and two-step login would need setting up again. |
   | `CRON_SECRET` | Another long random password (different from the first). It protects the daily reminder emails. |
   | `SETUP_CODE` | Any word or phrase you'll remember, e.g. `bluemoon-mixdown`. You type it once when you create your account, so a stranger who finds your new site can't claim it first. |
   | `STUDIO_TIMEZONE` | Your timezone, e.g. `America/New_York`, `America/Chicago`, `America/Denver`, `America/Los_Angeles`, `Europe/London`. [Full list](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) (use the "TZ identifier" column). |

3. Click **Deploy**. The first deploy **will fail** with "DATABASE_URL is not set". That's expected: the database comes next.
4. Open your new project in Vercel, go to the **Storage** tab, click **Create Database**, choose **Neon** (Serverless Postgres), accept the defaults (free plan, a region near you) and click **Create**. When asked, connect it to **all environments** (Production, Preview, Development).
5. Go to **Deployments**, click the **⋯** menu on the latest one and choose **Redeploy**. This time it builds your database tables and goes live (2 to 3 minutes).

Your site's address is shown at the top of the project page, e.g. `https://tracksheet-crm-yourname.vercel.app`.

## 3. Create your account

1. Open your site's address. You'll land on **Welcome! Set up your studio**.
2. Enter your studio name, your name, email, a password (10+ characters) and the `SETUP_CODE` you chose.
3. You're in. The setup page locks itself after this first account.

Then, in the sidebar:

- **Setup → Studio Settings**: email, phone, address, logo, invoice terms, ways to pay (Venmo, Zelle…), deposit rules, payment reminders and cancellation policy.
- **Setup → Studios / Rooms**: rename "Studio A", add rooms, set rates, and tick which ones clients can request online.
- **Setup → Price List**: your services and prices (mix per song, master per track, day rate…).
- **Account** (click your name, bottom left): turn on **two-step login**. Strongly recommended.

## 4. Turn on client emails (Resend)

Without this, everything works but no emails are sent (you can still copy links and send them yourself).

1. Create a free account at [resend.com](https://resend.com).
2. Under **Domains**, click **Add Domain** and enter the domain you own (the one in your studio email, e.g. `yourstudio.com`). Resend shows a few DNS records; add them where you bought the domain (GoDaddy, Squarespace, Namecheap, Google Domains…). Wait until Resend says **Verified** (minutes to a few hours).
3. Under **API Keys**, click **Create API Key** (sending access) and copy it (`re_…`).
4. In Vercel → your project → **Settings → Environment Variables**, add:
   - `RESEND_API_KEY`: the key you copied
   - `EMAIL_FROM`: the sender, e.g. `Blue Room Mastering <studio@yourstudio.com>` (must be on the verified domain)
5. **Redeploy** (Deployments → ⋯ → Redeploy), then in TrackSheet open **Setup → Client Emails** and click **Send me a test email**.

Client replies go to the email in Studio Settings. Each automatic email can be edited or turned off on the Client Emails page. Reminders go out every morning.

## 5. Turn on card payments (Stripe)

Without this, invoices still work and you record cash / Venmo / Zelle / check payments by hand.

1. Create or sign in to your [Stripe](https://dashboard.stripe.com) account. Start in **Test mode** (toggle at the top) to try it with fake cards.
2. **Developers → API keys**: copy the **Secret key** (`sk_test_…`, or `sk_live_…` when you go live).
3. **Developers → Webhooks → Add endpoint**:
   - Endpoint URL: `https://<your-site>/api/stripe/webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`
   - After saving, copy the **Signing secret** (`whsec_…`).
4. In Vercel → **Settings → Environment Variables**, add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, then **Redeploy**.

Invoices now show a **Pay by card** button. Payments are recorded automatically, invoices flip to Paid, clients get a receipt, and a paid deposit confirms its booking. The money goes straight to your Stripe account. When you switch Stripe to live mode, repeat steps 2 to 4 with the live key and a live webhook.

## 6. Put the booking page on your website

Your booking page is `https://<your-site>/book/<your-studio>`. **Bookings** has a **Copy link** button, and Studio Settings shows it too.

- **Link to it** from your website, Instagram bio or email signature, or
- **Embed it** on your website (Squarespace, Wix, WordPress: add a "Code" or "Embed" block):

  ```html
  <iframe src="https://<your-site>/book/<your-studio>?embed=1" data-studio-form style="width:100%;border:0" title="Book a session"></iframe>
  <script src="https://<your-site>/embed.js" async></script>
  ```

Clients pick a service and one or more days. You set the hours, then accept (as a hold or confirmed) or decline from the request.

## 7. Optional extras

- **Your own address** (e.g. `crm.yourstudio.com`): Vercel → **Settings → Domains → Add**, follow the DNS instructions, then add `APP_URL` = `https://crm.yourstudio.com` in Environment Variables and redeploy. If you use Stripe, update the webhook URL to the new address.
- **Phone calendar**: **Studio → Events & Closed Days → Create calendar address**, then subscribe to it in Google Calendar (Other calendars → From URL) or Apple Calendar.
- **Spam check on the booking page**: create a free Cloudflare Turnstile widget (dash.cloudflare.com → Turnstile → Add widget, your site's hostname, mode Managed) and add `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in Vercel.
- **Error alerts**: problems on the live site are emailed to your studio email (needs Resend). Set `ALERT_EMAIL` to send them elsewhere.
- **Team**: **Setup → Team** adds engineers and assistants. Engineers see the calendar, clients and projects but not quotes, invoices or money.

---

## Getting updates

When TrackSheet gets new features or fixes:

1. Open your fork on GitHub (`github.com/<your-name>/tracksheetcrm`).
2. Click **Sync fork → Update branch**.

Vercel redeploys automatically and updates your database tables as part of the deploy. Your data stays as it is.

## Backups

Every Monday, the owner gets an email with a full backup of the studio's data attached (needs Resend). **Studio Settings → Backups → Download everything** gets one any time. Passwords and two-step login keys are never in a backup.

### Restore from a backup

Ask someone comfortable with a terminal to run, against a new, empty Neon database:

```bash
DATABASE_URL="postgresql://…" npx prisma migrate deploy
DATABASE_URL="postgresql://…" npx tsx scripts/restore-backup.ts my-studio-backup-2026-10-26.json.gz
```

It prints a temporary password for everyone; change it after signing in. Then point the database in Vercel at the new one and redeploy.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Deploy fails with "DATABASE_URL is not set" | Step 2.4: create the Neon database in the Storage tab and connect it to all environments, then redeploy. |
| "AUTH_SECRET must be set to at least 32 characters" | Add or lengthen `AUTH_SECRET` in Environment Variables and redeploy. |
| Setup page says the code doesn't match | Type the exact `SETUP_CODE` from Vercel → Settings → Environment Variables. |
| No emails arrive | Check `RESEND_API_KEY` and `EMAIL_FROM`, that the domain is Verified in Resend, and use **Send me a test email**. |
| Card payments don't mark invoices paid | The Stripe webhook URL must be your current address + `/api/stripe/webhook`, and `STRIPE_WEBHOOK_SECRET` must be that webhook's signing secret. |
| Preview deploys fail with "Branch limit reached" | Neon's free plan allows 10 database branches. Delete old `preview/…` branches in Neon (keep `main`). |
| Dates or times are off by some hours | Set `STUDIO_TIMEZONE` to your timezone and redeploy. |

---

## For developers

**Stack:** Next.js 16 (App Router, server actions) · React 19 · TypeScript · PostgreSQL + Prisma 6 · Tailwind CSS 4 · Recharts · Stripe · Resend.

```bash
cp .env.example .env          # set DATABASE_URL and AUTH_SECRET
npm install
npx prisma migrate deploy     # create tables
npm run db:seed               # optional sample data: owner@example.com / studio-demo-pass
npm run dev                   # http://localhost:3000
```

- Money is stored in integer cents. Dates are stored in UTC and shown and entered in `STUDIO_TIMEZONE` (`lib/format.ts`).
- `scripts/vercel-build.sh` runs `prisma migrate deploy` before `next build`, so schema changes ship with each deploy. Add schema changes as new migrations; never edit an existing one.
- The daily job (`/api/cron/daily`, `vercel.json`) sends session and payment reminders, quote follow-ups, after-session thank-yous and the weekly backup. It runs at 13:00 UTC with a catch-up run at 21:00 UTC.
- Every `"use server"` file wraps its actions with `safe()` (`lib/safeAction.ts`): a thrown `Error` shows its message on the page instead of a crash.
- Edit-form `<select>`s are uncontrolled and keyed on the saved value, because React 19 resets forms after server actions.
- Checks: `npm run typecheck`, `npm run lint`, `npm test` (also run on every pull request).
