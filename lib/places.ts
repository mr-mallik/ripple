import { distanceMetres, type LatLng } from "./geo";

// Rough areas, used only to give locations a friendly name. Add your own areas here.
// Each has a radius so we only say "near X" when it's reasonably close.
const AREAS: { name: string; lat: number; lng: number; radius: number }[] = [
  { name: "Huddersfield station", lat: 53.6485, lng: -1.7846, radius: 220 },
  { name: "University of Huddersfield", lat: 53.6433, lng: -1.7781, radius: 420 },
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

export const DESTINATIONS = ["Home", "Train station", "Bus station", "Town centre", "Work", "A friend's place"];

export const MEETING_POINTS = [
  "A staffed reception or front desk",
  "A busy, well-lit entrance",
  "Inside an open café or shop",
];

export const WALK_MINUTES = [5, 10, 15, 20, 30];
