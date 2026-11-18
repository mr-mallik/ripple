"use client";

import { useEffect, useState } from "react";

// University of Huddersfield, Queensgate campus: the fallback when the
// device location isn't available or is refused.
export const QUEENSGATE = { lat: 53.6433, lng: -1.7781 };

export type LatLng = { lat: number; lng: number };

export function distanceMetres(a: LatLng, b: LatLng) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Move a point by metres north and east. */
export function offset(p: LatLng, northM: number, eastM: number): LatLng {
  const lat = p.lat + northM / 111320;
  const lng = p.lng + eastM / (111320 * Math.cos((p.lat * Math.PI) / 180));
  return { lat, lng };
}

export type DeviceLocation = {
  position: LatLng;
  /** "device" once the browser has given a fix, "fallback" while on Queensgate. */
  source: "device" | "fallback";
  error: string | null;
};

/** Follows the device location, starting from Queensgate until a fix arrives. */
export function useDeviceLocation(): DeviceLocation {
  const [state, setState] = useState<DeviceLocation>(() => ({
    position: QUEENSGATE,
    source: "fallback",
    error:
      typeof navigator !== "undefined" && !("geolocation" in navigator)
        ? "This device can't share its location, so the map is showing Queensgate campus."
        : null,
  }));

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) =>
        setState({
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          source: "device",
          error: null,
        }),
      (err) =>
        setState((s) => ({
          ...s,
          error:
            err.code === err.PERMISSION_DENIED
              ? "Location is off, so the map is showing Queensgate campus."
              : "Couldn't get your location yet.",
        })),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return state;
}

/** Re-renders every `ms` so relative times stay current. */
export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function timeAgo(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
