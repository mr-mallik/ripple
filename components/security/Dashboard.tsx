"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { Session } from "@supabase/supabase-js";
import MapView, { type MapFeature } from "@/components/MapView";
import { DemoBadge, btn } from "@/components/ui";
import { getSecurityClient } from "@/lib/supabase";
import { clock, distanceMetres, offset, timeAgo, useDeviceLocation, useNow, type LatLng } from "@/lib/geo";
import {
  CATEGORY_LABEL,
  reportRef,
  type Cluster,
  type ClusterEvent,
  type FormalRequest,
  type StudentConcern,
  type Report,
  type ReportCategory,
  type Walk,
} from "@/lib/types";

const REPORT_COLS =
  "id, category, lat, lng, details, is_anonymous, wants_formal_report, cluster_id, is_demo, created_at";

const STATUS_STYLE: Record<Cluster["status"], { label: string; chip: string; color: string }> = {
  open: { label: "Open", chip: "bg-coral text-white", color: "#D9534A" },
  acknowledged: { label: "Acknowledged", chip: "bg-amber-wash text-amber", color: "#B26A00" },
  closed: { label: "Closed", chip: "bg-line text-muted", color: "#5A6573" },
};

export default function Dashboard({ session }: { session: Session }) {
  const supabase = getSecurityClient();
  const me = session.user.id;
  const loc = useDeviceLocation();
  const now = useNow(15000);

  const [reports, setReports] = useState<Report[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [walks, setWalks] = useState<Walk[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [formal, setFormal] = useState<FormalRequest[]>([]);
  const [concerns, setConcerns] = useState<StudentConcern[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [flash, setFlash] = useState<
    { cluster: Cluster; kind: "new" } | { cluster: Cluster; kind: "grew"; added: number } | null
  >(null);
  const [mapCenter, setMapCenter] = useState<LatLng>(loc.position);
  const [recenter, setRecenter] = useState(0);
  /** Cluster id → report count at the last load; null until the first load. */
  const knownClusters = useRef<Map<string, number> | null>(null);

  // Centre on the device when its first fix arrives.
  const centredOnDevice = useRef(false);
  useEffect(() => {
    if (loc.source === "device" && !centredOnDevice.current) {
      centredOnDevice.current = true;
      setMapCenter(loc.position);
      setRecenter((n) => n + 1);
    }
  }, [loc.source, loc.position]);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const [r, c, w, s, fr, sc] = await Promise.all([
      supabase.from("reports").select(REPORT_COLS).gte("created_at", since).order("created_at", { ascending: false }).limit(500),
      supabase.from("clusters").select("*").gte("last_report_at", since).order("last_report_at", { ascending: false }),
      supabase.from("walks").select("*").gte("created_at", since).order("created_at", { ascending: false }),
      supabase.from("staff").select("user_id, display_name"),
      supabase.from("formal_requests").select("*").gte("created_at", weekAgo).order("created_at", { ascending: false }),
      supabase
        .from("student_concerns")
        .select("id, reported_name, reason, details, created_at")
        .gte("created_at", weekAgo)
        .order("created_at", { ascending: false }),
    ]);
    setFormal((fr.data as FormalRequest[]) ?? []);
    setConcerns((sc.data as StudentConcern[]) ?? []);
    const nextClusters = (c.data as Cluster[]) ?? [];
    setReports((r.data as Report[]) ?? []);
    setClusters(nextClusters);
    setWalks((w.data as Walk[]) ?? []);
    setStaffNames(Object.fromEntries(((s.data as { user_id: string; display_name: string }[]) ?? []).map((x) => [x.user_id, x.display_name])));

    // Flag clusters that appear, or grow, while the dashboard is open.
    const known = knownClusters.current;
    if (known) {
      const fresh = nextClusters.find((x) => !known.has(x.id));
      const grown = nextClusters.find(
        (x) => x.status !== "closed" && known.has(x.id) && x.report_count > (known.get(x.id) ?? 0),
      );
      if (fresh) {
        setFlash({ cluster: fresh, kind: "new" });
        setSelected(fresh.id);
      } else if (grown) {
        setFlash({ cluster: grown, kind: "grew", added: grown.report_count - (known.get(grown.id) ?? 0) });
      }
    }
    knownClusters.current = new Map(nextClusters.map((x) => [x.id, x.report_count]));
  }, [supabase]);

  // Live updates: reload on any change, batched.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = setTimeout(load, 0);
    const reload = () => {
      if (t) clearTimeout(t);
      t = setTimeout(load, 250);
    };
    const channel = supabase
      .channel("security-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "clusters" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "cluster_events" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "walks" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "formal_requests" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "student_concerns" }, reload)
      .subscribe();
    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  const selectedCluster = clusters.find((c) => c.id === selected) ?? null;
  const activeWalks = walks.filter((w) => w.status === "active" || w.status === "help");
  const openClusters = clusters.filter((c) => c.status !== "closed");
  const lastHour = reports.filter((r) => now - new Date(r.created_at).getTime() < 3600_000).length;

  const features = useMemo<MapFeature[]>(() => {
    const f: MapFeature[] = [];
    for (const c of clusters) {
      if (c.status === "closed" && c.id !== selected) continue;
      f.push({
        kind: "area",
        id: `cluster:${c.id}`,
        lat: c.lat,
        lng: c.lng,
        radius: 400,
        color: STATUS_STYLE[c.status].color,
        pulse: c.status === "open",
        selected: c.id === selected,
        title: `${c.report_count} linked reports · ${STATUS_STYLE[c.status].label}`,
      });
    }
    for (const r of reports) {
      const recent = now - new Date(r.created_at).getTime() < 30 * 60000;
      f.push({
        kind: "dot",
        id: r.cluster_id ? `cluster:${r.cluster_id}` : `report:${r.id}`,
        lat: r.lat,
        lng: r.lng,
        color: r.cluster_id ? "#A93A30" : "#D9534A",
        faded: !recent,
        title: `${CATEGORY_LABEL[r.category]} · ${clock(r.created_at)}`,
      });
    }
    for (const w of activeWalks) {
      if (w.last_lat == null || w.last_lng == null) continue;
      const overdue = new Date(w.expected_by).getTime() < now;
      f.push({
        kind: "walker",
        id: `walk:${w.id}`,
        lat: w.last_lat,
        lng: w.last_lng,
        color: w.status === "help" ? "#D9534A" : overdue ? "#B26A00" : "#6B3F94",
        title: `Walk to ${w.destination}${w.status === "help" ? " · HELP" : overdue ? " · overdue" : ""}`,
      });
    }
    return f;
  }, [clusters, reports, activeWalks, selected, now]);

  function focus(p: LatLng) {
    setMapCenter(p);
    setRecenter((n) => n + 1);
  }

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-navy px-4 py-3 text-mist sm:px-6">
        <div className="flex items-center gap-3">
          <Image src="/brand/ripple-logo-light.png" alt="Ripple" width={940} height={478} priority className="h-10 w-auto" />
          <span className="font-display text-xl font-bold text-paper">Security</span>
          <DemoBadge dark />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DemoControls center={mapCenter} onReset={() => setSelected(null)} />
          <span className="hidden text-sm sm:inline">{staffNames[me] ?? session.user.email}</span>
          <button className="rounded-xl px-3 py-2 text-sm font-semibold text-mist hover:bg-navy-2" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      {flash && (
        <div role="alert" className="rise flex flex-wrap items-center justify-between gap-3 bg-coral px-4 py-3 text-white sm:px-6">
          <p className="font-semibold">
            {flash.kind === "new"
              ? `New cluster: ${flash.cluster.report_count} reports close together in the last 30 minutes. A heads-up has been sent nearby.`
              : `${flash.added} more ${flash.added === 1 ? "report" : "reports"} linked to an ${STATUS_STYLE[flash.cluster.status].label.toLowerCase()} cluster (${flash.cluster.report_count} in total).`}
          </p>
          <div className="flex gap-2">
            <button
              className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-coral-deep"
              onClick={() => {
                setSelected(flash.cluster.id);
                focus(flash.cluster);
                setFlash(null);
              }}
            >
              Show on map
            </button>
            <button className="rounded-xl px-3 py-2 text-sm font-semibold hover:bg-coral-deep" onClick={() => setFlash(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative h-[45vh] shrink-0 lg:h-auto lg:flex-1">
          <MapView
            label="Live campus map of reports, clusters and walks"
            center={mapCenter}
            recenterKey={recenter}
            zoom={15}
            features={features}
            me={loc.source === "device" ? loc.position : null}
            onCenterChange={setMapCenter}
            onFeatureClick={(id) => {
              const [kind, key] = id.split(":");
              if (kind === "cluster") setSelected(key);
            }}
            className="h-full w-full"
          />
          <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex flex-col gap-2">
            <Legend />
          </div>
          <button
            className={`${btn.small} absolute right-3 top-3 z-[400] shadow`}
            onClick={() => focus(loc.position)}
          >
            {loc.source === "device" ? "My location" : "Queensgate campus"}
          </button>
        </div>

        <aside className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto border-l border-line bg-paper lg:w-[440px] lg:flex-none">
          <div className="grid grid-cols-3 gap-2 p-4">
            <Stat label="Open clusters" value={openClusters.length} tone={openClusters.some((c) => c.status === "open") ? "coral" : "plain"} />
            <Stat label="Reports, last hour" value={lastHour} />
            <Stat label="Active walks" value={activeWalks.length} tone={activeWalks.some((w) => w.status === "help") ? "coral" : "plain"} />
          </div>

          {selectedCluster ? (
            <ClusterDetail
              cluster={selectedCluster}
              reports={reports.filter((r) => r.cluster_id === selectedCluster.id)}
              formal={formal}
              staffNames={staffNames}
              me={me}
              now={now}
              onBack={() => setSelected(null)}
              onFocus={() => focus(selectedCluster)}
              onChanged={load}
            />
          ) : (
            <Overview
              clusters={clusters}
              reports={reports}
              walks={activeWalks}
              formal={formal}
              concerns={concerns}
              staffNames={staffNames}
              now={now}
              onSelect={(c) => {
                setSelected(c.id);
                focus(c);
              }}
              onFocus={focus}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ bits */

function Stat({ label, value, tone = "plain" }: { label: string; value: number; tone?: "plain" | "coral" }) {
  return (
    <div className={`flex flex-col gap-1 rounded-2xl p-3 ${tone === "coral" ? "bg-coral text-white" : "bg-card"}`}>
      <span className={`font-display text-3xl font-bold ${tone === "coral" ? "text-white" : "text-navy"}`}>{value}</span>
      <span className={`text-xs font-semibold ${tone === "coral" ? "text-white" : "text-muted"}`}>{label}</span>
    </div>
  );
}

function Legend() {
  const items = [
    { c: "#D9534A", t: "Report" },
    { c: "#A93A30", t: "Linked report" },
    { c: "#6B3F94", t: "Walk" },
    { c: "#B26A00", t: "Overdue / acknowledged" },
  ];
  return (
    <ul className="flex flex-col gap-1 rounded-xl bg-card/95 p-3 text-xs shadow">
      {items.map((i) => (
        <li key={i.t} className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: i.c }} aria-hidden="true" />
          {i.t}
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 px-4 pb-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-card p-4 text-sm text-muted">{children}</p>;
}

/* ------------------------------------------------------------------ overview */

function Overview({
  clusters,
  reports,
  walks,
  formal,
  concerns,
  staffNames,
  now,
  onSelect,
  onFocus,
}: {
  clusters: Cluster[];
  reports: Report[];
  walks: Walk[];
  formal: FormalRequest[];
  concerns: StudentConcern[];
  staffNames: Record<string, string>;
  now: number;
  onSelect: (c: Cluster) => void;
  onFocus: (p: LatLng) => void;
}) {
  const order: Record<Cluster["status"], number> = { open: 0, acknowledged: 1, closed: 2 };
  const sorted = [...clusters].sort(
    (a, b) => order[a.status] - order[b.status] || +new Date(b.last_report_at) - +new Date(a.last_report_at),
  );
  const walkRank = (w: Walk) => (w.status === "help" ? 0 : new Date(w.expected_by).getTime() < now ? 1 : 2);
  const sortedWalks = [...walks].sort((a, b) => walkRank(a) - walkRank(b));

  return (
    <>
      <Section title="Clusters">
        {sorted.length === 0 ? (
          <Empty>No clusters in the last 24 hours. Ripple flags 2+ reports within 400 m and 30 minutes.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => onSelect(c)}
                  className={`flex w-full flex-col gap-1 rounded-2xl border-l-[6px] bg-card p-4 text-left hover:bg-white ${
                    c.status === "open" ? "border-coral" : c.status === "acknowledged" ? "border-amber" : "border-line"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display font-bold text-navy">{c.report_count} linked reports</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[c.status].chip}`}>
                      {STATUS_STYLE[c.status].label}
                    </span>
                  </div>
                  <span className="text-sm text-muted">
                    Latest {timeAgo(c.last_report_at, now)}
                    {c.assigned_to ? ` · ${staffNames[c.assigned_to] ?? "Assigned"}` : " · Unassigned"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Walks">
        {sortedWalks.length === 0 ? (
          <Empty>No one is on a walk right now.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedWalks.map((w) => {
              const overdue = new Date(w.expected_by).getTime() < now;
              return (
                <li key={w.id}>
                  <button
                    onClick={() => w.last_lat != null && w.last_lng != null && onFocus({ lat: w.last_lat, lng: w.last_lng })}
                    className={`flex w-full flex-col gap-1 rounded-2xl p-4 text-left ${
                      w.status === "help" ? "bg-coral text-white" : overdue ? "bg-amber-wash" : "bg-card"
                    }`}
                  >
                    <span className={`font-semibold ${w.status === "help" ? "text-white" : "text-navy"}`}>
                      To {w.destination}
                    </span>
                    <span className={`text-sm ${w.status === "help" ? "text-white" : "text-ink"}`}>
                      {w.mode === "together"
                        ? `With a verified student${w.companion_name ? ` (${w.companion_name})` : ""}`
                        : w.mode === "shared"
                          ? "Route shared with a trusted contact"
                          : "Walking alone, followed by security"}
                    </span>
                    <span className={`text-sm ${w.status === "help" ? "text-white" : "text-muted"}`}>
                      {w.status === "help"
                        ? "Asked for help · go to their last location"
                        : overdue
                          ? `Overdue since ${clock(w.expected_by)}`
                          : `Due by ${clock(w.expected_by)}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Formal report requests">
        {formal.length === 0 ? (
          <Empty>No formal report requests in the last 7 days.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {formal.map((f) => (
              <li key={f.id} className="flex flex-col gap-1 rounded-2xl border-l-[6px] border-teal bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-navy">{f.full_name}</span>
                  <span className="text-xs text-muted">{timeAgo(f.created_at, now)}</span>
                </div>
                <span className="text-sm text-ink">
                  {f.contact} · prefers {f.preferred_contact === "either" ? "phone or email" : f.preferred_contact}
                </span>
                {f.statement && <p className="text-sm text-ink">{f.statement}</p>}
                <span className="text-xs text-muted">
                  Ref {reportRef(f.report_id)}
                  {f.support_person ? " · Wants to bring a support person" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Concerns about walk buddies">
        {concerns.length === 0 ? (
          <Empty>No concerns raised in the last 7 days.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {concerns.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 rounded-2xl bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-navy">{c.reported_name}</span>
                  <span className="text-xs text-muted">{timeAgo(c.created_at, now)}</span>
                </div>
                <span className="text-sm text-ink">{c.reason}</span>
                {c.details && <p className="text-sm text-ink">{c.details}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recent reports">
        {reports.length === 0 ? (
          <Empty>No reports in the last 24 hours.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {reports.slice(0, 20).map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => onFocus(r)}
                  className="flex w-full flex-col gap-1 rounded-2xl bg-card p-3 text-left hover:bg-white"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-navy">{CATEGORY_LABEL[r.category]}</span>
                    <span className="text-xs text-muted">{timeAgo(r.created_at, now)}</span>
                  </div>
                  {r.details && <span className="line-clamp-2 text-sm text-ink">{r.details}</span>}
                  <span className="text-xs text-muted">
                    Ref {reportRef(r.id)} · {r.cluster_id ? "In a cluster" : "Single report"}
                    {r.is_anonymous ? " · Anonymous" : " · Open to follow-up"}
                    {r.wants_formal_report ? " · Wants a formal report" : ""}
                    {r.is_demo ? " · Demo" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ cluster detail */

function summarise(cluster: Cluster, reports: Report[]) {
  const counts = new Map<ReportCategory, number>();
  for (const r of reports) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  const breakdown = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const spanMin = Math.max(
    1,
    Math.round((new Date(cluster.last_report_at).getTime() - new Date(cluster.first_report_at).getTime()) / 60000),
  );
  const spread = reports.reduce((m, r) => Math.max(m, distanceMetres(cluster, r)), 0);
  const formal = reports.filter((r) => r.wants_formal_report).length;
  const followUp = reports.filter((r) => !r.is_anonymous).length;
  return { breakdown, spanMin, spread: Math.max(50, Math.round(spread / 50) * 50), formal, followUp };
}

const EVENT_LABEL: Record<ClusterEvent["kind"], string> = {
  created: "Cluster flagged",
  report_added: "Report linked",
  alert_sent: "Heads-up sent",
  acknowledged: "Acknowledged",
  assigned: "Assigned",
  note: "Note",
  closed: "Closed",
  reopened: "Reopened",
};

function ClusterDetail({
  cluster,
  reports,
  formal,
  staffNames,
  me,
  now,
  onBack,
  onFocus,
  onChanged,
}: {
  cluster: Cluster;
  reports: Report[];
  formal: FormalRequest[];
  staffNames: Record<string, string>;
  me: string;
  now: number;
  onBack: () => void;
  onFocus: () => void;
  onChanged: () => void;
}) {
  const supabase = getSecurityClient();
  const [events, setEvents] = useState<ClusterEvent[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = summarise(cluster, reports);

  const loadEvents = useCallback(async () => {
    const { data } = await supabase
      .from("cluster_events")
      .select("*")
      .eq("cluster_id", cluster.id)
      .order("created_at", { ascending: false });
    setEvents((data as ClusterEvent[]) ?? []);
  }, [supabase, cluster.id]);

  // Reload the log whenever the cluster or its reports change.
  useEffect(() => {
    const t = setTimeout(loadEvents, 0);
    return () => clearTimeout(t);
  }, [loadEvents, cluster.report_count, cluster.status, cluster.assigned_to]);

  async function act(patch: Partial<Cluster> | null, kind: ClusterEvent["kind"], text?: string) {
    setBusy(true);
    setError(null);
    if (patch) {
      const { error } = await supabase.from("clusters").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", cluster.id);
      if (error) {
        setBusy(false);
        setError("That didn't save. Try again.");
        return;
      }
    }
    const { error } = await supabase.from("cluster_events").insert({ cluster_id: cluster.id, actor_id: me, kind, note: text ?? null });
    setBusy(false);
    if (error) setError("The log entry didn't save. Try again.");
    await loadEvents();
    onChanged();
  }

  return (
    <div className="flex flex-col gap-5 px-4 pb-6">
      <button onClick={onBack} className="self-start font-semibold text-teal-deep">
        ← All activity
      </button>

      <section className="flex flex-col gap-3 rounded-2xl bg-navy p-5 text-mist">
        <div className="flex items-center justify-between gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[cluster.status].chip}`}>
            {STATUS_STYLE[cluster.status].label}
          </span>
          <button onClick={onFocus} className="text-sm font-semibold text-coral-soft">
            Show on map
          </button>
        </div>
        <h2 className="text-2xl font-bold text-paper">
          {cluster.report_count} reports in {s.spanMin} min
        </h2>
        <p>
          Within about {s.spread} m, between {clock(cluster.first_report_at)} and {clock(cluster.last_report_at)}. Latest{" "}
          {timeAgo(cluster.last_report_at, now)}.
        </p>
        <ul className="flex flex-wrap gap-2">
          {s.breakdown.map(([c, n]) => (
            <li key={c} className="rounded-full bg-navy-2 px-3 py-1 text-sm text-paper">
              {CATEGORY_LABEL[c]} × {n}
            </li>
          ))}
        </ul>
        {(s.formal > 0 || s.followUp > 0) && (
          <p className="text-sm text-coral-soft">
            {s.formal > 0 && `${s.formal} ${s.formal === 1 ? "wants" : "want"} help making a formal report. `}
            {s.followUp > 0 && `${s.followUp} ${s.followUp === 1 ? "is" : "are"} open to follow-up in the app.`}
          </p>
        )}
        <p className="text-sm text-[#cdbfe0]">
          Assigned to {cluster.assigned_to ? (staffNames[cluster.assigned_to] ?? "staff") : "no one yet"}.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-2">
        {cluster.status === "open" && (
          <button className={btn.small} disabled={busy} onClick={() => act({ status: "acknowledged" }, "acknowledged")}>
            Acknowledge
          </button>
        )}
        {cluster.assigned_to !== me && cluster.status !== "closed" && (
          <button
            className={btn.small}
            disabled={busy}
            onClick={() => act({ assigned_to: me }, "assigned", `Assigned to ${staffNames[me] ?? "me"}`)}
          >
            Assign to me
          </button>
        )}
        {cluster.status !== "closed" ? (
          <button className={btn.small} disabled={busy} onClick={() => act({ status: "closed" }, "closed", "Heads-up ended.")}>
            Close
          </button>
        ) : (
          <button className={btn.small} disabled={busy} onClick={() => act({ status: "open" }, "reopened")}>
            Reopen
          </button>
        )}
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!note.trim()) return;
          act(null, "note", note.trim()).then(() => setNote(""));
        }}
      >
        <label htmlFor="note" className="font-semibold text-navy">
          Add to the response log
        </label>
        <div className="flex gap-2">
          <input
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            placeholder="For example, patrol sent to the library steps"
            className="min-h-10 flex-1 rounded-xl border border-line bg-white px-3 text-sm"
          />
          <button type="submit" className={btn.small} disabled={busy || !note.trim()}>
            Add
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-coral-deep">
            {error}
          </p>
        )}
      </form>

      <Section title="Reports in this cluster">
        <ul className="-mx-4 flex flex-col gap-2">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 rounded-2xl bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-navy">{CATEGORY_LABEL[r.category]}</span>
                <span className="text-xs text-muted">{clock(r.created_at)}</span>
              </div>
              {r.details ? <p className="text-sm text-ink">{r.details}</p> : <p className="text-sm text-muted">No details given.</p>}
              <span className="text-xs text-muted">
                Ref {reportRef(r.id)} · {r.is_anonymous ? "Anonymous" : "Open to follow-up"}
                {r.wants_formal_report ? " · Wants a formal report" : ""}
              </span>
              {formal
                .filter((f) => f.report_id === r.id)
                .map((f) => (
                  <span key={f.id} className="rounded-xl bg-teal-wash p-2 text-xs text-teal-deep">
                    Formal request from {f.full_name} · {f.contact} · prefers{" "}
                    {f.preferred_contact === "either" ? "phone or email" : f.preferred_contact}
                    {f.support_person ? " · bringing a support person" : ""}
                  </span>
                ))}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">Details are visible to security staff only and are never sent in public heads-ups.</p>
      </Section>

      <Section title="Response log">
        <ol className="-mx-4 flex flex-col gap-0 border-l-2 border-line pl-4">
          {events.map((e) => (
            <li key={e.id} className="relative pb-4">
              <span className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full bg-teal" aria-hidden="true" />
              <p className="text-sm">
                <span className="font-semibold text-navy">{EVENT_LABEL[e.kind]}</span>
                <span className="text-muted">
                  {" "}
                  · {clock(e.created_at)} · {e.actor_id ? (staffNames[e.actor_id] ?? "Staff") : "Ripple"}
                </span>
              </p>
              {e.note && <p className="text-sm text-ink">{e.note}</p>}
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ demo controls */

const SCRIPT: { delay: number; north: number; east: number; category: ReportCategory; details: string | null }[] = [
  { delay: 0, north: 60, east: -40, category: "grabbed", details: "Someone grabbed my arm by the library entrance, then walked off fast." },
  { delay: 2500, north: 900, east: 700, category: "verbal", details: "Shouting from a car." },
  { delay: 5000, north: -70, east: 110, category: "followed", details: "A man followed me from the bus stop towards campus." },
  { delay: 8000, north: 140, east: 60, category: "grabbed", details: "Grabbed from behind on the path. He ran towards the ring road." },
  { delay: 11000, north: -20, east: -150, category: "verbal", details: null },
];

function DemoControls({ center, onReset }: { center: LatLng; onReset: () => void }) {
  const supabase = getSecurityClient();
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function play() {
    setPlaying(true);
    setError(null);
    const origin = center;
    SCRIPT.forEach((step, i) => {
      timers.current.push(
        setTimeout(async () => {
          const p = offset(origin, step.north, step.east);
          const { error } = await supabase.rpc("demo_add_report", {
            p_lat: p.lat,
            p_lng: p.lng,
            p_category: step.category,
            p_details: step.details,
          });
          if (error) setError("Demo report failed");
          if (i === SCRIPT.length - 1) setPlaying(false);
        }, step.delay),
      );
    });
  }

  async function reset() {
    if (!window.confirm("Clear all reports, clusters, heads-ups and walks? This is for rehearsing the demo.")) return;
    const { error } = await supabase.rpc("demo_reset");
    if (error) setError("Reset failed");
    onReset();
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-sm text-coral-soft">{error}</span>}
      <button
        onClick={play}
        disabled={playing}
        className="rounded-xl bg-coral px-3 py-2 text-sm font-semibold text-white hover:bg-coral-deep disabled:opacity-60"
      >
        {playing ? "Playing demo…" : "Play demo"}
      </button>
      <button onClick={reset} className="rounded-xl border border-navy-2 px-3 py-2 text-sm font-semibold text-mist hover:bg-navy-2">
        Reset demo
      </button>
    </div>
  );
}
