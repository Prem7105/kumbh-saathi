"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import MapView from "./MapView";
import type { MapPoint } from "./LeafletMiniMap";

interface NearestCamera {
  camera_id?: string;
  latitude?: number;
  longitude?: number;
  distance_m?: number;
  distance_km?: number;
}

interface NearestPolice {
  station_name?: string;
  latitude?: number;
  longitude?: number;
  distance_m?: number;
  distance_km?: number;
}

interface NearestChokepoint {
  location_name?: string;
  category?: string;
  risk_level?: string;
  project_status?: string;
  note?: string;
  latitude?: number;
  longitude?: number;
  distance_km?: number;
}

interface SpatialContextProps {
  zoneName?: string | null;
  liveCaseId?: string;
  officialCaseId?: string;
}

const RISK_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-800 border-red-300",
  medium: "bg-yellow-100 text-yellow-900 border-yellow-300",
  low: "bg-green-100 text-green-800 border-green-300",
};

const RISK_DOT: Record<string, string> = {
  high: "#ef4444",
  medium: "#f97316",
  low: "#22c55e",
};

function fmt(km?: number, m?: number) {
  if (km != null) return `${km.toFixed(2)} km`;
  if (m != null) return `${Math.round(m)} m`;
  return "";
}

export default function SpatialContext({ zoneName, liveCaseId, officialCaseId }: SpatialContextProps) {
  const [cameras, setCameras] = useState<NearestCamera[]>([]);
  const [police, setPolice] = useState<NearestPolice[]>([]);
  const [chokepoints, setChokepoints] = useState<NearestChokepoint[]>([]);
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!zoneName) return;
    setLoading(true);
    setCameras([]); setPolice([]); setChokepoints([]); setCenter(null);

    supabase
      .from("zone_boundaries")
      .select("centroid_lat,centroid_lng")
      .eq("zone_name", zoneName)
      .maybeSingle()
      .then(async ({ data: zone }) => {
        if (!zone?.centroid_lat || !zone?.centroid_lng) { setLoading(false); return; }
        const lat = zone.centroid_lat as number;
        const lng = zone.centroid_lng as number;
        setCenter([lat, lng]);

        const [camRes, polRes, chopRes] = await Promise.all([
          supabase.rpc("nearest_cctv", { lat, lng, max_rows: 8 }),
          supabase.rpc("nearest_police", { lat, lng, max_rows: 3 }),
          supabase.rpc("nearest_chokepoints", { lat, lng, max_rows: 5 }),
        ]);

        if (camRes.data) setCameras(camRes.data as NearestCamera[]);
        if (polRes.data) setPolice(polRes.data as NearestPolice[]);
        if (chopRes.data) setChokepoints(chopRes.data as NearestChokepoint[]);
        setLoading(false);
      });
  }, [zoneName]);

  const requestReview = async (cameraId: string) => {
    setReviewingId(cameraId);
    setReviewError(null);
    try {
      const { data: requestId, error } = await supabase.rpc("request_manual_cctv_review", {
        p_camera_id: cameraId,
        p_requested_by: "command_center",
        p_case_id: liveCaseId ?? null,
        p_official_case_id: officialCaseId ?? null,
        p_note: reviewNote.trim() || "Manual CCTV location review requested. No automated footage analysis claimed.",
      });
      if (error) throw error;
      setReviewSuccess(`Request submitted (ID: ${String(requestId).slice(0, 8)})`);
      setTimeout(() => setReviewSuccess(null), 6000);
    } catch (e: unknown) {
      setReviewError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setReviewingId(null);
    }
  };

  if (!zoneName) return null;

  const cctvPoints: MapPoint[] = cameras
    .filter((c) => c.latitude && c.longitude)
    .map((c) => ({ lat: c.latitude!, lng: c.longitude!, popup: `Camera: ${c.camera_id ?? "—"} · ${fmt(c.distance_km, c.distance_m)}` }));

  const policePoints: MapPoint[] = police
    .filter((p) => p.latitude && p.longitude)
    .map((p) => ({ lat: p.latitude!, lng: p.longitude!, popup: p.station_name ?? "Police Station" }));

  const chopPoints: MapPoint[] = chokepoints
    .filter((ch) => ch.latitude && ch.longitude)
    .map((ch) => ({
      lat: ch.latitude!,
      lng: ch.longitude!,
      color: RISK_DOT[ch.risk_level ?? ""] ?? "#f97316",
      popup: `${ch.location_name ?? "Chokepoint"} [${ch.risk_level ?? "—"}]`,
    }));

  return (
    <div className="mt-6 space-y-4">
      <h4 className="text-sm font-black uppercase tracking-wide border-b-2 border-black pb-2">
        Spatial Context — {zoneName}
      </h4>

      {loading && <div className="text-sm text-gray-500">Loading spatial data…</div>}

      {!loading && center && (cctvPoints.length > 0 || policePoints.length > 0 || chopPoints.length > 0) && (
        <>
          <MapView
            center={center}
            zoom={14}
            cctvPoints={cctvPoints}
            policePoints={policePoints}
            chopPoints={chopPoints}
            height="280px"
          />
          {/* Legend */}
          <div className="flex gap-4 text-xs font-bold flex-wrap">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-blue-500 border border-black inline-block" /> CCTV ({cctvPoints.length})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-green-500 border border-black inline-block" /> Police ({policePoints.length})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-orange-500 border border-black inline-block" /> Chokepoints ({chopPoints.length})
            </span>
          </div>
        </>
      )}

      {/* CCTV review */}
      {!loading && cameras.length > 0 && (
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-gray-500 mb-2">
            Nearest Cameras — Request Manual Review
          </div>
          <input
            type="text"
            className="neo-input text-xs py-1 mb-2"
            placeholder="Review note (optional)"
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
          />
          {reviewSuccess && (
            <div className="neo-card bg-green-50 p-2 mb-2 text-xs font-bold text-green-800">{reviewSuccess}</div>
          )}
          {reviewError && (
            <div className="neo-card bg-red-50 p-2 mb-2 text-xs font-bold text-red-800">{reviewError}</div>
          )}
          <div className="space-y-1">
            {cameras.map((cam, i) => {
              const id = cam.camera_id ?? `cam-${i}`;
              return (
                <div key={id} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100">
                  <div className="text-xs">
                    <span className="font-black font-mono">{id}</span>
                    <span className="text-gray-400 ml-2">{fmt(cam.distance_km, cam.distance_m)}</span>
                  </div>
                  <button
                    className="neo-btn bg-black text-white text-[10px] px-2 py-0.5 flex-shrink-0"
                    onClick={() => requestReview(id)}
                    disabled={reviewingId === id}
                  >
                    {reviewingId === id ? "…" : "Request Review"}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            Camera location context only. No footage, face recognition, or automated analysis.
          </p>
        </div>
      )}

      {/* Police */}
      {!loading && police.length > 0 && (
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-gray-500 mb-2">
            Nearest Police Stations
          </div>
          {police.map((p, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-100 text-xs">
              <span className="font-bold">🚔 {p.station_name ?? `Station ${i + 1}`}</span>
              <span className="text-gray-400">{fmt(p.distance_km, p.distance_m)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Chokepoints */}
      {!loading && chokepoints.length > 0 && (
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-gray-500 mb-2">
            Nearest Chokepoints / Parking
          </div>
          <div className="space-y-2">
            {chokepoints.map((ch, i) => (
              <div key={i} className="neo-card p-3 text-xs">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-black">{ch.location_name ?? `Point ${i + 1}`}</span>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {ch.risk_level && (
                      <span className={`status-badge text-[10px] ${RISK_BADGE[ch.risk_level] ?? "bg-gray-100"}`}>
                        {ch.risk_level} risk
                      </span>
                    )}
                    {ch.distance_km != null && (
                      <span className="text-gray-400">{ch.distance_km.toFixed(2)} km</span>
                    )}
                  </div>
                </div>
                {ch.category && <div className="text-gray-500">Category: {ch.category}</div>}
                {ch.project_status && <div className="text-gray-500">Status: {ch.project_status}</div>}
                {ch.note && <div className="text-gray-600 italic mt-1">{ch.note}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && cameras.length === 0 && police.length === 0 && chokepoints.length === 0 && (
        <div className="text-sm text-gray-400 italic">No spatial data returned for this zone.</div>
      )}
    </div>
  );
}
