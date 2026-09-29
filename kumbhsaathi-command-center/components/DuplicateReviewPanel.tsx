"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DuplicateReview } from "@/lib/types";

const REVIEW_STATUS_COLORS: Record<string, string> = {
  needs_review: "bg-yellow-100 text-yellow-900",
  merged: "bg-blue-100 text-blue-900",
  not_duplicate: "bg-green-100 text-green-900",
};

export default function DuplicateReviewPanel() {
  const [reviews, setReviews] = useState<DuplicateReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("needs_review");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = supabase
        .from("duplicate_reviews")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (filterStatus !== "all") query.eq("review_status", filterStatus);

      const { data, error: dbError } = await query;
      if (dbError) throw dbError;
      setReviews((data as DuplicateReview[]) ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load duplicate reviews.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateStatus = async (reviewId: string, newStatus: string) => {
    setUpdating(reviewId);
    try {
      const { error: updateError } = await supabase
        .from("duplicate_reviews")
        .update({ review_status: newStatus, reviewer: "command_center", updated_at: new Date().toISOString() })
        .eq("id", reviewId);

      if (updateError) throw updateError;

      const review = reviews.find((r) => r.id === reviewId);
      if (review) {
        await supabase.from("case_updates").insert({
          official_case_id: review.primary_case_id,
          update_type: "duplicate_review_updated",
          note: `Duplicate review set to: ${newStatus}`,
          actor: "command_center",
          metadata: { review_id: reviewId, candidate_id: review.candidate_case_id },
        });

        await supabase.rpc("create_audit_log", {
          p_actor: "command_center",
          p_action: "reviewed_duplicate",
          p_entity_type: "duplicate_review",
          p_entity_id: reviewId,
          p_pii_accessed: false,
          p_metadata: { new_status: newStatus },
        });
      }

      setReviews((prev) => prev.map((r) => r.id === reviewId ? { ...r, review_status: newStatus } : r));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update review.");
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl font-black uppercase tracking-wide text-white">Duplicate Review Queue</h2>
        <div className="flex gap-2 items-center">
          <select
            className="neo-input text-sm py-1.5 w-auto"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="needs_review">Needs Review</option>
            <option value="merged">Merged</option>
            <option value="not_duplicate">Not Duplicate</option>
            <option value="all">All</option>
          </select>
          <button className="neo-btn bg-black text-white text-xs px-3 py-2" onClick={load}>↺</button>
        </div>
      </div>

      {error && <div className="neo-card bg-red-50 p-3 mb-4 text-sm text-red-700 font-bold">{error}</div>}

      {loading ? (
        <div className="neo-card p-8 text-center text-gray-500 font-bold">Loading...</div>
      ) : reviews.length === 0 ? (
        <div className="neo-card p-8 text-center text-gray-500 font-bold">No duplicate reviews in this status.</div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="neo-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-wide text-gray-500 mb-1">
                    Primary vs Candidate
                  </div>
                  <div className="font-black text-sm">
                    <span className="font-mono">{r.primary_case_id}</span>
                    {r.primary_source && <span className="text-gray-400 ml-1">({r.primary_source})</span>}
                    <span className="mx-2 text-gray-400">vs</span>
                    <span className="font-mono">{r.candidate_case_id}</span>
                    {r.candidate_source && <span className="text-gray-400 ml-1">({r.candidate_source})</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`status-badge ${REVIEW_STATUS_COLORS[r.review_status] ?? "bg-gray-100"}`}>
                    {r.review_status}
                  </span>
                  {r.score !== null && (
                    <span className="text-xs font-black">Score: {(r.score * 100).toFixed(0)}%</span>
                  )}
                </div>
              </div>

              {r.reasons && r.reasons.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-black uppercase tracking-wide text-gray-400 mb-1">Reasons</div>
                  <div className="flex flex-wrap gap-1">
                    {r.reasons.map((reason, i) => (
                      <span key={i} className="status-badge bg-gray-100 text-gray-700 text-[10px]">{reason}</span>
                    ))}
                  </div>
                </div>
              )}

              {r.reviewer && (
                <div className="text-xs text-gray-500 mb-2">Reviewed by: {r.reviewer}</div>
              )}

              {r.review_status === "needs_review" && (
                <div className="flex gap-2 flex-wrap">
                  <button
                    className="neo-btn bg-blue-500 text-white text-xs px-4 py-1.5"
                    onClick={() => updateStatus(r.id, "merged")}
                    disabled={updating === r.id}
                  >
                    Mark Merged
                  </button>
                  <button
                    className="neo-btn bg-green-500 text-white text-xs px-4 py-1.5"
                    onClick={() => updateStatus(r.id, "not_duplicate")}
                    disabled={updating === r.id}
                  >
                    Not Duplicate
                  </button>
                </div>
              )}

              <div className="text-[10px] text-gray-400 mt-2">
                {new Date(r.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
