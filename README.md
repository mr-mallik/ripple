# Ripple

Turning separate reports of harassment on campus into one fast, joined-up response. Built for HudHackHer 2026.

> **Demo only.** Ripple uses fictional data. It must not be used to report a real incident. If you are in danger, call 999.

## What's in it

| Route | Who | What |
| --- | --- | --- |
| `/` | Judges | Landing page linking to both views |
| `/app` | Students (phone) | Report in seconds and anonymously, get a live heads-up nearby, ask for help making a formal report, walk-with-me check-in |
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
3. Add the environment variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, then deploy.
4. In Supabase, go to **Authentication → URL Configuration** and add your Vercel URL as the Site URL.

Location needs HTTPS on phones, so test the student app on the Vercel URL rather than your laptop's local network address.

## Stack

Next.js 16 (App Router), React 19, Tailwind CSS 4, Supabase (Postgres + PostGIS, Auth, Realtime), and Leaflet with OpenStreetMap tiles.
