"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Camera {
  id: string;
  name?: string;
  location?: string;
  lat?: number;
  lng?: number;
  distance_m?: number;
}

interface CCTVReviewModalProps {
  liveCaseId?: string;
  officialCaseId?: string;
  zoneName: string;
  onClose: () => void;
}

export default function CCTVReviewModal({ liveCaseId, officialCaseId, zoneName, onClose }: CCTVReviewModalProps) {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Try to get zone centroid and find nearest cameras
    supabase
      .from("zone_boundaries")
      .select("centroid_lat, centroid_lng")
      .eq("zone_name", zoneName)
      .maybeSingle()
      .then(async ({ data: zone }) => {
        if (zone?.centroid_lat && zone?.centroid_lng) {
          const { data } = await supabase.rpc("nearest_cctv", {
            lat: zone.centroid_lat,
            lng: zone.centroid_lng,
            max_rows: 8,
          });
          setCameras((data as Camera[]) ?? []);
        }
        setFetching(false);
      });
  }, [zoneName]);

  const handleSubmit = async () => {
    if (!selectedCamera) {
      setError("Please select a camera.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const { data: reviewData, error: insertError } = await supabase
        .from("cctv_review_requests")
        .insert({
          case_id: liveCaseId ?? null,
          official_case_id: officialCaseId ?? null,
          camera_id: selectedCamera,
          requested_by: "command_center",
          note: note.trim() || "Manual review requested. No automated footage analysis claimed.",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      await supabase.rpc("create_audit_log", {
        p_actor: "command_center",
        p_action: "requested_manual_cctv_review",
        p_entity_type: "cctv_review_request",
        p_entity_id: reviewData.id,
        p_pii_accessed: false,
        p_metadata: { camera_id: selectedCamera, case_id: liveCaseId ?? null, official_case_id: officialCaseId ?? null },
      });

      setSuccess(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit CCTV review request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="neo-card bg-white p-6 w-full max-w-md">
        <h3 className="text-lg font-black uppercase mb-2">Request Manual CCTV Review</h3>
        <p className="text-xs text-gray-500 mb-4 font-medium">
          This requests a manual camera location review only. No automated footage analysis or face recognition is performed.
        </p>

        {success ? (
          <div>
            <div className="neo-card bg-green-50 p-4 mb-4 font-bold text-green-800">
              CCTV review request submitted and audit logged.
            </div>
            <button className="neo-btn bg-black text-white px-4 py-2 text-sm w-full" onClick={onClose}>Close</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-black uppercase tracking-wide block mb-1">Zone</label>
              <div className="neo-input bg-gray-50 text-gray-600">{zoneName || "—"}</div>
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-wide block mb-1">
                Nearest Cameras {fetching ? "(loading...)" : `(${cameras.length} found)`}
              </label>
              {cameras.length > 0 ? (
                <select
                  className="neo-input"
                  value={selectedCamera}
                  onChange={(e) => setSelectedCamera(e.target.value)}
                >
                  <option value="">Select camera...</option>
                  {cameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>
                      {cam.name ?? cam.id} {cam.distance_m ? `(${Math.round(cam.distance_m)}m)` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  className="neo-input"
                  value={selectedCamera}
                  onChange={(e) => setSelectedCamera(e.target.value)}
                  placeholder="Enter camera ID manually"
                />
              )}
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-wide block mb-1">Note</label>
              <textarea
                className="neo-input"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Manual review requested. No automated footage analysis claimed."
              />
            </div>

            {error && <div className="neo-card bg-red-50 p-3 text-sm text-red-700 font-bold">{error}</div>}

            <div className="flex gap-3 pt-2">
              <button
                className="neo-btn bg-black text-white px-5 py-2 text-sm flex-1"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? "Submitting..." : "Submit Request"}
              </button>
              <button className="neo-btn bg-white text-black px-5 py-2 text-sm" onClick={onClose} disabled={loading}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
