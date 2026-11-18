"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MapView from "@/components/MapView";
import { DemoBadge, Spinner, Toggle, btn } from "@/components/ui";
import { getStudentClient } from "@/lib/supabase";
import { clock, distanceMetres, timeAgo, useDeviceLocation, useNow, type LatLng } from "@/lib/geo";
import { CATEGORY_LABEL, type Alert, type Report, type ReportCategory, type Walk } from "@/lib/types";

type Screen = "home" | "what" | "where" | "sent" | "walk";

const REPORT_COLS =
  "id, category, lat, lng, details, is_anonymous, wants_formal_report, cluster_id, is_demo, created_at";
const WALK_COLS =
  "id, destination, start_lat, start_lng, last_lat, last_lng, expected_by, status, created_at, ended_at";

export default function StudentApp() {
  const supabase = getStudentClient();
  const loc = useDeviceLocation();
  const now = useNow(15000);

  const [auth, setAuth] = useState<{ status: "loading" | "ready" | "error"; message?: string }>({
    status: "loading",
  });
  const [screen, setScreen] = useState<Screen>("home");
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [lastReport, setLastReport] = useState<Report | null>(null);
  const [myReports, setMyReports] = useState<Report[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [walk, setWalk] = useState<Walk | null>(null);

  // Silent anonymous session: no name, no sign-up.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) {
          if (!cancelled) setAuth({ status: "error", message: error.message });
          return;
        }
      }
      if (!cancelled) setAuth({ status: "ready" });
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const loadMine = useCallback(async () => {
    const [{ data: reports }, { data: walks }] = await Promise.all([
      supabase.from("reports").select(REPORT_COLS).order("created_at", { ascending: false }).limit(10),
      supabase
        .from("walks")
        .select(WALK_COLS)
        .in("status", ["active", "help"])
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    setMyReports((reports as Report[]) ?? []);
    setWalk(((walks as Walk[]) ?? [])[0] ?? null);
  }, [supabase]);

  // Load my data and listen for heads-ups.
  useEffect(() => {
    if (auth.status !== "ready") return;
    const first = setTimeout(loadMine, 0);
    supabase
      .from("alerts")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .then(({ data }) => setAlerts((data as Alert[]) ?? []));

    const channel = supabase
      .channel("student-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" }, (payload) =>
        setAlerts((prev) => [payload.new as Alert, ...prev.filter((a) => a.id !== (payload.new as Alert).id)]),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "alerts" }, (payload) =>
        setAlerts((prev) => prev.map((a) => (a.id === (payload.new as Alert).id ? (payload.new as Alert) : a))),
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "alerts" }, (payload) =>
        setAlerts((prev) => prev.filter((a) => a.id !== (payload.old as { id: string }).id)),
      )
      .subscribe();
    return () => {
      clearTimeout(first);
      supabase.removeChannel(channel);
    };
  }, [auth.status, supabase, loadMine]);

  const nearbyAlert = useMemo(
    () =>
      alerts.find(
        (a) =>
          new Date(a.expires_at).getTime() > now &&
          !dismissed.includes(a.id) &&
          distanceMetres(loc.position, a) <= a.radius_m + 150,
      ) ?? null,
    [alerts, dismissed, loc.position, now],
  );

  if (auth.status === "loading") {
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center">
          <Spinner label="Opening Ripple…" />
        </div>
      </Shell>
    );
  }

  if (auth.status === "error") {
    return (
      <Shell>
        <div className="flex flex-col gap-3 rounded-2xl bg-card p-6">
          <h2 className="text-xl font-semibold">Ripple couldn&apos;t start</h2>
          <p>
            The app couldn&apos;t open an anonymous session. Anonymous sign-ins may be turned off in
            Supabase (Authentication → Sign In / Providers).
          </p>
          <p className="text-sm text-muted">Details: {auth.message}</p>
          <p className="font-semibold text-coral-deep">If you are in danger, call 999.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {nearbyAlert && (
        <HeadsUp alert={nearbyAlert} now={now} onDismiss={() => setDismissed((d) => [...d, nearbyAlert.id])} />
      )}

      {screen === "home" && (
        <Home
          now={now}
          reports={myReports}
          walk={walk}
          onReport={() => setScreen("what")}
          onWalk={() => setScreen("walk")}
        />
      )}

      {screen === "what" && (
        <WhatHappened
          onBack={() => setScreen("home")}
          onPick={(c) => {
            setCategory(c);
            setScreen("where");
          }}
        />
      )}

      {screen === "where" && category && (
        <WhereAndDetails
          category={category}
          here={loc.position}
          locSource={loc.source}
          locError={loc.error}
          onBack={() => setScreen("what")}
          onSent={(r) => {
            setLastReport(r);
            setScreen("sent");
            // The database links reports into clusters just after insert.
            setTimeout(loadMine, 1500);
          }}
        />
      )}

      {screen === "sent" && lastReport && (
        <Sent
          report={myReports.find((r) => r.id === lastReport.id) ?? lastReport}
          onFormal={async () => {
            const { data } = await supabase
              .from("reports")
              .update({ wants_formal_report: true })
              .eq("id", lastReport.id)
              .select(REPORT_COLS)
              .single();
            if (data) setLastReport(data as Report);
            loadMine();
          }}
          onDone={() => {
            setCategory(null);
            setScreen("home");
            loadMine();
          }}
        />
      )}

      {screen === "walk" && (
        <WalkWithMe
          walk={walk}
          here={loc.position}
          onChange={(w) => setWalk(w)}
          onBack={() => {
            setScreen("home");
            loadMine();
          }}
        />
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ layout */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 justify-center bg-paper">
      <div className="flex w-full max-w-md flex-col gap-5 px-4 pb-10 pt-4">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2" aria-label="Ripple home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={32} height={32} className="rounded-lg" />
            <span className="font-display text-xl font-bold text-navy">Ripple</span>
          </Link>
          <DemoBadge />
        </header>
        {children}
      </div>
    </div>
  );
}

function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="-ml-1 self-start rounded-lg px-1 py-1 font-semibold text-teal-deep">
      ← {label}
    </button>
  );
}

function DangerLine() {
  return (
    <a
      href="tel:999"
      className="flex items-center justify-between rounded-xl bg-navy px-4 py-3 text-paper"
    >
      <span>In danger right now?</span>
      <span className="font-display text-lg font-bold text-coral-soft">Call 999</span>
    </a>
  );
}

function Support() {
  const items = [
    { name: "Emergency", detail: "Police, ambulance", tel: "999" },
    { name: "Police non-emergency", detail: "Report after the event", tel: "101" },
    { name: "Victim Support", detail: "Free, confidential, 24/7", tel: "08081689111", shown: "0808 168 9111" },
  ];
  return (
    <section className="flex flex-col gap-3" aria-labelledby="support-h">
      <h3 id="support-h" className="text-lg font-semibold">
        Support
      </h3>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-card">
        {items.map((i) => (
          <li key={i.tel}>
            <a href={`tel:${i.tel}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper">
              <span className="flex flex-col">
                <span className="font-semibold text-navy">{i.name}</span>
                <span className="text-sm text-muted">{i.detail}</span>
              </span>
              <span className="font-display font-bold text-teal-deep">{i.shown ?? i.tel}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">Your university&apos;s security team number is on your student card.</p>
    </section>
  );
}

/* ------------------------------------------------------------------ heads-up */

function HeadsUp({ alert, now, onDismiss }: { alert: Alert; now: number; onDismiss: () => void }) {
  return (
    <div role="alert" className="rise flex flex-col gap-3 rounded-2xl border-l-[6px] border-amber bg-amber-wash p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-lg font-bold text-navy">Heads-up near you</p>
        <span className="shrink-0 text-sm text-muted">{timeAgo(alert.created_at, now)}</span>
      </div>
      <p className="text-ink">{alert.message}</p>
      <div className="flex gap-2">
        <a href="tel:999" className={btn.small}>
          Call 999
        </a>
        <button onClick={onDismiss} className={btn.small}>
          Got it
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ home */

function Home({
  now,
  reports,
  walk,
  onReport,
  onWalk,
}: {
  now: number;
  reports: Report[];
  walk: Walk | null;
  onReport: () => void;
  onWalk: () => void;
}) {
  return (
    <>
      <section className="rise flex flex-col gap-4 rounded-3xl bg-navy p-6 text-mist">
        <h1 className="text-3xl font-bold text-paper">Something happened?</h1>
        <p>Report it in seconds. You stay anonymous unless you choose otherwise.</p>
        <button onClick={onReport} className={`${btn.primary} min-h-20 text-2xl`}>
          Report
        </button>
      </section>

      <button
        onClick={onWalk}
        className="rise flex items-center justify-between gap-4 rounded-2xl border-t-[6px] border-teal bg-card p-5 text-left"
      >
        <span className="flex flex-col gap-1">
          <span className="font-display text-lg font-bold text-navy">
            {walk ? `Walking to ${walk.destination}` : "Walk with me"}
          </span>
          <span className="text-sm text-muted">
            {walk
              ? walk.status === "help"
                ? "Security have been alerted"
                : `Check in by ${clock(walk.expected_by)}`
              : "Security keep an eye out until you check in."}
          </span>
        </span>
        <span aria-hidden="true" className="text-2xl text-teal">
          →
        </span>
      </button>

      {reports.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="mine-h">
          <h3 id="mine-h" className="text-lg font-semibold">
            Your reports
          </h3>
          <ul className="flex flex-col gap-2">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 rounded-2xl bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-navy">{CATEGORY_LABEL[r.category]}</span>
                  <span className="text-sm text-muted">{timeAgo(r.created_at, now)}</span>
                </div>
                <span className="text-sm text-muted">
                  {r.cluster_id
                    ? "Linked with other reports nearby. Security have been alerted."
                    : "Received by campus security."}
                  {r.wants_formal_report && " You asked for help making a formal report."}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Support />
    </>
  );
}

/* ------------------------------------------------------------------ what happened */

function WhatHappened({ onBack, onPick }: { onBack: () => void; onPick: (c: ReportCategory) => void }) {
  const options: { c: ReportCategory; hint: string }[] = [
    { c: "grabbed", hint: "Someone touched or held you" },
    { c: "followed", hint: "Someone followed you" },
    { c: "verbal", hint: "Comments, shouting, threats" },
    { c: "other", hint: "Anything that made you feel unsafe" },
  ];
  return (
    <>
      <BackButton onClick={onBack} />
      <h1 className="text-3xl font-bold">What happened?</h1>
      <DangerLine />
      <div className="grid gap-3">
        {options.map(({ c, hint }, i) => (
          <button
            key={c}
            onClick={() => onPick(c)}
            style={{ animationDelay: `${i * 50}ms` }}
            className="rise flex min-h-20 flex-col items-start justify-center gap-1 rounded-2xl border-l-[6px] border-coral bg-card px-5 py-4 text-left transition hover:bg-coral-wash"
          >
            <span className="font-display text-xl font-bold text-navy">{CATEGORY_LABEL[c]}</span>
            <span className="text-sm text-muted">{hint}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ where and details */

function WhereAndDetails({
  category,
  here,
  locSource,
  locError,
  onBack,
  onSent,
}: {
  category: ReportCategory;
  here: LatLng;
  locSource: "device" | "fallback";
  locError: string | null;
  onBack: () => void;
  onSent: (r: Report) => void;
}) {
  const supabase = getStudentClient();
  // The pin follows the device until the person places it themselves.
  const [manualPin, setManualPin] = useState<LatLng | null>(null);
  const pinMoved = manualPin !== null;
  const pin = manualPin ?? here;
  const recenterKey = pinMoved ? "manual" : `${here.lat},${here.lng}`;
  const [details, setDetails] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    const { data, error } = await supabase
      .from("reports")
      .insert({
        category,
        lat: pin.lat,
        lng: pin.lng,
        details: details.trim() || null,
        is_anonymous: anonymous,
      })
      .select(REPORT_COLS)
      .single();
    setSending(false);
    if (error || !data) {
      setError("Your report didn't send. Check your connection and try again. If you're in danger, call 999.");
      return;
    }
    onSent(data as Report);
  }

  return (
    <>
      <BackButton onClick={onBack} />
      <div className="flex flex-col gap-1">
        <p className="font-display text-sm font-bold uppercase tracking-wider text-coral-deep">
          {CATEGORY_LABEL[category]}
        </p>
        <h1 className="text-3xl font-bold">Where did it happen?</h1>
      </div>

      <div className="flex flex-col gap-2">
        <MapView
          label="Map: drag the pin or tap where it happened"
          center={pin}
          recenterKey={recenterKey}
          zoom={17}
          pin={pin}
          me={locSource === "device" ? here : null}
          onPinMove={setManualPin}
          className="h-72 w-full overflow-hidden rounded-2xl"
        />
        <div className="flex items-center justify-between gap-3 text-sm text-muted">
          <span>{locError ?? (pinMoved ? "Pin placed by you." : "Pin is at your current location.")}</span>
          {pinMoved && (
            <button
              className="shrink-0 font-semibold text-teal-deep"
              onClick={() => setManualPin(null)}
            >
              Use my location
            </button>
          )}
        </div>
      </div>

      <label className="flex flex-col gap-2">
        <span className="font-semibold text-navy">Anything else? (optional)</span>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="For example, which way they went"
          className="rounded-2xl border border-line bg-card p-4 text-base"
        />
        <span className="text-sm text-muted">
          Please don&apos;t include names. What you write goes to campus security only and is never shown publicly.
        </span>
      </label>

      <Toggle
        checked={anonymous}
        onChange={setAnonymous}
        label="Stay anonymous"
        hint={anonymous ? "Security won't know who you are." : "Security may ask to follow up with you in the app."}
      />

      {error && (
        <p role="alert" className="rounded-xl bg-coral-wash p-3 text-coral-deep">
          {error}
        </p>
      )}

      <button onClick={send} disabled={sending} className={btn.primary}>
        {sending ? "Sending…" : "Send report"}
      </button>
    </>
  );
}

/* ------------------------------------------------------------------ sent */

function Sent({ report, onFormal, onDone }: { report: Report; onFormal: () => Promise<void>; onDone: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <section className="rise flex flex-col gap-3 rounded-3xl bg-teal p-6 text-white">
        <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl text-teal">
          ✓
        </span>
        <h1 className="text-3xl font-bold text-white">Report sent</h1>
        <p>
          Sent at {clock(report.created_at)}. Campus security can see it on their map now.
          {report.cluster_id
            ? " It has been linked with other reports nearby, so security have been alerted."
            : " If anyone else reports something nearby, Ripple will link the reports."}
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-card p-5">
        <h3 className="text-lg font-semibold">What would you like to do next?</h3>
        {report.wants_formal_report ? (
          <p className="rounded-xl bg-teal-wash p-3 text-teal-deep">
            Thanks. Security will help you make a formal report. Nothing happens without your say-so.
          </p>
        ) : (
          <button
            className={btn.quiet}
            disabled={asking}
            onClick={async () => {
              setAsking(true);
              await onFormal();
              setAsking(false);
            }}
          >
            I&apos;d like to make a formal report
          </button>
        )}
        <p className="text-sm text-muted">
          You don&apos;t have to. Your report still helps security spot patterns either way.
        </p>
      </section>

      <Support />

      <button onClick={onDone} className={btn.teal}>
        Done
      </button>
    </>
  );
}

/* ------------------------------------------------------------------ walk with me */

function WalkWithMe({
  walk,
  here,
  onChange,
  onBack,
}: {
  walk: Walk | null;
  here: LatLng;
  onChange: (w: Walk | null) => void;
  onBack: () => void;
}) {
  const supabase = getStudentClient();
  const [destination, setDestination] = useState("");
  const [minutes, setMinutes] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("walks")
      .insert({
        destination: destination.trim(),
        start_lat: here.lat,
        start_lng: here.lng,
        last_lat: here.lat,
        last_lng: here.lng,
        expected_by: new Date(Date.now() + minutes * 60000).toISOString(),
      })
      .select(WALK_COLS)
      .single();
    setBusy(false);
    if (error || !data) {
      setError("Couldn't start the walk. Check your connection and try again.");
      return;
    }
    onChange(data as Walk);
  }

  if (walk) return <ActiveWalk walk={walk} here={here} onChange={onChange} onBack={onBack} />;

  return (
    <>
      <BackButton onClick={onBack} />
      <h1 className="text-3xl font-bold">Walk with me</h1>
      <p>
        Tell us where you&apos;re heading. Security can see your walk until you check in, and if you
        don&apos;t arrive on time they&apos;ll know.
      </p>

      <label className="flex flex-col gap-2">
        <span className="font-semibold text-navy">Where are you going?</span>
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          maxLength={120}
          placeholder="For example, Storthes Hall bus stop"
          className="min-h-14 rounded-2xl border border-line bg-card px-4 text-base"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold text-navy">How long will it take?</legend>
        <div className="grid grid-cols-4 gap-2">
          {[10, 15, 20, 30].map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={minutes === m}
              onClick={() => setMinutes(m)}
              className={`min-h-12 rounded-xl border font-semibold ${
                minutes === m ? "border-teal bg-teal text-white" : "border-line bg-card text-navy"
              }`}
            >
              {m} min
            </button>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-xl bg-coral-wash p-3 text-coral-deep">
          {error}
        </p>
      )}

      <button onClick={start} disabled={busy || !destination.trim()} className={btn.teal}>
        {busy ? "Starting…" : "Start walk"}
      </button>
      <DangerLine />
    </>
  );
}

function ActiveWalk({
  walk,
  here,
  onChange,
  onBack,
}: {
  walk: Walk;
  here: LatLng;
  onChange: (w: Walk | null) => void;
  onBack: () => void;
}) {
  const supabase = getStudentClient();
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const left = new Date(walk.expected_by).getTime() - now;
  const overdue = left <= 0;
  const mm = Math.floor(Math.abs(left) / 60000);
  const ss = Math.floor((Math.abs(left) % 60000) / 1000)
    .toString()
    .padStart(2, "0");

  // Share the latest position every 20 seconds while walking.
  useEffect(() => {
    const id = setInterval(() => {
      supabase.from("walks").update({ last_lat: here.lat, last_lng: here.lng }).eq("id", walk.id).then(() => {});
    }, 20000);
    return () => clearInterval(id);
  }, [supabase, walk.id, here.lat, here.lng]);

  async function update(patch: Partial<Walk>) {
    setBusy(true);
    const { data } = await supabase
      .from("walks")
      .update({ ...patch, last_lat: here.lat, last_lng: here.lng })
      .eq("id", walk.id)
      .select(WALK_COLS)
      .single();
    setBusy(false);
    return data as Walk | null;
  }

  return (
    <>
      <BackButton onClick={onBack} label="Home" />
      <section
        className={`flex flex-col gap-2 rounded-3xl p-6 ${
          walk.status === "help" ? "bg-coral text-white" : overdue ? "bg-amber-wash" : "bg-navy text-mist"
        }`}
        aria-live="polite"
      >
        <p className={`text-sm font-semibold uppercase tracking-wider ${walk.status === "help" ? "text-white" : overdue ? "text-amber" : "text-coral-soft"}`}>
          {walk.status === "help" ? "Help requested" : overdue ? "Overdue" : "Walking"}
        </p>
        <h1 className={`text-2xl font-bold ${walk.status === "help" || !overdue ? "text-paper" : "text-navy"}`}>
          To {walk.destination}
        </h1>
        {walk.status === "help" ? (
          <p>Security can see your location and have been alerted. If you are in danger, call 999.</p>
        ) : (
          <p className={overdue ? "text-ink" : ""}>
            {overdue ? `You were due ${mm}:${ss} ago. Check in if you're safe.` : `Check in within ${mm}:${ss}`}
          </p>
        )}
      </section>

      <MapView
        label="Map showing your location"
        center={here}
        recenterKey={`${here.lat.toFixed(4)},${here.lng.toFixed(4)}`}
        me={here}
        className="h-56 w-full overflow-hidden rounded-2xl"
      />

      <div className="grid gap-3">
        <button
          className={btn.teal}
          disabled={busy}
          onClick={async () => {
            await update({ status: "arrived", ended_at: new Date().toISOString() });
            onChange(null);
            onBack();
          }}
        >
          I&apos;ve arrived safely
        </button>
        {walk.status !== "help" && (
          <button
            className={btn.primary}
            disabled={busy}
            onClick={async () => {
              const w = await update({ status: "help" });
              if (w) onChange(w);
            }}
          >
            I need help
          </button>
        )}
        <button
          className={btn.quiet}
          disabled={busy}
          onClick={async () => {
            const base = Math.max(Date.now(), new Date(walk.expected_by).getTime());
            const w = await update({ expected_by: new Date(base + 5 * 60000).toISOString() });
            if (w) onChange(w);
          }}
        >
          Add 5 minutes
        </button>
        <button
          className="py-2 text-sm font-semibold text-muted"
          disabled={busy}
          onClick={async () => {
            await update({ status: "cancelled", ended_at: new Date().toISOString() });
            onChange(null);
            onBack();
          }}
        >
          Cancel walk
        </button>
      </div>
      <DangerLine />
    </>
  );
}
