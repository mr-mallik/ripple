import { distanceMetres, type LatLng } from "./geo";

// Rough areas around Huddersfield, used only to give locations a friendly name.
// Each has a radius so we only say "near X" when it's reasonably close.
const AREAS: { name: string; lat: number; lng: number; radius: number }[] = [
  { name: "Huddersfield station", lat: 53.6485, lng: -1.7846, radius: 220 },
  { name: "Queensgate campus", lat: 53.6433, lng: -1.7781, radius: 420 },
  { name: "Greenhead Park", lat: 53.6489, lng: -1.7955, radius: 350 },
  { name: "Huddersfield town centre", lat: 53.6463, lng: -1.7836, radius: 700 },
];

/** A friendly area name for a point, or null when it isn't near anywhere we know. */
export function placeName(p: LatLng): string | null {
  let best: { name: string; d: number } | null = null;
  for (const a of AREAS) {
    const d = distanceMetres(p, a);
    if (d <= a.radius && (!best || d < best.d)) best = { name: a.name, d };
  }
  return best?.name ?? null;
}

/** About how many minutes it takes to walk a distance. */
export function walkingMinutes(metres: number) {
  return Math.max(1, Math.round(metres / 80));
}

export const DESTINATIONS = [
  "Library",
  "Student Central",
  "Haslett Building",
  "Huddersfield station",
  "Town centre bus station",
];

export const MEETING_POINTS = [
  "Main entrance, Haslett Building",
  "Library reception desk",
  "Student centre welcome desk",
];

export const WALK_MINUTES = [5, 10, 15, 20, 30];
