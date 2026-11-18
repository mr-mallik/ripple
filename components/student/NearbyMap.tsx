"use client";

import { useMemo, useState } from "react";
import MapView, { type MapFeature } from "@/components/MapView";
import Icon from "./Icon";
import { clock, timeAgo, type DeviceLocation } from "@/lib/geo";
import { placeName } from "@/lib/places";
import type { Alert } from "@/lib/types";

/** The home screen's live map: you, plus any heads-up zones around you. */
export default function NearbyMap({
  loc,
  alerts,
  now,
}: {
  loc: DeviceLocation;
  alerts: Alert[];
  now: number;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = alerts.find((a) => a.id === openId) ?? null;
  const here = loc.position;
  const area = placeName(here);

  const features = useMemo<MapFeature[]>(
    () =>
      alerts.map((a) => ({
        kind: "area",
        id: a.id,
        lat: a.lat,
        lng: a.lng,
        radius: a.radius_m,
        color: "#d9534f",
        pulse: true,
        selected: a.id === openId,
        title: "Recent reports",
      })),
    [alerts, openId],
  );

  return (
    <section className="town-map" aria-labelledby="nearby-activity-h">
      <div className="town-map-heading">
        <div>
          <p className="eyebrow">{area ?? (loc.source === "device" ? "Around you" : "Queensgate campus")}</p>
          <h2 id="nearby-activity-h">Nearby activity</h2>
        </div>
        <span className="live-pill">
          <i aria-hidden="true" /> Live
        </span>
      </div>
      <div className="town-map-canvas">
        <MapView
          label="Live map of safety heads-ups around you"
          center={here}
          recenterKey={`${here.lat.toFixed(4)},${here.lng.toFixed(4)}`}
          zoom={15}
          me={here}
          features={features}
          onFeatureClick={(id) => setOpenId((cur) => (cur === id ? null : id))}
          className="live-map"
        />
        {!open && (
          <div className="map-legend">
            <span>
              <i className="legend-zone" />
              Recent reports
            </span>
            <span>
              <i className="legend-you" />
              {loc.source === "device" ? "You are here" : "Queensgate (location off)"}
            </span>
          </div>
        )}
        {open && (
          <aside className="map-zone-card" aria-live="polite">
            <button aria-label="Close activity details" onClick={() => setOpenId(null)}>
              <Icon name="close" size={18} />
            </button>
            <p className="eyebrow">Safety heads-up</p>
            <h3>{placeName(open) ? `Near ${placeName(open)}` : "Take extra care here"}</h3>
            <div>
              <span>Sent {timeAgo(open.created_at, now)}</span>
              <span>Until {clock(open.expires_at)}</span>
            </div>
            <small>Several people reported feeling unsafe here. No names or descriptions are shared.</small>
          </aside>
        )}
      </div>
      <p className="map-rule">
        <Icon name="shield" size={14} />
        Zones appear when 2 or more people report within 400 m and 30 minutes.
      </p>
    </section>
  );
}
