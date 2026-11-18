"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@/lib/geo";

export type MapFeature =
  | { kind: "dot"; id: string; lat: number; lng: number; color: string; title?: string; faded?: boolean }
  | { kind: "area"; id: string; lat: number; lng: number; radius: number; color: string; title?: string; pulse?: boolean; selected?: boolean }
  | { kind: "walker"; id: string; lat: number; lng: number; color: string; title?: string };

type Props = {
  center: LatLng;
  /** Change this to fly the map to `center` again. */
  recenterKey?: string | number;
  zoom?: number;
  features?: MapFeature[];
  me?: LatLng | null;
  pin?: LatLng | null;
  onPinMove?: (p: LatLng) => void;
  onFeatureClick?: (id: string) => void;
  onCenterChange?: (p: LatLng) => void;
  className?: string;
  label: string;
};

const pinIcon = L.divIcon({
  className: "",
  html: '<div class="ripple-pin" aria-hidden="true"></div>',
  iconSize: [36, 36],
  iconAnchor: [18, 34],
});

const meIcon = L.divIcon({
  className: "",
  html: '<div class="ripple-me" aria-hidden="true"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

export default function MapView({
  center,
  recenterKey,
  zoom = 16,
  features = [],
  me,
  pin,
  onPinMove,
  onFeatureClick,
  onCenterChange,
  className,
  label,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const pinRef = useRef<L.Marker | null>(null);
  const meRef = useRef<L.Marker | null>(null);
  const handlers = useRef({ onPinMove, onFeatureClick, onCenterChange });
  useEffect(() => {
    handlers.current = { onPinMove, onFeatureClick, onCenterChange };
  });

  // Create the map once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: true }).setView(
      [center.lat, center.lng],
      zoom,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (pinRef.current && handlers.current.onPinMove) {
        handlers.current.onPinMove({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    });
    map.on("moveend", () => {
      const c = map.getCenter();
      handlers.current.onCenterChange?.({ lat: c.lat, lng: c.lng });
    });
    mapRef.current = map;
    // The container can resize after first paint (flex layouts, dialogs).
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(elRef.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      pinRef.current = null;
      meRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly to the centre when asked.
  useEffect(() => {
    mapRef.current?.setView([center.lat, center.lng], mapRef.current.getZoom(), { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey]);

  // Draw features.
  useEffect(() => {
    const group = layerRef.current;
    if (!group) return;
    group.clearLayers();
    for (const f of features) {
      let layer: L.Layer;
      if (f.kind === "area") {
        layer = L.circle([f.lat, f.lng], {
          radius: f.radius,
          color: f.color,
          weight: f.selected ? 4 : 2,
          fillColor: f.color,
          fillOpacity: f.selected ? 0.22 : 0.12,
          className: f.pulse ? "ripple-pulse" : undefined,
        });
      } else if (f.kind === "walker") {
        layer = L.circleMarker([f.lat, f.lng], {
          radius: 9,
          color: "#FFFDF9",
          weight: 3,
          fillColor: f.color,
          fillOpacity: 1,
        });
      } else {
        layer = L.circleMarker([f.lat, f.lng], {
          radius: 7,
          color: "#FFFDF9",
          weight: 2,
          fillColor: f.color,
          fillOpacity: f.faded ? 0.45 : 0.95,
        });
      }
      if (f.title) layer.bindTooltip(f.title, { direction: "top" });
      layer.on("click", () => handlers.current.onFeatureClick?.(f.id));
      group.addLayer(layer);
    }
  }, [features]);

  // The draggable report pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!pin) {
      pinRef.current?.remove();
      pinRef.current = null;
      return;
    }
    if (!pinRef.current) {
      const m = L.marker([pin.lat, pin.lng], {
        icon: pinIcon,
        draggable: true,
        keyboard: true,
        title: "Report location",
      }).addTo(map);
      m.on("dragend", () => {
        const p = m.getLatLng();
        handlers.current.onPinMove?.({ lat: p.lat, lng: p.lng });
      });
      pinRef.current = m;
    } else {
      pinRef.current.setLatLng([pin.lat, pin.lng]);
    }
  }, [pin]);

  // "You are here".
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!me) {
      meRef.current?.remove();
      meRef.current = null;
      return;
    }
    if (!meRef.current) {
      meRef.current = L.marker([me.lat, me.lng], { icon: meIcon, interactive: false }).addTo(map);
    } else {
      meRef.current.setLatLng([me.lat, me.lng]);
    }
  }, [me]);

  return <div ref={elRef} role="region" aria-label={label} className={className} />;
}
