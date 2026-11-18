"use client";

// The Ripple student app. Everything here runs on real data:
// reports, heads-ups (Supabase Realtime), formal report requests, accounts,
// Walk together matching between verified students, trusted contacts,
// blocks and walk check-ins that campus security can follow.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import MapView from "@/components/MapView";
import { Spinner } from "@/components/ui";
import { getStudentClient } from "@/lib/supabase";
import { clock, distanceMetres, timeAgo, useDeviceLocation, useNow, type LatLng } from "@/lib/geo";
import { DESTINATIONS, MEETING_POINTS, WALK_MINUTES, placeName, walkingMinutes } from "@/lib/places";
import { CAMPUS_SECURITY_HREF, EMERGENCY_CONTACTS, WELLBEING_CONTACTS } from "@/lib/contacts";
import {
  reportRef,
  type Alert,
  type NearbyWalker,
  type Report,
  type ReportCategory,
  type TrustedContact,
  type Visibility,
  type Walk,
  type WalkRequest,
} from "@/lib/types";
import Icon from "./Icon";
import NearbyMap from "./NearbyMap";
import { useStored } from "./useStored";
import { useAccount } from "./useAccount";
import { partnerOf, useWalkTogether } from "./useWalkTogether";
import {
  AppNav,
  Avatar,
  BottomAction,
  CallCard,
  Page,
  Radio,
  SecurityButton,
  Sheet,
  initialsOf,
  type AvatarColor,
  type Section,
} from "./parts";
import {
  EditProfile,
  ForgotPassword,
  IndividualSignup,
  LoginForm,
  OrganisationSignup,
  ProfileView,
  SetNewPassword,
  SignupType,
  VerifyEmail,
} from "./Account";

type Screen =
  | "home"
  | "incident"
  | "details"
  | "sent"
  | "formal"
  | "notice"
  | "walkIntro"
  | "walkNearby"
  | "together"
  | "liveWalk"
  | "arrived"
  | "supportServices"
  | "nearbyEmergency"
  | "mentalWellbeing"
  | "privacySafety"
  | "profile"
  | "login"
  | "forgot"
  | "signupType"
  | "individualSignup"
  | "organisationSignup"
  | "verify"
  | "editProfile";

const SECTION_OF: Record<Screen, Section> = {
  home: "home",
  incident: "report",
  details: "report",
  sent: "report",
  formal: "report",
  notice: "notice",
  walkIntro: "walk",
  walkNearby: "walk",
  together: "walk",
  liveWalk: "walk",
  arrived: "walk",
  supportServices: "support",
  nearbyEmergency: "support",
  mentalWellbeing: "support",
  privacySafety: "profile",
  profile: "profile",
  login: "profile",
  forgot: "profile",
  signupType: "profile",
  individualSignup: "profile",
  organisationSignup: "profile",
  verify: "profile",
  editProfile: "profile",
};
const TOP_LEVEL: Screen[] = ["home", "notice", "profile"];

const CATEGORIES: { value: ReportCategory; label: string; detail: string }[] = [
  { value: "grabbed", label: "Grabbed", detail: "Unwanted physical contact" },
  { value: "followed", label: "Followed", detail: "Someone followed or watched you" },
  { value: "verbal", label: "Verbal", detail: "Threats, comments, or harassment" },
  { value: "other", label: "Other", detail: "Something else happened" },
];

const VISIBILITY: { value: Visibility; label: string; short: string }[] = [
  { value: "all", label: "All verified students", short: "Visible to all verified students" },
  { value: "women", label: "Women only", short: "Visible to women only" },
  { value: "institution", label: "Students at my university", short: "Visible to students at your university" },
  { value: "hidden", label: "Hidden", short: "Hidden" },
];
const REPORT_REASONS = ["Made me uncomfortable", "Didn't turn up", "Fake profile", "Something else"];
const AVATAR_COLORS: AvatarColor[] = ["mint", "blue", "sand"];
const colorFor = (s: string) => AVATAR_COLORS[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % 3];

const REPORT_COLS =
  "id, category, lat, lng, details, is_anonymous, wants_formal_report, cluster_id, is_demo, created_at";
const WALK_COLS =
  "id, destination, start_lat, start_lng, last_lat, last_lng, expected_by, status, created_at, ended_at, mode, companion_name, request_id, feedback";
const WALK_COLS_BASIC =
  "id, destination, start_lat, start_lng, last_lat, last_lng, expected_by, status, created_at, ended_at";

const minutesFromNow = (m: number) => new Date(Date.now() + m * 60000).toISOString();
const smsLink = (number: string, body: string) => `sms:${number.replace(/\s+/g, "")}?body=${encodeURIComponent(body)}`;

type Person = { id: string; name: string };
type Arrival = { walkId: string; minutes: number; mode: Walk["mode"]; companion: string | null; partner: Person | null };

export default function StudentApp() {
  const supabase = getStudentClient();
  const account = useAccount();
  const me = account.user?.id ?? null;
  const loc = useDeviceLocation();
  const now = useNow(15000);
  const posRef = useRef<LatLng>(loc.position);
  useEffect(() => {
    posRef.current = loc.position;
  });

  /* ---------------------------------------------------------- navigation */

  const [screen, setScreen] = useState<Screen>("home");
  const [history, setHistory] = useState<Screen[]>([]);
  const screenRef = useRef(screen);
  useEffect(() => {
    screenRef.current = screen;
  });
  const go = useCallback((next: Screen) => {
    setHistory((h) => [...h, screenRef.current]);
    setScreen(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const back = () => {
    setScreen(history.at(-1) ?? "home");
    setHistory((h) => h.slice(0, -1));
  };
  const goTo = (next: Screen) => {
    setScreen(next);
    setHistory(next === "home" ? [] : ["home"]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goHome = () => goTo("home");
  // Where to go after logging in or signing up (for example, back to reporting).
  const [afterAuth, setAfterAuth] = useState<Screen | null>(null);
  const finishAuth = () => {
    goTo(afterAuth ?? "home");
    setAfterAuth(null);
  };

  /* --------------------------------------------------------------- toast */

  const [toast, setToast] = useState<{ text: string; action?: { label: string; run: () => void } } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), toast.action ? 6000 : 3000);
    return () => window.clearTimeout(id);
  }, [toast]);
  const say = useCallback(
    (text: string, action?: { label: string; run: () => void }) => setToast({ text, action }),
    [],
  );

  /* ------------------------------------------------------ heads-ups (live) */

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const ready = account.status === "ready";

  useEffect(() => {
    if (!ready) return;
    supabase
      .from("alerts")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .then(({ data }) => setAlerts((data as Alert[]) ?? []));

    const channel = supabase
      .channel("student-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" }, (payload) => {
        const a = payload.new as Alert;
        setAlerts((prev) => [a, ...prev.filter((x) => x.id !== a.id)]);
        if (distanceMetres(posRef.current, a) <= a.radius_m + 1000 && screenRef.current !== "notice") {
          say("New safety notice near you", { label: "View", run: () => go("notice") });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "alerts" }, (payload) =>
        setAlerts((prev) => prev.map((a) => (a.id === (payload.new as Alert).id ? (payload.new as Alert) : a))),
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "alerts" }, (payload) =>
        setAlerts((prev) => prev.filter((a) => a.id !== (payload.old as { id: string }).id)),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ready, supabase, say, go]);

  const liveAlerts = useMemo(() => alerts.filter((a) => new Date(a.expires_at).getTime() > now), [alerts, now]);
  const nearbyAlerts = useMemo(
    () =>
      liveAlerts
        .map((a) => ({ a, d: distanceMetres(loc.position, a) }))
        .filter(({ a, d }) => d <= a.radius_m + 1000)
        .sort((x, y) => x.d - y.d),
    [liveAlerts, loc.position],
  );
  const hasNotices = nearbyAlerts.length > 0;

  /* ------------------------------------------------------------- reports */

  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [details, setDetails] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [manualPin, setManualPin] = useState<LatLng | null>(null);
  const [sending, setSending] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [lastReport, setLastReport] = useState<Report | null>(null);
  const [formalSent, setFormalSent] = useState<string | null>(null);

  const pin = manualPin ?? loc.position;

  const resetReport = () => {
    setCategory(null);
    setDetails("");
    setAnonymous(true);
    setManualPin(null);
    setReportError(null);
  };
  const startReport = () => {
    resetReport();
    go("incident");
  };

  async function sendReport() {
    if (!category || !account.isMember) return;
    setSending(true);
    setReportError(null);
    const { data, error } = await supabase
      .from("reports")
      .insert({ category, lat: pin.lat, lng: pin.lng, details: details.trim() || null, is_anonymous: anonymous })
      .select(REPORT_COLS)
      .single();
    setSending(false);
    if (error || !data) {
      setReportError("Your report didn't send. Check your connection and try again. If you're in danger, call 999.");
      return;
    }
    const r = data as Report;
    setLastReport(r);
    setFormalSent(null);
    setScreen("sent");
    setHistory([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
    // The database links nearby reports into a cluster just after the insert.
    window.setTimeout(async () => {
      const { data: fresh } = await supabase.from("reports").select(REPORT_COLS).eq("id", r.id).single();
      if (fresh) setLastReport(fresh as Report);
    }, 1500);
  }

  /* ---------------------------------------------------------------- walks */

  const [destination, setDestination] = useStored("destination", { name: DESTINATIONS[0], minutes: 10 });
  const [walk, setWalk] = useState<Walk | null>(null);
  const [walkBusy, setWalkBusy] = useState(false);
  const [walkError, setWalkError] = useState<string | null>(null);
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const [arrivalFeedback, setArrivalFeedback] = useState<"good" | "not_good" | null>(null);
  const [focusRequest, setFocusRequest] = useState<string | null>(null);
  const creatingFor = useRef<string | null>(null);

  const wt = useWalkTogether({
    userId: me,
    verified: account.verified,
    posRef,
    onIncoming: (r) => {
      if (screenRef.current !== "walkNearby") {
        say(`${r.from_name} wants to walk with you`, { label: "View", run: () => go("walkNearby") });
      }
    },
    onUpdate: (r, before) => {
      if (r.from_user !== me || !before || before.status === r.status) return;
      if (r.status === "accepted") {
        if (screenRef.current !== "together") {
          setFocusRequest(r.id);
          say(`${r.to_name} accepted your walk request`, { label: "View", run: () => go("together") });
        }
      } else if (r.status === "declined") say(`${r.to_name} can't walk right now`);
    },
  });

  const loadWalk = useCallback(async () => {
    const query = (cols: string) =>
      supabase.from("walks").select(cols).in("status", ["active", "help"]).order("created_at", { ascending: false }).limit(1);
    let res = await query(WALK_COLS);
    // Before the accounts migration runs, the newer columns don't exist yet.
    if (res.error) res = await query(WALK_COLS_BASIC);
    setWalk(((res.data as unknown as Walk[]) ?? [])[0] ?? null);
  }, [supabase]);

  useEffect(() => {
    if (!ready || !me) return;
    const id = window.setTimeout(loadWalk, 0);
    return () => window.clearTimeout(id);
  }, [ready, me, loadWalk]);

  const startWalk = useCallback(
    async (opts: { mode: "solo" | "together" | "shared"; companion: string | null; requestId?: string }) => {
      setWalkBusy(true);
      setWalkError(null);
      const here = posRef.current;
      const { data, error } = await supabase
        .from("walks")
        .insert({
          destination: destination.name.slice(0, 120),
          start_lat: here.lat,
          start_lng: here.lng,
          last_lat: here.lat,
          last_lng: here.lng,
          expected_by: minutesFromNow(destination.minutes),
          mode: opts.mode,
          companion_name: opts.companion,
          request_id: opts.requestId ?? null,
        })
        .select(WALK_COLS)
        .single();
      setWalkBusy(false);
      if (error || !data) {
        setWalkError("Couldn't start the walk. Check your connection and try again.");
        return null;
      }
      const w = data as Walk;
      setWalk(w);
      return w;
    },
    [supabase, destination],
  );

  // When a walk together starts (by either person), each of us gets our own
  // walk record so campus security can follow both.
  const current = wt.current;
  useEffect(() => {
    const r = current?.status === "started" ? current : null;
    if (!r || walk?.request_id === r.id || creatingFor.current === r.id) return;
    creatingFor.current = r.id;
    window.setTimeout(async () => {
      const { data: existing } = await supabase.from("walks").select(WALK_COLS).eq("request_id", r.id).limit(1);
      const mine = (existing as Walk[] | null)?.[0];
      if (mine) {
        if (mine.status === "active" || mine.status === "help") setWalk(mine);
        return;
      }
      const w = await startWalk({ mode: "together", companion: partnerOf(r, me).name, requestId: r.id });
      if (w && screenRef.current === "together") {
        setScreen("liveWalk");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 0);
  }, [current, walk?.request_id, supabase, startWalk, me]);

  async function updateWalk(patch: Partial<Walk>) {
    if (!walk) return null;
    const here = posRef.current;
    const { data } = await supabase
      .from("walks")
      .update({ ...patch, last_lat: here.lat, last_lng: here.lng })
      .eq("id", walk.id)
      .select(WALK_COLS)
      .single();
    if (data) setWalk(data as Walk);
    return (data as Walk) ?? null;
  }

  const walkRequest = walk?.request_id ? (wt.requests.find((r) => r.id === walk.request_id) ?? null) : null;

  async function arrived() {
    if (!walk) return;
    const w = await updateWalk({ status: "arrived", ended_at: new Date().toISOString() });
    if (!w) {
      say("Couldn't check you in. Try again.");
      return;
    }
    if (walkRequest && walkRequest.status === "started") await wt.act(walkRequest.id, "end");
    const minutes = Math.max(
      1,
      Math.round((new Date(w.ended_at ?? w.created_at).getTime() - new Date(w.created_at).getTime()) / 60000),
    );
    setArrival({
      walkId: w.id,
      minutes,
      mode: w.mode ?? "solo",
      companion: w.companion_name ?? null,
      partner: walkRequest ? partnerOf(walkRequest, me) : null,
    });
    setArrivalFeedback(null);
    setWalk(null);
    go("arrived");
  }

  async function needHelp() {
    setSecurityOpen(true);
    if (walk && walk.status !== "help") {
      const w = await updateWalk({ status: "help" });
      if (!w) say("Couldn't alert security. Call them or 999 instead.");
    }
  }

  async function extendWalk() {
    if (!walk) return;
    const base = Math.max(new Date(walk.expected_by).getTime(), now);
    const w = await updateWalk({ expected_by: new Date(base + 5 * 60000).toISOString() });
    if (w) say("Added 5 minutes");
  }

  async function cancelWalk() {
    const w = await updateWalk({ status: "cancelled", ended_at: new Date().toISOString() });
    if (!w) {
      say("Couldn't end the walk. Try again.");
      return;
    }
    if (walkRequest && walkRequest.status === "started") await wt.act(walkRequest.id, "end");
    setWalk(null);
    goHome();
    say("Walk ended");
  }

  async function shareRoute(contact: TrustedContact) {
    const w = await startWalk({ mode: "shared", companion: contact.name });
    setSheet(null);
    if (!w) {
      say("Couldn't start the walk. Try again.");
      return;
    }
    goTo("liveWalk");
    // Open the messaging app with the plan filled in. The person presses send.
    window.location.assign(
      smsLink(
        contact.phone,
        `I'm walking to ${w.destination} now and should be there by ${clock(w.expected_by)}. I'm using Ripple's walk check-in, so campus security will know if I don't arrive. Can you keep an eye out for me?`,
      ),
    );
  }

  async function soloWalk() {
    const w = await startWalk({ mode: "solo", companion: null });
    if (w) goTo("liveWalk");
  }

  const walkEntry = () => {
    if (walk) goTo("liveWalk");
    else if (wt.current) {
      setFocusRequest(wt.current.id);
      goTo("together");
    } else goTo(account.verified && account.profile?.walk_visible ? "walkNearby" : "walkIntro");
  };

  // Keep my walk offer fresh and the nearby list current while browsing.
  const visible = !!account.profile?.walk_visible && account.profile.visibility !== "hidden";
  const { refreshNearby } = wt;
  useEffect(() => {
    if (screen !== "walkNearby" || !account.verified) return;
    const tick = () => refreshNearby(destination.name, destination.minutes, visible);
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 45000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [screen, account.verified, refreshNearby, destination.name, destination.minutes, visible]);

  async function setVisibility(v: Visibility) {
    const err = await account.updateProfile({ visibility: v });
    if (err) return say("Couldn't save that. Try again.");
    if (v === "hidden") await wt.hideMe();
  }

  async function setWalkVisible(on: boolean) {
    const err = await account.updateProfile({ walk_visible: on });
    if (err) return say("Couldn't save that. Try again.");
    if (!on) await wt.hideMe();
  }

  /* ------------------------------------------------------------ overlays */

  const [securityOpen, setSecurityOpen] = useState(false);
  const [sheet, setSheet] = useState<null | "visibility" | "destination" | "share" | "addContact">(null);
  const [studentSheet, setStudentSheet] = useState<{ person: Person; mode: "actions" | "report" | "thanks"; reason: string } | null>(null);
  const [unblock, setUnblock] = useState<Person | null>(null);
  const [shareWith, setShareWith] = useState<TrustedContact | null>(null);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupKind, setSignupKind] = useState<"individualSignup" | "organisationSignup">("individualSignup");

  /* -------------------------------------------------------------- render */

  if (account.status !== "ready") {
    return (
      <div className="ripple-student">
        <div className="app-frame">
          <div className="start-screen">
            {account.status === "loading" ? (
              <div className="start-loading">
                <Image src="/brand/ripple-logo.png" alt="Ripple: women's safety matters" width={940} height={478} priority />
                <Spinner label="Opening Ripple…" />
              </div>
            ) : (
              <div className="start-error">
                <h1>Ripple couldn&apos;t start</h1>
                <p>
                  Ripple couldn&apos;t open a session. Check your connection and try again. If this keeps happening,
                  anonymous sign-ins may be turned off in Supabase (Authentication → Sign In / Providers).
                </p>
                <p className="start-error-detail">Details: {account.error}</p>
                <a className="primary coral" href="tel:999">
                  In danger? Call 999
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const nowDate = new Date(now);
  const hour = nowDate.getHours();
  const firstName = account.profile?.full_name.split(" ")[0];
  const greeting = `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}${firstName ? `, ${firstName}` : ""}`;
  const dateLine = `${nowDate.toLocaleDateString("en-GB", { weekday: "long" })} · ${nowDate.toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })}`;
  const walkLeft = walk ? Math.ceil((new Date(walk.expected_by).getTime() - now) / 60000) : 0;
  const visibilityShort = VISIBILITY.find((v) => v.value === account.profile?.visibility)?.short ?? "Visible to all verified students";
  const focused: WalkRequest | null = (focusRequest ? wt.requests.find((r) => r.id === focusRequest) : null) ?? wt.current;

  const selectSection = (s: Section) => {
    if (s === "home") goHome();
    else if (s === "report") {
      resetReport();
      goTo("incident");
    } else if (s === "walk") walkEntry();
    else if (s === "notice") goTo("notice");
    else if (s === "support") goTo("supportServices");
    else goTo("profile");
  };

  const signUp = async (d: Parameters<typeof account.signUp>[0]) => {
    const res = await account.signUp(d);
    if (res.error) return res.error;
    if (res.needsCode) {
      setSignupEmail(d.email.trim());
      setSignupKind(d.account_type === "individual" ? "individualSignup" : "organisationSignup");
      go("verify");
    } else {
      finishAuth();
      say(`Welcome to Ripple, ${d.full_name.split(" ")[0]}`);
    }
    return null;
  };

  const screens: Record<Screen, () => React.ReactNode> = {
    home: () => (
      <>
        <header className="home-header">
          <div>
            <Image src="/brand/ripple-logo-light.png" alt="Ripple: women's safety matters" width={940} height={478} priority className="home-logo" />
            <p className="eyebrow light">{dateLine}</p>
            <h1>{greeting}</h1>
          </div>
          <button
            className="icon-button dark"
            aria-label={hasNotices ? "Safety notices, new notice nearby" : "Safety notices"}
            onClick={() => go("notice")}
          >
            <Icon name="bell" />
            {hasNotices && <span className="notification-dot" />}
          </button>
        </header>
        <main className="home-main">
          {hasNotices ? (
            <button className="reassurance alerting" onClick={() => go("notice")}>
              <span className="status-icon">
                <Icon name="bell" size={19} />
              </span>
              <div>
                <strong>Heads-up near you</strong>
                <p>Several people reported feeling unsafe nearby. Tap for details.</p>
              </div>
            </button>
          ) : (
            <section className="reassurance">
              <span className="status-icon">
                <Icon name="shield" size={19} />
              </span>
              <div>
                <strong>Campus support is available</strong>
                <p>Day or night, you can reach someone.</p>
              </div>
            </section>
          )}

          {wt.incoming.length > 0 && (
            <button className="reassurance walk-invite" onClick={() => goTo("walkNearby")}>
              <span className="status-icon">
                <Icon name="walk" size={19} />
              </span>
              <div>
                <strong>{wt.incoming[0].from_name} wants to walk with you</strong>
                <p>Tap to accept or decline.</p>
              </div>
            </button>
          )}

          <div className="home-grid">
            <NearbyMap loc={loc} alerts={liveAlerts} now={now} />
            <div className="home-actions">
              <button className="report-hero" onClick={startReport}>
                <span className="report-icon">
                  <Icon name="help" size={31} />
                </span>
                <span>
                  <strong>Report</strong>
                  <small>{account.isMember ? "Tell us what happened" : "Log in to tell us what happened"}</small>
                </span>
                <Icon name="chevron" size={25} />
              </button>

              <button className={`walk-hero ${walk ? "is-active" : ""}`} onClick={walkEntry}>
                <span className="walk-illustration">
                  <Icon name="walk" size={30} />
                </span>
                <span>
                  <strong>{walk ? `Walking to ${walk.destination}` : wt.current ? "Your walk request" : "Walk together"}</strong>
                  <small>
                    {walk
                      ? walk.status === "help"
                        ? "Campus security have been alerted"
                        : walkLeft > 0
                          ? `${walkLeft} min left · tap to check in`
                          : "Overdue · tap to check in"
                      : wt.current
                        ? `With ${partnerOf(wt.current, me).name} · ${wt.current.status}`
                        : "Find a verified student going your way"}
                  </small>
                </span>
                <Icon name="chevron" size={24} />
              </button>

              <section className="quick-section">
                <h2>Quick support</h2>
                <div className="quick-grid">
                  {CAMPUS_SECURITY_HREF ? (
                    <a href={CAMPUS_SECURITY_HREF} aria-label="Call campus security">
                      <Icon name="phone" />
                      <span>Campus security</span>
                    </a>
                  ) : (
                    <button onClick={() => go("nearbyEmergency")}>
                      <Icon name="phone" />
                      <span>Emergency contacts</span>
                    </button>
                  )}
                  <button onClick={() => go("supportServices")}>
                    <Icon name="people" />
                    <span>Support services</span>
                  </button>
                </div>
              </section>
            </div>
          </div>
        </main>
      </>
    ),

    incident: () =>
      !account.isMember ? (
        <Page
          title="Log in to report"
          subtitle="You need a Ripple account to send a report. It keeps reports genuine, and campus security still won't see your name if you send anonymously."
          onBack={back}
        >
          <a className="danger-first" href="tel:999">
            <Icon name="phone" size={17} />
            In danger right now? Call 999
          </a>
          <div className="opt-card gate-card">
            <div>
              <p className="eyebrow teal">Takes a minute</p>
              <h3>Create an account or log in</h3>
            </div>
            <p>You&apos;ll come straight back here to finish your report.</p>
            <button
              className="primary coral"
              onClick={() => {
                setAfterAuth("incident");
                go("signupType");
              }}
            >
              Sign up
            </button>
            <button
              className="secondary"
              onClick={() => {
                setAfterAuth("incident");
                go("login");
              }}
            >
              Log in
            </button>
          </div>
          <div className="info-strip">
            <Icon name="people" size={19} />
            <p>
              Need to talk to someone now? <button className="inline-link" onClick={() => go("supportServices")}>See support services</button>.
            </p>
          </div>
        </Page>
      ) : (
      <Page title="What happened?" subtitle="Choose the option that fits best. You can add more detail next." onBack={back}>
        <div className="choice-list" role="radiogroup" aria-label="What happened">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              role="radio"
              aria-checked={category === c.value}
              className={`choice-card ${category === c.value ? "selected" : ""}`}
              onClick={() => setCategory(c.value)}
            >
              <Radio />
              <span>
                <strong>{c.label}</strong>
                <small>{c.detail}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="privacy-note">
          <Icon name="lock" size={18} />
          <p>Your report is private. You decide if your name is included.</p>
        </div>
        <a className="danger-first" href="tel:999">
          <Icon name="phone" size={17} />
          In danger right now? Call 999
        </a>
        <BottomAction label="Continue" disabled={!category} onClick={() => go("details")} />
      </Page>
      ),

    details: () => {
      const area = placeName(pin);
      return (
        <Page title="Add the details" subtitle="Share only what you feel comfortable sharing." onBack={back}>
          <span className="field-label">Where did this happen?</span>
          <button
            className="location-field"
            onClick={() => (manualPin ? setManualPin(null) : say("Drag the pin or tap the map to move it."))}
          >
            <span className="pin-box">
              <Icon name="location" />
            </span>
            <span>
              <strong>
                {manualPin
                  ? area
                    ? `Pinned near ${area}`
                    : "Pinned on the map"
                  : loc.source === "device"
                    ? area
                      ? `Near ${area}`
                      : "Your current location"
                    : "Queensgate campus"}
              </strong>
              <small>{loc.error && !manualPin ? loc.error : "Approximate location"}</small>
            </span>
            <span className="edit-link">{manualPin ? "Use mine" : "Move pin"}</span>
          </button>
          <MapView
            label="Map: drag the pin or tap where it happened"
            center={pin}
            recenterKey={manualPin ? "manual" : `${loc.position.lat},${loc.position.lng}`}
            zoom={17}
            pin={pin}
            me={loc.source === "device" ? loc.position : null}
            onPinMove={setManualPin}
            className="report-map"
          />
          <label className="field-label" htmlFor="details">
            Anything else? <span>Optional</span>
          </label>
          <textarea
            id="details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Add details in your own words… Please don't include names."
            maxLength={1000}
          />
          <div className="toggle-card">
            <span className="anonymous-icon">
              <Icon name="eye" />
            </span>
            <span>
              <strong>Send anonymously</strong>
              <small>{anonymous ? "Your name won’t be included" : "Security may follow up with you"}</small>
            </span>
            <button
              role="switch"
              aria-checked={anonymous}
              aria-label="Send anonymously"
              className={`toggle ${anonymous ? "on" : ""}`}
              onClick={() => setAnonymous((a) => !a)}
            >
              <span />
            </button>
          </div>
          {reportError && (
            <p className="form-error" role="alert">
              <Icon name="help" size={16} />
              {reportError}
            </p>
          )}
          <BottomAction label={sending ? "Sending…" : "Send report"} disabled={sending} onClick={sendReport} />
        </Page>
      );
    },

    sent: () => (
      <Page onBack={goHome}>
        <div className="success-block">
          <span className="success-mark">
            <Icon name="check" size={34} />
          </span>
          <p className="eyebrow teal">Report sent</p>
          <h1>Thank you for telling us</h1>
          <p>
            Campus security received your {lastReport?.is_anonymous ? "anonymous " : ""}report at{" "}
            {lastReport ? clock(lastReport.created_at) : "just now"}. You did the right thing.
          </p>
        </div>
        <section className="next-card">
          <h2>What happens next</h2>
          <div className="step">
            <span>1</span>
            <p>Campus security can see your report on their live map now.</p>
          </div>
          <div className="step">
            <span>2</span>
            <p>
              {lastReport?.cluster_id
                ? "It's been linked with other reports nearby, and a general heads-up went to people in the area."
                : "Ripple checks it against other reports nearby to spot patterns."}
            </p>
          </div>
          <div className="step">
            <span>3</span>
            <p>
              {lastReport?.is_anonymous
                ? "You won’t be contacted because this report is anonymous."
                : "Security may follow up with you."}
            </p>
          </div>
        </section>
        <section className="support-card">
          <p className="eyebrow">You’re not alone</p>
          <h2>Support is here</h2>
          <button onClick={() => go("mentalWellbeing")}>
            Counselling and wellbeing <Icon name="chevron" size={19} />
          </button>
          <button onClick={() => go("supportServices")}>
            Student support service <Icon name="chevron" size={19} />
          </button>
        </section>
        <button className="formal-button" onClick={() => go("formal")}>
          <span>
            <strong>{formalSent ? "Formal report requested" : "Make a formal report"}</strong>
            <small>{formalSent ? "See your reference number" : "Share your details with the university"}</small>
          </span>
          <Icon name="chevron" />
        </button>
        <button className="text-button" onClick={goHome}>
          Back to home
        </button>
      </Page>
    ),

    formal: () =>
      formalSent && lastReport ? (
        <Page title="Formal report requested" onBack={back}>
          <div className="formal-illustration">
            <Icon name="check" size={42} />
          </div>
          <section className="next-card">
            <h2>Your reference</h2>
            <p className="ref-code">{reportRef(lastReport.id)}</p>
            <p className="ref-help">
              A trained member of the campus safety team will contact you {formalSent}. Quote this reference if you
              call or visit them.
            </p>
          </section>
          <div className="info-strip">
            <Icon name="lock" size={19} />
            <p>You can bring a support person to any conversation. Nothing else happens without your say-so.</p>
          </div>
          <button className="primary teal" onClick={goHome}>
            Done
          </button>
        </Page>
      ) : (
        <Page
          title="Formal report"
          subtitle="A formal report shares your contact details with the university so they can follow up."
          onBack={back}
        >
          <section className="next-card">
            <h2>Before you continue</h2>
            <div className="step">
              <span>1</span>
              <p>You’ll be asked for contact details and a fuller account.</p>
            </div>
            <div className="step">
              <span>2</span>
              <p>A trained staff member will contact you to discuss options.</p>
            </div>
            <div className="step">
              <span>3</span>
              <p>You can bring a support person to any conversation.</p>
            </div>
          </section>
          {lastReport ? (
            <FormalForm
              defaultName={account.profile?.full_name ?? ""}
              defaultContact={account.profile?.contact_number ?? account.user?.email ?? ""}
              onSubmit={async (f) => {
                const { error } = await supabase.from("formal_requests").insert({ report_id: lastReport.id, ...f });
                if (error) return "That didn't go through. Check your connection and try again.";
                setFormalSent(f.preferred_contact === "email" ? "by email" : f.preferred_contact === "phone" ? "by phone" : "soon");
                setLastReport({ ...lastReport, wants_formal_report: true });
                return null;
              }}
              onCancel={back}
            />
          ) : (
            <p className="privacy-empty">Send a report first, then you can ask for a formal report.</p>
          )}
        </Page>
      ),

    notice: () => (
      <Page title="Nearby heads-up" subtitle="General updates for your area, shared without personal descriptions." onBack={back}>
        {nearbyAlerts.length === 0 ? (
          <div className="notice-card calm">
            <div className="notice-top">
              <span>
                <Icon name="shield" />
              </span>
              <p className="eyebrow teal">All clear</p>
            </div>
            <h2>No heads-ups near you</h2>
            <p>If several people report feeling unsafe nearby, a general notice will appear here straight away.</p>
          </div>
        ) : (
          nearbyAlerts.map(({ a, d }) => {
            const area = placeName(a);
            return (
              <div className="notice-card" key={a.id}>
                <div className="notice-top">
                  <span>
                    <Icon name="shield" />
                  </span>
                  <p className="eyebrow teal">Safety notice</p>
                </div>
                <h2>{area ? `Take extra care near ${area}` : "Take extra care in this area"}</h2>
                <p>{a.message}</p>
                <div className="notice-meta">
                  <span>
                    <Icon name="clock" size={17} /> {timeAgo(a.created_at, now)}
                  </span>
                  <span>
                    <Icon name="location" size={17} />{" "}
                    {d <= a.radius_m ? "You're in this area" : `About ${walkingMinutes(d - a.radius_m)} min away`}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div className="info-strip">
          <Icon name="eye" size={19} />
          <p>Notices never include names or physical descriptions.</p>
        </div>
        <section className="safety-list">
          <h2>Consider these steps</h2>
          <div>
            <span>
              <Icon name="walk" size={20} />
            </span>
            <p>
              <strong>Walk with someone</strong>Use a busy, well-lit route.
            </p>
          </div>
          <div>
            <span>
              <Icon name="people" size={20} />
            </span>
            <p>
              <strong>Tell someone</strong>Share your plans with someone you trust.
            </p>
          </div>
        </section>
        <button className="primary coral" onClick={walkEntry}>
          {walk ? "Back to my walk" : "Find someone to walk with"}
        </button>
        <button className="secondary" onClick={goHome}>
          Got it
        </button>
      </Page>
    ),

    walkIntro: () => (
      <Page title="Walk together" subtitle="Meet a verified student heading in the same direction." onBack={back}>
        <div className="walk-intro-art">
          <span>
            <Icon name="walk" size={48} />
          </span>
          <span>
            <Icon name="walk" size={42} />
          </span>
          <div className="dotted-path" />
        </div>
        <section className="how-list">
          <div>
            <span>
              <Icon name="shield" />
            </span>
            <p>
              <strong>Verified students only</strong>Only students with a confirmed university email can use this.
            </p>
          </div>
          <div>
            <span>
              <Icon name="location" />
            </span>
            <p>
              <strong>Your location stays private</strong>Others see an approximate walking time, never your live
              location.
            </p>
          </div>
          <div>
            <span>
              <Icon name="people" />
            </span>
            <p>
              <strong>You stay in control</strong>Choose who can see you, and block or report anyone.
            </p>
          </div>
        </section>

        {!account.isMember ? (
          <div className="opt-card gate-card">
            <div>
              <p className="eyebrow teal">Account needed</p>
              <h3>Log in to walk together</h3>
            </div>
            <p>Sign up with your university email so other students know you&apos;re verified.</p>
            <button className="primary coral" onClick={() => go("signupType")}>
              Sign up
            </button>
            <button className="secondary" onClick={() => go("login")}>
              Log in
            </button>
          </div>
        ) : !account.verified ? (
          <div className="opt-card gate-card">
            <div>
              <p className="eyebrow teal">Not verified yet</p>
              <h3>Verified students only</h3>
            </div>
            <p>
              Walk together needs a student account with a confirmed university email (ending .ac.uk). Check
              you&apos;ve marked yourself as a student in your details.
            </p>
            <button className="secondary" onClick={() => go("editProfile")}>
              Edit your details
            </button>
          </div>
        ) : (
          <>
            <div className="opt-card">
              <div>
                <p className="eyebrow teal">Visibility</p>
                <h3>Who can see me?</h3>
              </div>
              {VISIBILITY.filter((v) => v.value !== "hidden").map((o) => (
                <button
                  key={o.value}
                  className={account.profile?.visibility === o.value ? "active" : ""}
                  aria-pressed={account.profile?.visibility === o.value}
                  onClick={() => setVisibility(o.value)}
                >
                  <span className="radio-dot" />
                  {o.label}
                </button>
              ))}
            </div>
            <label className="consent-row">
              <input type="checkbox" checked={!!account.profile?.walk_visible} onChange={(e) => setWalkVisible(e.target.checked)} />
              <span>
                <strong>Make me visible nearby</strong>
                <small>You can turn this off at any time.</small>
              </span>
            </label>
            <BottomAction label="See students nearby" disabled={!account.profile?.walk_visible} onClick={() => go("walkNearby")} />
          </>
        )}

        <section className="alt-walks">
          <h2 className="section-title">Or walk with backup</h2>
          <button
            className="sheet-option"
            onClick={() => {
              setShareWith(null);
              setSheet("share");
            }}
          >
            <Icon name="message" />
            <span>Share my route with a friend</span>
            <Icon name="chevron" />
          </button>
          <button className="sheet-option" disabled={walkBusy} onClick={soloWalk}>
            <Icon name="shield" />
            <span>Let campus security follow my walk</span>
            <Icon name="chevron" />
          </button>
          <button className="text-link-button" onClick={() => setSheet("destination")}>
            Heading to {destination.name}, about {destination.minutes} min · Change
          </button>
          {walkError && (
            <p className="form-error" role="alert">
              <Icon name="help" size={16} />
              {walkError}
            </p>
          )}
        </section>
      </Page>
    ),

    walkNearby: () =>
      !account.verified ? (
        <Page title="Students nearby" onBack={back}>
          <p className="privacy-empty">Walk together is for verified students.</p>
          <button className="primary teal" onClick={() => goTo("walkIntro")}>
            Find out more
          </button>
        </Page>
      ) : (
        <Page
          title="Students nearby"
          subtitle="Verified students heading out now. No exact locations are shared."
          onBack={back}
          action={
            <button className="icon-button" onClick={() => go("privacySafety")} aria-label="Open privacy and safety settings">
              <Icon name="eye" />
            </button>
          }
        >
          <div className={`visibility-pill ${!visible ? "is-hidden" : ""}`}>
            <span className="pulse-dot" />
            {visible ? visibilityShort : "You're hidden"}
            <button onClick={() => setSheet("visibility")}>Change</button>
          </div>
          <div className="destination-select">
            <Icon name="location" />
            <span>
              <small>Your destination · about {destination.minutes} min</small>
              <strong>{destination.name}</strong>
            </span>
            <button onClick={() => setSheet("destination")}>Edit</button>
          </div>

          {wt.incoming.map((r) => (
            <div className="incoming-card" key={r.id}>
              <p className="eyebrow teal">Incoming request</p>
              <h3>
                {r.from_name} wants to walk to {r.destination}
              </h3>
              <p>{r.minutes_away ? `About ${r.minutes_away} min away · ` : ""}Verified student</p>
              <div>
                <button
                  className="secondary small"
                  onClick={async () => {
                    const res = await wt.act(r.id, "decline");
                    if (res.error) say("Couldn't decline. Try again.");
                  }}
                >
                  Decline
                </button>
                <button
                  className="primary teal small"
                  onClick={async () => {
                    const res = await wt.act(r.id, "accept");
                    if (res.error) return say("That request is no longer available.");
                    setFocusRequest(r.id);
                    go("together");
                  }}
                >
                  Accept
                </button>
              </div>
            </div>
          ))}

          {wt.nearbyError && (
            <p className="form-error" role="alert">
              <Icon name="help" size={16} />
              {wt.nearbyError}
            </p>
          )}

          {wt.nearby === null ? (
            <div className="nearby-loading">
              <Spinner label="Looking for students heading your way…" />
            </div>
          ) : wt.nearby.length === 0 ? (
            <div className="nearby-empty">
              <span>
                <Icon name="walk" size={34} />
              </span>
              <h2>No one&apos;s heading your way right now</h2>
              <p>
                {visible
                  ? "You're visible, so others can find you. You can also share your plans or reach campus support."
                  : "Turn on visibility so others can find you, or share your plans instead."}
              </p>
              <button
                className="primary teal"
                onClick={() => {
                  setShareWith(null);
                  setSheet("share");
                }}
              >
                <Icon name="message" size={19} />
                Share my route with a friend
              </button>
              {CAMPUS_SECURITY_HREF ? (
                <a className="secondary empty-call" href={CAMPUS_SECURITY_HREF}>
                  <Icon name="phone" size={19} />
                  Call campus security
                </a>
              ) : (
                <button className="secondary empty-call" onClick={soloWalk}>
                  <Icon name="shield" size={19} />
                  Let campus security follow my walk
                </button>
              )}
              <button
                className="text-button"
                onClick={() => {
                  refreshNearby(destination.name, destination.minutes, visible);
                  say("Checking for students nearby…");
                }}
              >
                Check again
              </button>
            </div>
          ) : (
            <>
              <div className="list-heading">
                <h2>Going your way</h2>
                <span>{wt.nearby.length} nearby</span>
              </div>
              <div className="walker-list">
                {wt.nearby.map((b: NearbyWalker) => (
                  <article className="walker-card" key={b.user_id}>
                    <div className={`avatar ${colorFor(b.user_id)}`}>{b.initials}</div>
                    <div className="walker-info">
                      <h3>
                        {b.first_name}{" "}
                        <span title="Verified student" aria-label="Verified student">
                          <Icon name="shield" size={16} />
                        </span>
                      </h3>
                      <p>
                        <Icon name="clock" size={15} />
                        about {b.minutes_away} min away
                      </p>
                      <p>
                        <Icon name="location" size={15} />
                        Going to {b.destination}
                      </p>
                    </div>
                    <button
                      className="menu-button"
                      aria-label={`Options for ${b.first_name}`}
                      onClick={() => setStudentSheet({ person: { id: b.user_id, name: b.first_name }, mode: "actions", reason: "" })}
                    >
                      <Icon name="menu" />
                    </button>
                    <button
                      className="request-button"
                      onClick={async () => {
                        const res = await wt.send(b, destination.name);
                        if (res.error || !res.request) {
                          say(res.error ?? "Couldn't send the request.");
                          return;
                        }
                        setFocusRequest(res.request.id);
                        go("together");
                      }}
                    >
                      Send walk request
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
        </Page>
      ),

    together: () => {
      const r = focused;
      if (!r) {
        return (
          <Page title="Walk together" onBack={back}>
            <p className="privacy-empty">You don&apos;t have a walk request right now.</p>
            <button className="primary teal" onClick={() => goTo("walkNearby")}>
              See students nearby
            </button>
          </Page>
        );
      }
      const partner = partnerOf(r, me);
      const iSent = r.from_user === me;
      const initials = initialsOf(partner.name);
      const color = colorFor(partner.id);

      if (r.status === "pending") {
        return (
          <Page title="Request sent" onBack={back}>
            <div className="waiting-block">
              <Avatar initials={initials} color={color} large />
              <span className="verified-badge">
                <Icon name="shield" size={15} /> Verified student
              </span>
              <h1>Waiting for {partner.name}</h1>
              <p>They can accept or decline. Your exact location is still private.</p>
              <span className="waiting-dots">
                <i />
                <i />
                <i />
              </span>
            </div>
            <section className="request-summary">
              <div>
                <Icon name="location" />
                <span>
                  <small>Destination</small>
                  <strong>{r.destination}</strong>
                </span>
              </div>
              <div>
                <Icon name="clock" />
                <span>
                  <small>Approximate distance</small>
                  <strong>{r.minutes_away ? `about ${r.minutes_away} min away` : "Nearby"}</strong>
                </span>
              </div>
            </section>
            <button
              className="text-button danger-text"
              onClick={async () => {
                await wt.act(r.id, "cancel");
                setFocusRequest(null);
                goTo("walkNearby");
              }}
            >
              Cancel request
            </button>
          </Page>
        );
      }

      if (r.status === "accepted") {
        return (
          <Page
            title="Choose a meeting point"
            subtitle={`Meet ${partner.name} somewhere public and easy to find. You both see the same choice.`}
            onBack={back}
            action={<SecurityButton onClick={() => setSecurityOpen(true)} />}
          >
            <div className="accepted-strip">
              <Icon name="check" />
              <p>
                <strong>Walk request accepted</strong>
                {iSent ? `${partner.name} is ready to meet.` : `You're walking with ${partner.name}.`}
              </p>
            </div>
            <div className="meeting-map" aria-hidden="true">
              <div className="map-road one" />
              <div className="map-road two" />
              <span className="person-pin left">
                <Icon name="person" size={18} />
              </span>
              <span className="person-pin right">
                <Icon name="person" size={18} />
              </span>
              <div className="meeting-marker">
                <Icon name="location" />
              </div>
            </div>
            <h2 className="section-title">Public meeting points</h2>
            <div className="meeting-options" role="radiogroup" aria-label="Meeting point">
              {MEETING_POINTS.map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={r.meeting_point === m}
                  className={r.meeting_point === m ? "selected" : ""}
                  onClick={async () => {
                    const res = await wt.act(r.id, "meet", m);
                    if (res.error) say("Couldn't save the meeting point. Try again.");
                  }}
                >
                  <Radio />
                  <span>
                    <strong>{m}</strong>
                    <small>Well-lit · Staffed area</small>
                  </span>
                </button>
              ))}
            </div>
            <div className="info-strip">
              <Icon name="shield" size={19} />
              <p>Meet in public. If anything feels wrong, leave and use Get help.</p>
            </div>
            {walkError && (
              <p className="form-error" role="alert">
                <Icon name="help" size={16} />
                {walkError}
              </p>
            )}
            {r.meeting_point ? (
              <div className="meeting-ready">
                <div>
                  <Icon name="check" size={19} />
                  <p>
                    <strong>Meeting point</strong>
                    {r.meeting_point}
                  </p>
                </div>
                <button
                  className="primary teal"
                  disabled={walkBusy}
                  onClick={async () => {
                    const res = await wt.act(r.id, "start");
                    if (res.error) say("Couldn't start the walk. Try again.");
                  }}
                >
                  {walkBusy ? "Starting…" : "We've met · Start walk"}
                  <Icon name="chevron" />
                </button>
              </div>
            ) : (
              <p className="privacy-empty">Pick a meeting point. {partner.name} will see it straight away.</p>
            )}
            <button
              className="text-button danger-text"
              onClick={async () => {
                await wt.act(r.id, "cancel");
                setFocusRequest(null);
                goTo("walkNearby");
              }}
            >
              Cancel walk
            </button>
          </Page>
        );
      }

      if (r.status === "started") {
        return (
          <Page title={`Walking with ${partner.name}`} onBack={back}>
            <div className="nearby-loading">
              <Spinner label="Starting your walk…" />
            </div>
            {walk && (
              <button className="primary teal" onClick={() => goTo("liveWalk")}>
                Open my walk
              </button>
            )}
          </Page>
        );
      }

      return (
        <Page
          title={r.status === "declined" ? `${partner.name} can't walk right now` : "This walk request has ended"}
          subtitle="You can look for someone else heading your way."
          onBack={back}
        >
          <button
            className="primary teal"
            onClick={() => {
              setFocusRequest(null);
              goTo("walkNearby");
            }}
          >
            See students nearby
          </button>
        </Page>
      );
    },

    liveWalk: () =>
      walk ? (
        <LiveWalk
          walk={walk}
          meetingPoint={walkRequest?.meeting_point ?? null}
          posRef={posRef}
          onBack={back}
          onSecurity={() => setSecurityOpen(true)}
          onArrived={arrived}
          onHelp={needHelp}
          onExtend={extendWalk}
          onCancel={cancelWalk}
          textContact={wt.contacts.find((c) => c.name === walk.companion_name) ?? null}
        />
      ) : (
        <Page title="No active walk" subtitle="Your walk has ended." onBack={goHome}>
          <button className="primary teal" onClick={goHome}>
            Back to home
          </button>
        </Page>
      ),

    arrived: () => (
      <Page onBack={goHome}>
        <div className="arrival-success">
          <span className="arrival-tick">
            <Icon name="check" size={36} />
          </span>
          <p className="eyebrow teal">Walk complete</p>
          <h1>You arrived safely</h1>
          <p>
            {arrival?.mode === "together" ? (
              <>
                You walked with <strong>{arrival.companion}</strong> for {arrival.minutes} min.
              </>
            ) : arrival?.mode === "shared" ? (
              <>
                <strong>{arrival.companion}</strong> could follow your route for {arrival.minutes} min.
              </>
            ) : (
              <>Your walk took {arrival?.minutes} min.</>
            )}{" "}
            Campus security can see you&apos;ve checked in.
          </p>
        </div>
        <section className="walk-feedback">
          <h2>How did the walk feel?</h2>
          <p>Optional · This helps campus security improve walking routes.</p>
          <div>
            {(["good", "not_good"] as const).map((v) => (
              <button
                key={v}
                className={arrivalFeedback === v ? "selected" : ""}
                aria-label={v === "good" ? "The walk felt good" : "The walk did not feel good"}
                aria-pressed={arrivalFeedback === v}
                onClick={async () => {
                  setArrivalFeedback(v);
                  if (arrival) await supabase.from("walks").update({ feedback: v }).eq("id", arrival.walkId);
                }}
              >
                <Icon name={v === "good" ? "thumbUp" : "thumbDown"} size={28} />
                <span>{v === "good" ? "Good" : "Not good"}</span>
              </button>
            ))}
          </div>
          {arrivalFeedback === "not_good" && (
            <>
              <button className="text-button" onClick={startReport}>
                Something happened? Report it
              </button>
              {arrival?.partner && (
                <button
                  className="text-button danger-text"
                  onClick={() => arrival.partner && setStudentSheet({ person: arrival.partner, mode: "actions", reason: "" })}
                >
                  Block or report {arrival.partner.name}
                </button>
              )}
            </>
          )}
        </section>
        <button className="primary teal arrival-done" onClick={goHome}>
          Done
        </button>
      </Page>
    ),

    supportServices: () => (
      <Page title="Support services" subtitle="Choose the kind of support you need right now." onBack={back}>
        <div className="support-choice-list">
          <button onClick={() => go("nearbyEmergency")}>
            <span className="support-choice-icon">
              <Icon name="shield" size={28} />
            </span>
            <span>
              <strong>Nearby emergency</strong>
              <small>Local safety services and emergency help</small>
            </span>
            <Icon name="chevron" />
          </button>
          <button onClick={() => go("mentalWellbeing")}>
            <span className="support-choice-icon">
              <Icon name="people" size={28} />
            </span>
            <span>
              <strong>Mental wellbeing</strong>
              <small>Talk or message with someone who can help</small>
            </span>
            <Icon name="chevron" />
          </button>
        </div>
        <div className="info-strip support-privacy">
          <Icon name="lock" size={19} />
          <p>You choose who to contact. Ripple does not place a call without you tapping.</p>
        </div>
      </Page>
    ),

    nearbyEmergency: () => (
      <Page title="Nearby emergency" onBack={back}>
        <div className="location-context">
          <Icon name="location" size={19} />
          <p>
            Based on your location: <strong>{placeName(loc.position) ?? "your current area"}</strong>
            <small>{loc.source === "device" ? "Using your device location" : "Location is off · showing Queensgate campus"}</small>
          </p>
        </div>
        <div className="call-card-list">
          {EMERGENCY_CONTACTS.map((c) => (
            <CallCard key={c.title} c={c} />
          ))}
        </div>
        <p className="danger-first">
          <Icon name="phone" size={17} />
          If you are in danger, call 999 first.
        </p>
      </Page>
    ),

    mentalWellbeing: () => (
      <Page title="Mental wellbeing" onBack={back}>
        <p className="kind-intro">You&apos;re not alone. Choose what feels right for you.</p>
        <div className="call-card-list wellbeing-list">
          {WELLBEING_CONTACTS.map((c) => (
            <CallCard key={c.title} c={c} />
          ))}
        </div>
        <div className="info-strip support-privacy">
          <Icon name="shield" size={19} />
          <p>If you or someone else is in immediate danger, call 999.</p>
        </div>
      </Page>
    ),

    privacySafety: () => (
      <Page title="Privacy and safety" subtitle="Control who can see you and manage people you trust." onBack={back}>
        <section className="privacy-section">
          <div className="privacy-section-heading">
            <span>
              <Icon name="eye" size={20} />
            </span>
            <div>
              <p className="eyebrow teal">Visibility</p>
              <h2>Who can see you</h2>
            </div>
          </div>
          {account.isMember ? (
            <div className={`privacy-setting-row ${!visible ? "is-hidden" : ""}`}>
              <p>
                <strong>{visible ? visibilityShort : "Hidden from Walk together"}</strong>
                <small>Your exact location is never shown.</small>
              </p>
              <button onClick={() => setSheet("visibility")}>Change</button>
            </div>
          ) : (
            <p className="privacy-empty">Log in to choose who can see you in Walk together.</p>
          )}
        </section>
        {account.isMember && (
          <section className="privacy-section">
            <div className="privacy-section-heading">
              <span>
                <Icon name="person" size={20} />
              </span>
              <div>
                <p className="eyebrow teal">Safety</p>
                <h2>Blocked people</h2>
              </div>
            </div>
            {wt.blocks.length === 0 ? (
              <p className="privacy-empty">You haven&apos;t blocked anyone.</p>
            ) : (
              <div className="privacy-person-list">
                {wt.blocks.map((b) => (
                  <div key={b.blocked_id}>
                    <Avatar initials={initialsOf(b.blocked_name)} color={colorFor(b.blocked_id)} />
                    <p>
                      <strong>{b.blocked_name}</strong>
                      <small>Blocked student</small>
                    </p>
                    <button onClick={() => setUnblock({ id: b.blocked_id, name: b.blocked_name })}>Unblock</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        <section className="privacy-section">
          <div className="privacy-section-heading">
            <span>
              <Icon name="people" size={20} />
            </span>
            <div>
              <p className="eyebrow teal">Route sharing</p>
              <h2>Trusted contacts</h2>
            </div>
          </div>
          {wt.contacts.length === 0 ? (
            <p className="privacy-empty">You haven&apos;t added any trusted contacts.</p>
          ) : (
            <div className="privacy-person-list trusted-list">
              {wt.contacts.map((c) => (
                <div key={c.id}>
                  <Avatar initials={initialsOf(c.name)} color={colorFor(c.id)} />
                  <p>
                    <strong>{c.name}</strong>
                    <small>{c.phone}</small>
                  </p>
                  <button
                    aria-label={`Remove ${c.name} from trusted contacts`}
                    onClick={async () => {
                      const err = await wt.removeContact(c.id);
                      say(err ? "Couldn't remove that contact." : `${c.name} removed`);
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <button className="add-contact-button" onClick={() => setSheet("addContact")}>
            <Icon name="people" size={18} />
            Add contact
          </button>
          {!account.isMember && <p className="privacy-empty">Log in to keep your contacts when you change phone.</p>}
        </section>
      </Page>
    ),

    profile: () => (
      <ProfileView
        email={account.user?.email ?? null}
        profile={account.profile}
        isMember={account.isMember}
        verified={account.verified}
        onLogin={() => {
          setAfterAuth(null);
          go("login");
        }}
        onSignup={() => {
          setAfterAuth(null);
          go("signupType");
        }}
        onEdit={() => go("editProfile")}
        onPrivacy={() => go("privacySafety")}
        onLogout={async () => {
          await account.logOut();
          setWalk(null);
          goHome();
          say("Logged out");
        }}
      />
    ),

    login: () => (
      <Page title="Welcome back" subtitle="Log in to your Ripple account." onBack={back}>
        <LoginForm
          onLogin={async (email, password) => {
            const err = await account.logIn(email, password);
            if (!err) {
              finishAuth();
              say("Logged in");
            }
            return err;
          }}
          onForgot={() => go("forgot")}
          onSignup={() => go("signupType")}
        />
      </Page>
    ),

    forgot: () => (
      <Page title="Reset your password" subtitle="We'll email you a link to choose a new one." onBack={back}>
        <ForgotPassword onSend={account.sendReset} />
      </Page>
    ),

    signupType: () => (
      <Page title="Create your account" subtitle="Choose the account type that fits you." onBack={back}>
        <SignupType onIndividual={() => go("individualSignup")} onOrganisation={() => go("organisationSignup")} />
      </Page>
    ),

    individualSignup: () => (
      <Page title="Individual account" subtitle="Create your personal Ripple account." onBack={back}>
        <IndividualSignup onSubmit={signUp} />
      </Page>
    ),

    organisationSignup: () => (
      <Page title="Organisation account" subtitle="Create a Ripple account for your organisation." onBack={back}>
        <OrganisationSignup onSubmit={signUp} />
      </Page>
    ),

    verify: () => (
      <Page title="Confirm your email" onBack={back}>
        <VerifyEmail
          email={signupEmail}
          onVerify={async (code) => {
            const err = await account.verifyCode(signupEmail, code);
            if (!err) {
              finishAuth();
              say("Your account is ready");
            }
            return err;
          }}
          onResend={() => account.resendCode(signupEmail)}
          onChangeEmail={() => {
            setScreen(signupKind);
            setHistory((h) => h.slice(0, -1));
          }}
          onLogin={() => go("login")}
        />
      </Page>
    ),

    editProfile: () =>
      account.profile ? (
        <Page title="Your details" subtitle="Only you can see these. Other students only see your first name." onBack={back}>
          <EditProfile
            profile={account.profile}
            onSave={async (patch) => {
              const err = await account.updateProfile(patch);
              if (!err) {
                back();
                say("Details saved");
              }
              return err ? "Couldn't save your details. Try again." : null;
            }}
          />
        </Page>
      ) : (
        <Page title="Your details" onBack={back}>
          <p className="privacy-empty">Log in to edit your details.</p>
        </Page>
      ),
  };

  const content = account.recovering ? (
    <Page title="Choose a new password" onBack={account.cancelRecovery}>
      <SetNewPassword
        onSave={async (p) => {
          const err = await account.setNewPassword(p);
          if (!err) {
            goHome();
            say("Password updated");
          }
          return err;
        }}
      />
    </Page>
  ) : (
    screens[screen]()
  );

  return (
    <div className="ripple-student">
      <div className={`app-frame screen-${screen}`}>
        <AppNav
          section={SECTION_OF[screen]}
          hasNotices={hasNotices}
          subScreen={!TOP_LEVEL.includes(screen) || account.recovering}
          onSelect={selectSection}
        />
        <div className="app-main">
          <div className="screen-content" key={account.recovering ? "recover" : screen}>
            {content}
          </div>
        </div>

        {unblock && (
          <div className="checkin-overlay" role="dialog" aria-modal="true" aria-labelledby="unblock-title">
            <div className="checkin-popup unblock-popup">
              <span>
                <Icon name="person" size={28} />
              </span>
              <h2 id="unblock-title">Unblock {unblock.name}?</h2>
              <p>They&apos;ll be able to see you and send requests again.</p>
              <button
                className="primary teal"
                onClick={async () => {
                  const err = await wt.unblock(unblock.id);
                  say(err ? "Couldn't unblock. Try again." : `${unblock.name} unblocked`);
                  setUnblock(null);
                }}
              >
                Confirm unblock
              </button>
              <button className="secondary" onClick={() => setUnblock(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {sheet === "addContact" && (
          <AddContactSheet
            onClose={() => setSheet(null)}
            onAdd={async (c) => {
              const err = await wt.addContact(c.name, c.phone);
              if (err) return "Couldn't save the contact. Try again.";
              setSheet(null);
              say(`${c.name} added`);
              return null;
            }}
          />
        )}

        {sheet === "share" && (
          <Sheet
            id="contact-picker-title"
            title="Share my route"
            intro={`Pick someone to text your plan to. Campus security will also follow your walk to ${destination.name} until you check in.`}
            className="contact-picker"
            onClose={() => setSheet(null)}
          >
            <div className="contact-list">
              {wt.contacts.map((c) => (
                <div className={`contact-row ${shareWith?.id === c.id ? "selected" : ""}`} key={c.id}>
                  <button className="contact-select" onClick={() => setShareWith(c)} aria-pressed={shareWith?.id === c.id}>
                    <Avatar initials={initialsOf(c.name)} color={colorFor(c.id)} />
                    <span>
                      <strong>{c.name}</strong>
                      <small>{c.phone}</small>
                    </span>
                    <Radio />
                  </button>
                  <a href={`tel:${c.phone.replace(/\s+/g, "")}`} aria-label={`Call ${c.name} instead`}>
                    <Icon name="phone" size={17} />
                    Call instead
                  </a>
                </div>
              ))}
              {wt.contacts.length === 0 && <p className="contact-picker-empty">Add a trusted contact before sharing your route.</p>}
            </div>
            {wt.contacts.length === 0 ? (
              <button className="primary teal share-route-submit" onClick={() => setSheet("addContact")}>
                Add a trusted contact
              </button>
            ) : (
              <button
                className="primary teal share-route-submit"
                disabled={!shareWith || walkBusy}
                onClick={() => shareWith && shareRoute(shareWith)}
              >
                {walkBusy ? "Starting…" : "Share route"}
              </button>
            )}
            <button className="sheet-cancel" onClick={() => setSheet(null)}>
              Cancel
            </button>
          </Sheet>
        )}

        {sheet === "visibility" && (
          <Sheet
            id="visibility-title"
            title="Who can see me?"
            intro="Change your visibility at any time."
            className="visibility-sheet"
            onClose={() => setSheet(null)}
          >
            <div className="sheet-choice-list">
              {VISIBILITY.map((o) => (
                <button
                  key={o.value}
                  className={account.profile?.visibility === o.value ? "selected" : ""}
                  onClick={async () => {
                    setSheet(null);
                    await setVisibility(o.value);
                  }}
                >
                  <Radio />
                  <span>{o.label}</span>
                  {o.value === "hidden" && <Icon name="eye" size={17} />}
                </button>
              ))}
            </div>
            <button className="sheet-cancel" onClick={() => setSheet(null)}>
              Cancel
            </button>
          </Sheet>
        )}

        {sheet === "destination" && (
          <DestinationSheet
            current={destination}
            onClose={() => setSheet(null)}
            onSave={(d) => {
              setDestination(d);
              setSheet(null);
            }}
          />
        )}

        {studentSheet && (
          <Sheet id="student-sheet-title" className="student-action-sheet" onClose={() => setStudentSheet(null)}>
            {studentSheet.mode === "actions" ? (
              <>
                <div className="sheet-student">
                  <Avatar initials={initialsOf(studentSheet.person.name)} color={colorFor(studentSheet.person.id)} />
                  <div>
                    <h2 id="student-sheet-title">{studentSheet.person.name}</h2>
                    <p>
                      <Icon name="shield" size={14} /> Verified student
                    </p>
                  </div>
                </div>
                <button
                  className="moderation-option block"
                  onClick={async () => {
                    const p = studentSheet.person;
                    setStudentSheet(null);
                    const err = await wt.block(p.id, p.name);
                    if (err) say("Couldn't block. Try again.");
                    else say(`${p.name} blocked`, { label: "Undo", run: () => wt.unblock(p.id) });
                  }}
                >
                  <Icon name="close" />
                  <span>
                    <strong>Block</strong>
                    <small>You won&apos;t see each other in Walk together</small>
                  </span>
                </button>
                <button
                  className="moderation-option report"
                  onClick={() => setStudentSheet({ ...studentSheet, mode: "report", reason: "" })}
                >
                  <Icon name="help" />
                  <span>
                    <strong>Report</strong>
                    <small>Tell campus security about a concern</small>
                  </span>
                </button>
                <button className="sheet-cancel" onClick={() => setStudentSheet(null)}>
                  Cancel
                </button>
              </>
            ) : studentSheet.mode === "thanks" ? (
              <div className="report-thanks">
                <span>
                  <Icon name="check" size={31} />
                </span>
                <p className="eyebrow teal">Report sent</p>
                <h2 id="student-sheet-title">Thank you for telling us</h2>
                <p>Campus security have your report. {studentSheet.person.name} is blocked, so you won&apos;t see each other.</p>
                <button className="primary teal" onClick={() => setStudentSheet(null)}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <button className="sheet-back-button" onClick={() => setStudentSheet({ ...studentSheet, mode: "actions" })}>
                  <Icon name="arrow" size={18} /> Back
                </button>
                <h2 id="student-sheet-title">Report {studentSheet.person.name}</h2>
                <p className="report-intro">What happened? Choose the closest reason.</p>
                <div className="report-reasons">
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r}
                      className={studentSheet.reason === r ? "selected" : ""}
                      onClick={() => setStudentSheet({ ...studentSheet, reason: r })}
                    >
                      <Radio />
                      {r}
                    </button>
                  ))}
                </div>
                <button
                  className="primary coral send-security"
                  disabled={!studentSheet.reason}
                  onClick={async () => {
                    const p = studentSheet.person;
                    const err = await wt.raiseConcern(p.id, p.name, studentSheet.reason);
                    if (err) return say("Couldn't send that. Try again.");
                    await wt.block(p.id, p.name);
                    setStudentSheet({ ...studentSheet, mode: "thanks" });
                  }}
                >
                  Send to campus security
                </button>
                <button className="sheet-cancel" onClick={() => setStudentSheet(null)}>
                  Cancel
                </button>
              </>
            )}
          </Sheet>
        )}

        {securityOpen && (
          <div className="security-sheet" role="dialog" aria-modal="true" aria-labelledby="security-title">
            <div className="security-sheet-header">
              <button aria-label="Close safety options" onClick={() => setSecurityOpen(false)}>
                <Icon name="close" />
              </button>
              <p className="eyebrow">Safety options</p>
              <span />
            </div>
            <div className="security-sheet-content">
              <span className="security-sheet-icon">
                <Icon name="shield" size={36} />
              </span>
              <h2 id="security-title">Need support?</h2>
              <p>Choose what feels right. Calls and messages only start when you tap.</p>
              {walk?.status === "help" && (
                <p className="help-sent" role="status">
                  <Icon name="check" size={18} />
                  Campus security have been alerted and can see your last location.
                </p>
              )}
              {walk && walk.status !== "help" && (
                <button className="sheet-call alert-security" onClick={needHelp}>
                  <Icon name="bell" size={24} />
                  <span>
                    <strong>Alert campus security</strong>
                    <small>Flags your walk and shares your location with them</small>
                  </span>
                </button>
              )}
              <a className="sheet-call" href="tel:999" aria-label="Call 999">
                <Icon name="phone" size={24} />
                <span>
                  <strong>Call 999</strong>
                  <small>If you&apos;re in danger right now</small>
                </span>
              </a>
              {CAMPUS_SECURITY_HREF && (
                <a className="sheet-option" href={CAMPUS_SECURITY_HREF}>
                  <Icon name="phone" />
                  <span>Call campus security</span>
                  <Icon name="chevron" />
                </a>
              )}
              {wt.contacts[0] ? (
                <a className="sheet-option" href={smsLink(wt.contacts[0].phone, "I'm on a Ripple walk and need you to check in with me.")}>
                  <Icon name="message" />
                  <span>Text {wt.contacts[0].name}</span>
                  <Icon name="chevron" />
                </a>
              ) : (
                <button
                  className="sheet-option"
                  onClick={() => {
                    setSecurityOpen(false);
                    go("privacySafety");
                  }}
                >
                  <Icon name="message" />
                  <span>Add a trusted contact to text</span>
                  <Icon name="chevron" />
                </button>
              )}
              <button
                className="sheet-option"
                onClick={() => {
                  setSecurityOpen(false);
                  startReport();
                }}
              >
                <Icon name="help" />
                <span>Report something</span>
                <Icon name="chevron" />
              </button>
              <button className="sheet-cancel" onClick={() => setSecurityOpen(false)}>
                Close
              </button>
            </div>
          </div>
        )}

        {toast && (
          <div className="toast" role="status">
            <Icon name="check" size={18} />
            <span>{toast.text}</span>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action?.run();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- live walk */

function LiveWalk({
  walk,
  meetingPoint,
  posRef,
  onBack,
  onSecurity,
  onArrived,
  onHelp,
  onExtend,
  onCancel,
  textContact,
}: {
  walk: Walk;
  meetingPoint: string | null;
  posRef: React.RefObject<LatLng>;
  onBack: () => void;
  onSecurity: () => void;
  onArrived: () => Promise<void>;
  onHelp: () => Promise<void>;
  onExtend: () => Promise<void>;
  onCancel: () => Promise<void>;
  textContact: TrustedContact | null;
}) {
  const supabase = getStudentClient();
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [manualCheckin, setManualCheckin] = useState(false);
  const [answeredFor, setAnsweredFor] = useState<string | null>(null);

  const msLeft = new Date(walk.expected_by).getTime() - now;
  const overdue = msLeft <= 0;
  const minsLeft = Math.max(0, Math.ceil(msLeft / 60000));
  // Ask "Everything okay?" once when time runs out, or when the person checks in.
  const checkinOpen = manualCheckin || (overdue && walk.status === "active" && answeredFor !== walk.expected_by);
  const mode = walk.mode ?? "solo";
  const companion = walk.companion_name ?? (mode === "solo" ? "Campus security" : "Your companion");

  // Share the latest position with security every 20 seconds while walking.
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = posRef.current;
      supabase.from("walks").update({ last_lat: p.lat, last_lng: p.lng }).eq("id", walk.id).then(() => {});
    }, 20000);
    return () => window.clearInterval(id);
  }, [supabase, walk.id, posRef]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const closeCheckin = () => {
    setManualCheckin(false);
    setAnsweredFor(walk.expected_by);
  };

  return (
    <Page
      title={mode === "together" ? `Walking with ${companion}` : mode === "shared" ? `${companion} is following` : "Campus security is following"}
      subtitle="Your exact position is only shared with campus security."
      onBack={onBack}
      action={<SecurityButton onClick={onSecurity} />}
    >
      <div className="walk-pair">
        <div>
          <span className="avatar blue">YOU</span>
          <p>
            <strong>You</strong>
            <small>On your way</small>
          </p>
        </div>
        <span className="pair-line">
          <i />
          <i />
          <i />
        </span>
        <div>
          <span className={`avatar ${mode === "together" ? "mint" : "sand"}`}>{initialsOf(companion)}</span>
          <p>
            <strong>{companion}</strong>
            {mode === "together" ? (
              <small aria-label="Verified student">
                <Icon name="shield" size={13} /> Verified student
              </small>
            ) : (
              <small className="route-follower">
                <Icon name="eye" size={13} /> Following your route
              </small>
            )}
          </p>
        </div>
      </div>

      <section className={`walk-overview ${overdue ? "is-overdue" : ""}`}>
        <div>
          <small>Destination area</small>
          <strong>
            <Icon name="location" size={17} /> {walk.destination}
          </strong>
        </div>
        <div className="countdown" aria-live="polite">
          <strong>{minsLeft}</strong>
          <span>{overdue ? "overdue" : "min left"}</span>
        </div>
      </section>

      {walk.status === "help" ? (
        <div className="info-strip walk-alert" role="status">
          <Icon name="bell" size={19} />
          <p>Campus security have been alerted and can see your last location. If you&apos;re in danger, call 999.</p>
        </div>
      ) : overdue ? (
        <div className="info-strip walk-warn" role="status">
          <Icon name="clock" size={19} />
          <p>You&apos;re past your expected time, so campus security can see this walk is overdue. Check in when you&apos;re safe.</p>
        </div>
      ) : null}

      <div className="route-map active-route" aria-hidden="true">
        <div className="route-line" />
        <span className="route-start">
          <Icon name="walk" size={21} />
        </span>
        <span className="route-end">
          <Icon name="location" size={24} />
        </span>
        <span className="route-label">{walk.destination}</span>
        <small className="route-privacy">
          <Icon name="lock" size={12} /> Approximate route · Exact positions hidden
        </small>
      </div>

      {mode === "together" ? (
        <section className="meeting-detail">
          <Icon name="location" />
          <p>
            <small>Met at</small>
            <strong>{meetingPoint ?? "Your meeting point"}</strong>
          </p>
          <span>{clock(walk.created_at)}</span>
        </section>
      ) : (
        <section className="meeting-detail">
          <Icon name="eye" />
          <p>
            <small>{mode === "shared" ? "Route shared with" : "Followed by"}</small>
            <strong>{mode === "shared" ? `${companion} · Trusted contact` : "Campus security"}</strong>
          </p>
          {textContact ? (
            <a
              className="text-link"
              href={smsLink(textContact.phone, `I'm walking to ${walk.destination} now and should be there by ${clock(walk.expected_by)}.`)}
            >
              Text
            </a>
          ) : (
            <span>{clock(walk.created_at)}</span>
          )}
        </section>
      )}

      <button className="demo-checkin" onClick={() => setManualCheckin(true)}>
        Check in
      </button>
      <button className="arrived-button" disabled={busy} onClick={() => run(onArrived)}>
        <Icon name="check" size={25} />
        I&apos;ve arrived
      </button>
      <div className="walk-secondary">
        <button className="text-button" disabled={busy} onClick={() => run(onExtend)}>
          Add 5 minutes
        </button>
        <button className="text-button danger-text" disabled={busy} onClick={() => run(onCancel)}>
          End walk
        </button>
      </div>
      <p className="safety-copy">
        <Icon name="shield" size={16} />{" "}
        {mode === "together"
          ? "Campus security can see this walk until you arrive. You can block or report this student afterwards."
          : "Campus security can see this walk until you check in."}
      </p>

      {checkinOpen && (
        <div className="checkin-overlay" role="dialog" aria-modal="true" aria-labelledby="checkin-title">
          <div className="checkin-popup">
            <span>
              <Icon name="shield" size={29} />
            </span>
            <p className="eyebrow teal">Quick check-in</p>
            <h2 id="checkin-title">Everything okay?</h2>
            <p>
              {overdue
                ? "You're past your expected time. Tell us you're fine and we'll add 5 minutes."
                : "Your answer stays private."}
            </p>
            <button
              className="primary teal"
              onClick={async () => {
                const wasOverdue = overdue;
                closeCheckin();
                if (wasOverdue) await onExtend();
              }}
            >
              I&apos;m fine
            </button>
            <button
              className="secondary checkin-help"
              onClick={async () => {
                closeCheckin();
                await onHelp();
              }}
            >
              Get help
            </button>
          </div>
        </div>
      )}
    </Page>
  );
}

/* ------------------------------------------------------------- formal form */

type FormalDetails = {
  full_name: string;
  contact: string;
  preferred_contact: "phone" | "email" | "either";
  statement: string | null;
  support_person: boolean;
};

function FormalForm({
  defaultName,
  defaultContact,
  onSubmit,
  onCancel,
}: {
  defaultName: string;
  defaultContact: string;
  onSubmit: (f: FormalDetails) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [contact, setContact] = useState(defaultContact);
  const [preferred, setPreferred] = useState<FormalDetails["preferred_contact"]>("either");
  const [statement, setStatement] = useState("");
  const [support, setSupport] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="account-form formal-form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return setError("Add your name.");
        if (contact.trim().length < 3) return setError("Add a phone number or email so the team can reach you.");
        setBusy(true);
        const err = await onSubmit({
          full_name: name.trim().slice(0, 100),
          contact: contact.trim().slice(0, 120),
          preferred_contact: preferred,
          statement: statement.trim() || null,
          support_person: support,
        });
        setBusy(false);
        setError(err ?? "");
      }}
    >
      <div className="form-field">
        <label htmlFor="formal-name">Your name</label>
        <input id="formal-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="form-field">
        <label htmlFor="formal-contact">Phone number or email</label>
        <input id="formal-contact" autoComplete="tel" value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      <fieldset className="form-section">
        <legend>How should we contact you?</legend>
        <div className="segmented-choice three">
          {(
            [
              ["phone", "Phone"],
              ["email", "Email"],
              ["either", "Either"],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className={preferred === v ? "selected" : ""}>
              <input type="radio" name="formal-preferred" checked={preferred === v} onChange={() => setPreferred(v)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-field">
        <label htmlFor="formal-statement">What happened, in your own words (optional)</label>
        <textarea
          id="formal-statement"
          value={statement}
          maxLength={4000}
          onChange={(e) => setStatement(e.target.value)}
          placeholder="You can also tell the team when they contact you."
        />
      </div>
      <label className="consent-row">
        <input type="checkbox" checked={support} onChange={(e) => setSupport(e.target.checked)} />
        <span>
          <strong>I&apos;d like to bring a support person</strong>
          <small>A friend, family member or advisor.</small>
        </span>
      </label>
      <div className="info-strip">
        <Icon name="lock" size={19} />
        <p>Only campus security can see these details. Your original report stays anonymous to everyone else.</p>
      </div>
      {error && (
        <p className="form-error" role="alert">
          <Icon name="help" size={16} />
          {error}
        </p>
      )}
      <button className="primary coral account-submit" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send formal report request"}
      </button>
      <button className="secondary" type="button" onClick={onCancel}>
        Not now
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ sheets */

function DestinationSheet({
  current,
  onSave,
  onClose,
}: {
  current: { name: string; minutes: number };
  onSave: (d: { name: string; minutes: number }) => void;
  onClose: () => void;
}) {
  const known = DESTINATIONS.includes(current.name);
  const [choice, setChoice] = useState(known ? current.name : "other");
  const [other, setOther] = useState(known ? "" : current.name);
  const [minutes, setMinutes] = useState(current.minutes);
  const name = choice === "other" ? other.trim() : choice;

  return (
    <Sheet id="destination-title" title="Where are you heading?" intro="Pick an area. Other students only see the area, never an address." onClose={onClose}>
      <div className="sheet-choice-list">
        {[...DESTINATIONS, "other"].map((d) => (
          <button key={d} className={choice === d ? "selected" : ""} onClick={() => setChoice(d)}>
            <Radio />
            <span>{d === "other" ? "Somewhere else" : d}</span>
          </button>
        ))}
      </div>
      {choice === "other" && (
        <div className="form-field sheet-field">
          <label htmlFor="destination-other">Destination area</label>
          <input
            id="destination-other"
            value={other}
            maxLength={60}
            onChange={(e) => setOther(e.target.value)}
            placeholder="For example, Storthes Hall bus stop"
          />
        </div>
      )}
      <fieldset className="time-chips">
        <legend>How long will it take?</legend>
        <div>
          {WALK_MINUTES.map((m) => (
            <button key={m} type="button" className={minutes === m ? "selected" : ""} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
              {m} min
            </button>
          ))}
        </div>
      </fieldset>
      <button className="primary teal share-route-submit" disabled={!name} onClick={() => onSave({ name, minutes })}>
        Save destination
      </button>
      <button className="sheet-cancel" onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}

function AddContactSheet({
  onAdd,
  onClose,
}: {
  onAdd: (c: { name: string; phone: string }) => Promise<string | null>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      id="add-contact-title"
      title="Add contact"
      intro="Someone you trust who can follow your route. Only you can see your contacts."
      className="add-contact-sheet"
      onClose={onClose}
    >
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return setError("Add their name.");
          if (phone.replace(/\D/g, "").length < 6) return setError("Add a phone number they can be texted on.");
          setBusy(true);
          const err = await onAdd({ name: name.trim().slice(0, 60), phone: phone.trim() });
          setBusy(false);
          if (err) setError(err);
        }}
      >
        <div className="form-field sheet-field">
          <label htmlFor="contact-name">Name</label>
          <input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </div>
        <div className="form-field sheet-field">
          <label htmlFor="contact-number">Mobile number</label>
          <input id="contact-number" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
        </div>
        {error && (
          <p className="form-error" role="alert">
            <Icon name="help" size={16} />
            {error}
          </p>
        )}
        <button className="primary teal share-route-submit" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save contact"}
        </button>
        <button className="sheet-cancel" type="button" onClick={onClose}>
          Cancel
        </button>
      </form>
    </Sheet>
  );
}
