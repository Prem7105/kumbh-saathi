"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

interface AssignTaskModalProps {
  liveCaseId?: string;
  officialCaseId?: string;
  defaultZone?: string;
  onClose: () => void;
}

export default function AssignTaskModal({ liveCaseId, officialCaseId, defaultZone, onClose }: AssignTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState("medium");
  const [zoneName, setZoneName] = useState(defaultZone ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("Task title is required.");
      return;
    }
    if (assignedTo.trim() && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assignedTo.trim())) {
      setError("Enter the volunteer account UUID, or leave blank for an unassigned task.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const insertPayload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        assigned_to: assignedTo.trim() || null,
        priority,
        zone_name: zoneName.trim() || null,
      };

      if (liveCaseId) insertPayload.case_id = liveCaseId;
      if (officialCaseId) insertPayload.official_case_id = officialCaseId;

      const { data: taskData, error: insertError } = await supabase
        .from("volunteer_tasks")
        .insert(insertPayload)
        .select()
        .single();

      if (insertError) throw insertError;

      // Write case_updates
      const updatePayload: Record<string, unknown> = {
        update_type: "task_assigned",
        note: `Volunteer task assigned: ${title}`,
        actor: "command_center",
        metadata: { task_id: taskData.id, assigned_to: assignedTo, priority },
      };
      if (liveCaseId) updatePayload.case_id = liveCaseId;
      if (officialCaseId) updatePayload.official_case_id = officialCaseId;

      await supabase.from("case_updates").insert(updatePayload);

      // Audit log
      await supabase.rpc("create_audit_log", {
        p_actor: "command_center",
        p_action: "assigned_volunteer_task",
        p_entity_type: "volunteer_task",
        p_entity_id: taskData.id,
        p_pii_accessed: false,
        p_metadata: { case_id: liveCaseId ?? null, official_case_id: officialCaseId ?? null },
      });

      setSuccess(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to assign task.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="neo-card bg-white p-6 w-full max-w-md">
        <h3 className="text-lg font-black uppercase mb-4">Assign Volunteer Task</h3>

        {success ? (
          <div>
            <div className="neo-card bg-green-50 p-4 mb-4 font-bold text-green-800">
              Task assigned successfully!
            </div>
            <button className="neo-btn bg-black text-white px-4 py-2 text-sm w-full" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-black uppercase tracking-wide block mb-1">Title *</label>
              <input
                type="text"
                className="neo-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Search near Ramkund Ghat"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-wide block mb-1">Description</label>
              <textarea
                className="neo-input"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional instructions..."
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-wide block mb-1">Assign To</label>
              <input
                type="text"
                className="neo-input"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="Volunteer account UUID (leave blank for anyone)"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-black uppercase tracking-wide block mb-1">Priority</label>
                <select
                  className="neo-input"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-wide block mb-1">Zone</label>
                <input
                  type="text"
                  className="neo-input"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  placeholder="Zone Area 1"
                />
              </div>
            </div>

            {error && (
              <div className="neo-card bg-red-50 p-3 text-sm text-red-700 font-bold">{error}</div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                className="neo-btn bg-orange-500 text-white px-5 py-2 text-sm flex-1"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? "Assigning..." : "Assign Task"}
              </button>
              <button
                className="neo-btn bg-white text-black px-5 py-2 text-sm"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
