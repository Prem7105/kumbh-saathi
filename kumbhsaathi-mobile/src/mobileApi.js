import { hasSupabaseConfig, supabase, volunteerName } from "./supabase";

function localId(prefix) {
  return `${prefix}-${volunteerName}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const pendingReports = new Map();
async function saveReport(report) {
  const key = JSON.stringify(report);
  let requestId = pendingReports.get(key);
  if (!requestId) {
    requestId = localId("mobile");
    if (pendingReports.size >= 100) pendingReports.delete(pendingReports.keys().next().value);
    pendingReports.set(key, requestId);
  }
  const result = await supabase.rpc("create_intake_case", { p_report: report, p_request_id: requestId });
  if (!result.error) pendingReports.delete(key);
  return result;
}

function locationText(gpsLocation) {
  if (!gpsLocation) return "location unavailable";
  return `${gpsLocation.latitude.toFixed(6)}, ${gpsLocation.longitude.toFixed(6)}`;
}

export async function submitEmergencyAlert({ gpsLocation }) {
  const gpsText = locationText(gpsLocation);

  if (!hasSupabaseConfig) {
    return { id: localId("demo-sos"), demoMode: true };
  }

  const { data: liveCase, error: caseError } = await saveReport({
      source: "mobile_app",
      source_detail: volunteerName,
      case_type: "missing",
      priority: "critical",
      status: "open",
      last_seen_location: gpsText,
      raw_report: `Emergency SOS from ${volunteerName} at ${gpsText}.`,
      structured_data: { mobile_intent: "emergency_sos", gps: gpsLocation },
      risk_flags: gpsLocation ? ["mobile_sos", "location_attached"] : ["mobile_sos"],
  });
  if (caseError) throw caseError;
  return { id: liveCase.id, demoMode: false };
}

export async function submitMissingReport({ personName, ageBand, gender, lastSeenLocation, details, gpsLocation }) {
  const cleanName = personName.trim();
  const cleanAgeBand = ageBand.trim();
  const cleanGender = gender.trim();
  const cleanLocation = lastSeenLocation.trim();
  const cleanDetails = details.trim();
  const gpsText = locationText(gpsLocation);

  if (!hasSupabaseConfig) {
    return { id: localId("demo-missing"), demoMode: true };
  }

  const { data: liveCase, error: caseError } = await saveReport({
      source: "mobile_app",
      source_detail: volunteerName,
      case_type: "missing",
      priority: "high",
      status: "open",
      missing_person_name: cleanName || null,
      age_band: cleanAgeBand || null,
      gender: cleanGender || "Unknown",
      last_seen_location: cleanLocation || gpsText,
      raw_report: cleanDetails || "Mobile missing-person report",
      physical_description: cleanDetails || null,
      structured_data: {
        mobile_intent: "missing_person",
        gps: gpsLocation,
        entered_by: volunteerName,
      },
      risk_flags: gpsLocation ? ["mobile_missing_report", "location_attached"] : ["mobile_missing_report"],
  });
  if (caseError) throw caseError;
  return { id: liveCase.id, demoMode: false };
}

export async function submitTrustCheck({ message }) {
  const cleanMessage = message.trim();

  if (!hasSupabaseConfig) {
    return { id: localId("demo-trust"), demoMode: true };
  }

  const { data, error } = await supabase.rpc("submit_trust_report", { p_message: cleanMessage });
  if (error) throw error;
  return { id: data, demoMode: false };
}
