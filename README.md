# Ripple

Women's safety support. Report harassment in seconds, get a live heads-up when several people report trouble nearby, walk home with a verified person, and find help any time.

> If you are in danger, call 999. Ripple doesn't replace the emergency services.

## What's in it

| Route | Who | What |
| --- | --- | --- |
| `/` | Everyone | Landing page linking to the app and the dashboard |
| `/app` | Anyone (phone or desktop) | Report anonymously, see live heads-up zones on a map of where you are, make a formal report, walk together or share your route, and find support contacts |
| `/security` | Safety teams (desktop) | Live map, cluster alerts with a combined summary, acknowledge / assign / close, response log, walks needing help, formal reports and concerns |

**How clustering works:** when a report is saved, a database trigger (`public.assign_cluster`) looks for reports from other people within **400 m and 30 minutes**. Two or more open a cluster, log it, and send one general heads-up to the area. The heads-up holds only a rounded location and a fixed message, never report details. Closing a cluster ends its heads-up.

**Safeguards in the data layer (row-level security):**

- People who aren't logged in get a silent anonymous session, so they can see heads-ups and support numbers. Only account holders can send reports.
- People can only read their own reports, walks, contacts and profile.
- Only accounts in `public.staff` can read reports, clusters, the response log, walks, formal reports and concerns.
- Reporters can't edit what they reported, only their follow-up choices.
- Public heads-ups never include descriptions or details.

## Accounts and Walk together

- **Accounts** use Supabase email and password, for individuals or groups (universities, venues, councils, charities). Sign-up details go into `public.profiles`, readable only by their owner. Group accounts wait for approval by the Ripple team.
- **Walk together** is for verified users: any confirmed individual account. Other people only ever see a first name, a destination area and a rounded walking time. Locations are rounded to about 100 m and are only readable through database functions.
- **Who can see me:** all verified users, students only (a university email ending `.ac.uk` or `.edu`), my trusted contacts only (matched by phone number), women only, or hidden.
- **Requests** (send, accept, meeting point, start) update live for both people. Each person's walk is a check-in that the safety team can follow.
- **Blocks, concerns about other users, trusted contacts and formal reports** are stored in the database. Staff see formal reports and concerns on the dashboard.

## Run it locally

1. Copy `.env.example` to `.env.local` and fill in your Supabase URL and publishable key.
2. In Supabase, run the SQL files in `supabase/migrations/` in order (SQL Editor → New query → Run).
3. In Supabase, turn on **Authentication → Sign In / Providers → Allow anonymous sign-ins**.
4. Create a staff account. In Supabase, go to **Authentication → Users → Add user** (auto-confirm), then run:
   ```sql
   insert into public.staff (user_id, display_name)
   select id, 'Safety Team' from auth.users where email = 'you@example.com';
   ```
5. Run `npm install`, then `npm run dev`, and open http://localhost:3000.

## Supabase Auth settings

1. **Authentication → URL Configuration:**
   - **Site URL:** your live address, for example `https://your-app.vercel.app`. Email links fall back to this, so it must not be `localhost` once you've deployed.
   - **Redirect URLs:** add `https://your-app.vercel.app/app` and `http://localhost:3000/app`.
2. **Authentication → Emails → Templates:** paste in the templates from `supabase/email-templates/`:
   - `confirm-signup.html` → **Confirm signup**
   - `reset-password.html` → **Reset password**

   They send a 6-digit code as well as a link. The link opens Ripple and waits for a tap before using the token, so email scanners in work and university mailboxes (which open links before you do) can't use it up.
3. Supabase's built-in email sender only sends a few emails an hour. Set up custom SMTP (**Authentication → Emails → SMTP settings**) before real use.
4. Turn on **leaked password protection** (Authentication → Settings).

## Running a demo

1. Open `/security` on the laptop and sign in.
2. Open `/app` on a phone, or in a narrow window, and log in. Allow location so both views centre on you.
3. Press **Reset demo** for a clean start. Then either send reports from two accounts, or press **Play demo**. Play demo adds five fictional reports around the centre of the dashboard map over about 11 seconds. Four of them form a cluster and one far-off report stays on its own.
4. Watch the cluster alert appear on the dashboard and the heads-up arrive on the phone.

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, go to **Add New → Project**, import the repo, and keep the Next.js defaults.
3. Add the environment variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Optionally add `NEXT_PUBLIC_SAFETY_TEAM_TEL` (your local safety team's number) and `NEXT_PUBLIC_WELLBEING_TEL`. Then deploy.
4. Update the Supabase Auth settings above with your Vercel address.

Location needs HTTPS on phones, so test the app on the Vercel URL rather than your laptop's local network address.

## Stack

Next.js 16 (App Router), React 19, Tailwind CSS 4, Supabase (Postgres + PostGIS, Auth, Realtime), and Leaflet with OpenStreetMap tiles.
