# Ripple

Turning separate reports of harassment on campus into one fast, joined-up response. Built for HudHackHer 2026.

> **Demo only.** Ripple uses fictional data. It must not be used to report a real incident. If you are in danger, call 999.

## What's in it

| Route | Who | What |
| --- | --- | --- |
| `/` | Judges | Landing page linking to both views |
| `/app` | Students (phone or desktop) | Built from the Figma prototype. Report in seconds and anonymously, see live heads-up zones on a map of where you are, ask for help making a formal report (with a reference number), walk together or share your route, and support contacts |
| `/security` | Campus security (desktop) | Live map, cluster alerts with a combined summary, acknowledge / assign / close, response log, walks needing help, demo replay |

**How clustering works:** when a report is saved, a database trigger (`public.assign_cluster`) looks for other reports within **400 m and 30 minutes**. Two or more open a cluster, log it, and send one general heads-up to the area. The heads-up holds only a rounded location and a fixed message, never report details. Closing a cluster ends its heads-up.

**Safeguards in the data layer (row-level security):**

- Students sign in anonymously, so there's no name or sign-up. They can only read their own reports and walks.
- Only accounts in `public.staff` can read reports, clusters, the response log and walks.
- Students can't edit what they reported, only their follow-up choices.
- Public heads-ups never include descriptions or details.

## Run it locally

1. Copy `.env.example` to `.env.local` and fill in your Supabase URL and publishable key.
2. In Supabase, run the SQL files in `supabase/migrations/` in order (SQL Editor → New query → Run).
3. In Supabase, turn on **Authentication → Sign In / Providers → Allow anonymous sign-ins**.
4. Create a staff account. In Supabase, go to **Authentication → Users → Add user** (auto-confirm), then run:
   ```sql
   insert into public.staff (user_id, display_name)
   select id, 'Campus Security' from auth.users where email = 'you@example.com';
   ```
5. Run `npm install`, then `npm run dev`, and open http://localhost:3000.

## Running the demo

1. Open `/security` on the laptop and sign in.
2. Open `/app` on a phone, or in a narrow window. Allow location so both views centre on you. Without location, they show Queensgate campus.
3. Press **Reset demo** for a clean start. Then either send two reports from the phone, or press **Play demo**. Play demo adds five fictional reports around the centre of the dashboard map over about 11 seconds. Four of them form a cluster and one far-off report stays on its own.
4. Watch the cluster alert appear on the dashboard and the heads-up arrive on the phone.

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, go to **Add New → Project**, import the repo, and keep the Next.js defaults.
3. Add the environment variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (and, if you have them, `NEXT_PUBLIC_CAMPUS_SECURITY_TEL` and `NEXT_PUBLIC_WELLBEING_TEL`), then deploy.
4. In Supabase, go to **Authentication → URL Configuration** and add your Vercel URL as the Site URL.

Location needs HTTPS on phones, so test the student app on the Vercel URL rather than your laptop's local network address.

## Accounts and Walk together

- **Reporting needs an account.** People who aren't logged in get a silent anonymous session so they can still see heads-ups and support numbers, but the database only accepts reports from account holders. "Send anonymously" still hides who reported from staff.
- **Accounts** use Supabase email and password. Sign-up details go into `public.profiles`, readable only by their owner.
- **Walk together** is for verified students: a confirmed account, marked as a student, with a university email (ending `.ac.uk` or `.edu`). Other students only ever see a first name, a destination area and a rounded walking time. Locations are rounded to about 100 m and are only readable through database functions.
- **Requests** (send, accept, meeting point, start) update live for both people. Each person's walk is a check-in that campus security can follow.
- **Blocks, concerns about other students, trusted contacts and formal report requests** are stored in the database. Staff see formal requests and concerns on the dashboard.

### Supabase settings for accounts

1. Run `supabase/migrations/20261118150000_accounts_and_walk_matching.sql` in the SQL Editor.
2. **Authentication → URL Configuration:** add `http://localhost:3000/app` and your Vercel `/app` URL to Redirect URLs.
3. **Authentication → Emails → Confirm signup:** add `{{ .Token }}` to the template so people get a 6-digit code as well as the link.
4. Supabase's built-in email sender only sends a few emails an hour. Set up custom SMTP (**Authentication → Emails → SMTP settings**) before real use.

## Stack

Next.js 16 (App Router), React 19, Tailwind CSS 4, Supabase (Postgres + PostGIS, Auth, Realtime), and Leaflet with OpenStreetMap tiles.
