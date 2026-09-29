"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";

export interface MapPoint {
  lat: number;
  lng: number;
  popup?: string;
  color?: string;
  radius?: number;
}

function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 150);
    const observer = new ResizeObserver(() => map.invalidateSize());
    const container = map.getContainer();
    if (container) observer.observe(container);
    return () => { clearTimeout(t); observer.disconnect(); };
  }, [map]);
  return null;
}

interface LeafletMiniMapProps {
  center: [number, number];
  zoom?: number;
  cctvPoints?: MapPoint[];
  policePoints?: MapPoint[];
  chopPoints?: MapPoint[];
  height?: string;
}

export default function LeafletMiniMap({
  center,
  zoom = 14,
  cctvPoints = [],
  policePoints = [],
  chopPoints = [],
  height = "320px",
}: LeafletMiniMapProps) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height, width: "100%" }}
      preferCanvas
    >
      <InvalidateOnResize />
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
        maxZoom={19}
      />

      {cctvPoints.map((p, i) => (
        <CircleMarker
          key={`cctv-${i}`}
          center={[p.lat, p.lng]}
          radius={p.radius ?? 5}
          pathOptions={{ color: "#1d4ed8", fillColor: "#3b82f6", fillOpacity: 0.85, weight: 1 }}
        >
          {p.popup && <Popup>{p.popup}</Popup>}
        </CircleMarker>
      ))}

      {policePoints.map((p, i) => (
        <CircleMarker
          key={`police-${i}`}
          center={[p.lat, p.lng]}
          radius={p.radius ?? 9}
          pathOptions={{ color: "#15803d", fillColor: "#22c55e", fillOpacity: 0.9, weight: 2 }}
        >
          {p.popup && <Popup>{p.popup}</Popup>}
        </CircleMarker>
      ))}

      {chopPoints.map((p, i) => (
        <CircleMarker
          key={`chop-${i}`}
          center={[p.lat, p.lng]}
          radius={p.radius ?? 7}
          pathOptions={{ color: "#000", fillColor: p.color ?? "#f97316", fillOpacity: 0.85, weight: 1.5 }}
        >
          {p.popup && <Popup>{p.popup}</Popup>}
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
