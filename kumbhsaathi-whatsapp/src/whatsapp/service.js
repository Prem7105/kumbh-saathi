const {
  createLiveCase,
  createTrustCheck,
  updateLiveCaseLocation,
  updateLiveCaseCoordinates,
  searchOfficialCases,
  nearestPolice,
} = require("./db");
const { analyzeMessage, composeNearestPoliceReply, composePoliceLocationSentReply } = require("./openaiAgent");
const { sendWhatsAppLocation } = require("./twilio");
const fs = require("fs");
const path = require("path");

const pendingSessions = new Map();
const recentCases = new Map();
let localPoliceStations;

async function handleMessage(inbound) {
  const text = (inbound.body || "").trim();
  const from = inbound.from || "whatsapp:+919876543210";

  if (!text) {
    const lat = numberOrNull(inbound.latitude);
    const lng = numberOrNull(inbound.longitude);
    if (lat !== null && lng !== null) {
      return handleSharedLocation(from, lat, lng, inbound.messageSid);
    }
    return {
      kind: "empty",
      reply: "Please send your message.",
    };
  }

  const lat = numberOrNull(inbound.latitude);
  const lng = numberOrNull(inbound.longitude);
  if (lat !== null && lng !== null) {
    return handleSharedLocation(from, lat, lng, inbound.messageSid);
  }

  const pending = pendingSessions.get(from);
  if (pending?.field === "last_seen_location") {
    const analysis = await analyzeOrHelp(text);
    const location =
      analysis.person_report?.last_seen_location ||
      analysis.location;

    if (!location || analysis.intent === "help" || analysis.intent === "status" || /^\d+$/.test(String(location).trim())) {
      return {
        kind: "follow_up",
        reply: analysis.reply || pending.reply || "OK",
      };
    }

    const updated = await safeDb("update location", () => updateLiveCaseLocation(pending.caseId, String(location).trim(), null));
    pendingSessions.delete(from);
    return {
      kind: "live_case_update",
      liveCase: updated,
      reply: pending.ack || "OK",
    };
  }

  if (pending?.field === "help_location") {
    pendingSessions.delete(from);
    return handleMessage(inbound);
  }

  if (pending?.field === "nearest_police_location") {
    return {
      kind: "nearest_police",
      reply: pending.reply || "Please share your WhatsApp location.",
    };
  }

  const analysis = applyCommandIntentOverride(text, await analyzeOrHelp(text));
  const intent = analysis.intent;

  if (intent === "nearest_police") {
    pendingSessions.set(from, {
      field: "nearest_police_location",
      replyLanguage: analysis.reply_language || "unknown",
      reply: analysis.reply || "Please share your WhatsApp location.",
    });
    return {
      kind: "nearest_police",
      analysis,
      reply: analysis.reply || "Please share your WhatsApp location.",
    };
  }

  if (intent === "restricted_cctv") {
    return {
      kind: "restricted_cctv",
      analysis,
      reply: analysis.reply || "CCTV review is handled by officials. Please report the issue or share location if you need help.",
    };
  }

  if (intent === "help" || intent === "status" || !analysis.should_create_case) {
    if (shouldWaitForHelpLocation(analysis)) {
      pendingSessions.set(from, {
        field: "help_location",
        replyLanguage: analysis.reply_language || "unknown",
        reply: analysis.reply || "OK",
        ack: analysis.follow_up_ack_reply || "OK",
      });
    }
    return {
      kind: intent || "help",
      analysis,
      reply: analysis.reply || "Please tell me what happened.",
    };
  }

  if (intent === "trust_check") {
    const trust = normalizeTrustCheck(text, analysis.trust_check);
    const saved = await safeDb("create trust check", () => createTrustCheck(trust, from.replace(/^whatsapp:/, "")));
    return {
      kind: "trust_check",
      saved,
      analysis,
      reply: analysis.reply || "Message received for checking.",
    };
  }

  if (intent === "missing_person" || intent === "found_person") {
    const report = normalizePersonReport({ text, from, intent, analysis });
    report.external_case_id = inbound.messageSid || null;
    const liveCase = await safeDb("create live case", () => createLiveCase(report));
    recentCases.set(from, {
      caseId: liveCase.id,
      replyLanguage: analysis.reply_language || "unknown",
      helpAck: analysis.follow_up_ack_reply || "OK",
    });
    const needsLocation = report.structured_data?.missing_fields?.includes("last_seen_location");
    if (needsLocation) {
      pendingSessions.set(from, {
        caseId: liveCase.id,
        field: "last_seen_location",
        reply: analysis.person_report?.follow_up_question || analysis.reply,
        replyLanguage: analysis.reply_language || "unknown",
        ack: analysis.follow_up_ack_reply || "OK",
      });
    }

    const searchText = [
      report.missing_person_name,
      report.age_band,
      report.gender,
      report.language,
      report.last_seen_location,
      report.physical_description,
    ]
      .filter(Boolean)
      .join(" ");
    if (report.last_seen_location && searchText) {
      await safeDb("search official cases", () => searchOfficialCases(searchText, 3), []);
    }

    return {
      kind: "live_case",
      liveCase,
      report,
      analysis,
      reply: needsLocation
        ? analysis.person_report?.follow_up_question || analysis.reply || "Where were they last seen?"
        : analysis.reply || "Report received.",
    };
  }

  return {
    kind: "help",
    analysis,
    reply: analysis.reply || "Please tell me what happened.",
  };
}

async function handleSharedLocation(from, latitude, longitude, messageSid) {
  const pending = pendingSessions.get(from);
  const recent = recentCases.get(from);
  const caseId = pending?.caseId || recent?.caseId;
  const replyLanguage = pending?.replyLanguage || recent?.replyLanguage || "unknown";
  if (pending?.field === "nearest_police_location") {
    let stations = await safeDb("nearest police", () => nearestPolice(latitude, longitude, 1), []);
    if (!stations.length) {
      const localStation = nearestPoliceFromLocalData(latitude, longitude);
      stations = localStation ? [localStation] : [];
    }
    pendingSessions.delete(from);
    const station = stations[0] || null;
    const outboundLocation = station
      ? await sendPoliceLocationPin({ to: from, station })
      : { ok: false, skipped: true, error: "No police station found" };
    const reply = outboundLocation.ok
      ? await composePoliceLocationSentReply({ userLanguage: replyLanguage })
      : await composeNearestPoliceReply({ userLanguage: replyLanguage, station });
    return {
      kind: "nearest_police",
      station,
      outboundLocation,
      location: station
        ? {
            latitude: station.latitude,
            longitude: station.longitude,
            label: station.station_name,
          }
        : null,
      reply,
    };
  }
  if (pending?.field === "help_location") {
    const liveCase = await safeDb("create shared-location help case", () => createLiveCase({ external_case_id: messageSid || null, ...helpLocationCase({
      from,
      location: "WhatsApp shared location",
      latitude,
      longitude,
      replyLanguage,
    }) }));
    recentCases.set(from, { caseId: liveCase.id, replyLanguage });
    pendingSessions.delete(from);
    return {
      kind: "live_case",
      liveCase,
      reply: pending.ack || "OK",
    };
  }
  if (!caseId) {
    return {
      kind: "location",
      reply: "OK",
    };
  }
  const updated = await safeDb("update coordinates", () => updateLiveCaseCoordinates(caseId, latitude, longitude));
  pendingSessions.delete(from);
  return {
    kind: "live_case_update",
    liveCase: updated,
    reply: recent?.helpAck || "OK",
  };
}

async function sendPoliceLocationPin({ to, station }) {
  const result = await sendWhatsAppLocation({
    to,
    latitude: station.latitude,
    longitude: station.longitude,
    label: station.station_name,
    body: `${station.station_name} (${Number(station.distance_km).toFixed(2)} km away)`,
  });
  if (!result.ok) {
    console.warn(`Twilio location send failed: ${result.error}`);
  }
  return result;
}

function nearestPoliceFromLocalData(latitude, longitude) {
  const stations = getLocalPoliceStations();
  if (!stations.length) return null;

  return stations
    .map((station) => ({
      ...station,
      distance_km: haversineKm(latitude, longitude, station.latitude, station.longitude),
    }))
    .sort((a, b) => a.distance_km - b.distance_km)[0];
}

function getLocalPoliceStations() {
  if (localPoliceStations) return localPoliceStations;
  const csvPath = path.join(__dirname, "../../../kumbhsaathi-shared/data/Police_Stations.csv");
  try {
    const csv = fs.readFileSync(csvPath, "utf8");
    localPoliceStations = csv
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [stationName, longitude, latitude] = line.split(",");
        return {
          station_name: stationName?.trim(),
          latitude: Number(latitude),
          longitude: Number(longitude),
        };
      })
      .filter((station) => station.station_name && Number.isFinite(station.latitude) && Number.isFinite(station.longitude));
  } catch (error) {
    console.warn(`Local police station fallback failed: ${error.message}`);
    localPoliceStations = [];
  }
  return localPoliceStations;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371;
  const dLat = degreesToRadians(lat2 - lat1);
  const dLon = degreesToRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(degreesToRadians(lat1)) * Math.cos(degreesToRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function shouldWaitForHelpLocation(analysis) {
  if (analysis.intent !== "help" || analysis.should_create_case) return false;
  return analysis.expects_location === true;
}

function applyCommandIntentOverride(text, analysis) {
  const normalized = String(text || "").toLowerCase();
  if (/\b(cctv|camera|footage|surveillance)\b/.test(normalized)) {
    return {
      ...analysis,
      intent: "restricted_cctv",
      should_create_case: false,
      expects_location: false,
      reply:
        analysis.reply && analysis.intent === "restricted_cctv"
          ? analysis.reply
          : "CCTV review is handled by officials. Please report the issue if you need help.",
    };
  }

  if (/\b(police|station|security)\b/.test(normalized)) {
    return {
      ...analysis,
      intent: "nearest_police",
      should_create_case: false,
      expects_location: true,
      reply:
        analysis.reply && analysis.intent === "nearest_police"
          ? analysis.reply
          : "Please share your WhatsApp location.",
    };
  }

  return analysis;
}

async function safeDb(label, fn, fallback = null) {
  try {
    return await fn();
  } catch (error) {
    console.warn(`Supabase ${label} failed: ${error.message}`);
    if (fallback !== null) return fallback;
    throw new Error("Your report could not be saved. Please retry or contact the nearest help desk.", { cause: error });
  }
}

function helpLocationCase({ from, location, latitude, longitude, replyLanguage }) {
  return {
    source: "whatsapp",
    source_detail: from || "WhatsApp CLI",
    case_type: "missing",
    status: "open",
    priority: "high",
    missing_person_name: null,
    gender: "Unknown",
    age_band: null,
    state: null,
    district: null,
    language: replyLanguage || null,
    last_seen_location: location,
    zone_name: null,
    reporter_mobile: from ? from.replace(/^whatsapp:/, "") : null,
    physical_description: "User requested immediate help through WhatsApp.",
    raw_report: "User requested immediate help through WhatsApp.",
    structured_data: {
      openai_extracted: true,
      help_request: true,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      reply_language: replyLanguage || null,
      missing_fields: [],
    },
    private_verification_clues: [],
    risk_flags: ["immediate_help_requested"],
  };
}

async function analyzeOrHelp(text) {
  try {
    const analysis = await analyzeMessage(text);
    if (analysis?.intent) return normalizeAnalysis(analysis);
  } catch (error) {
    console.warn(`OpenAI analysis failed: ${error.message}`);
  }

  return {
    intent: "help",
    confidence: 0,
    should_create_case: false,
    reply: "Please tell me what happened.",
    person_report: null,
    trust_check: null,
  };
}

function normalizeAnalysis(analysis) {
  const allowed = new Set([
    "help",
    "missing_person",
    "found_person",
    "trust_check",
    "status",
    "nearest_police",
    "restricted_cctv",
  ]);
  const intent = allowed.has(analysis.intent) ? analysis.intent : "help";
  const confidence = typeof analysis.confidence === "number" ? analysis.confidence : 0.75;

  if (confidence < 0.35 && intent !== "help" && analysis.should_create_case !== true) {
    return {
      ...analysis,
      intent: "help",
      should_create_case: false,
      reply: analysis.reply || "Please tell me what happened.",
    };
  }

  return {
    ...analysis,
    intent,
    should_create_case:
      intent === "missing_person" || intent === "found_person" || intent === "trust_check"
        ? analysis.should_create_case !== false
        : Boolean(analysis.should_create_case),
  };
}

function normalizePersonReport({ text, from, intent, analysis }) {
  const person = analysis.person_report || {};
  const riskFlags = Array.isArray(person.risk_flags) ? person.risk_flags.map(normalizeFlag).filter(Boolean) : [];
  let missingFields = Array.isArray(person.missing_fields)
    ? person.missing_fields.filter((field) => field === "last_seen_location")
    : [];

  if (!person.last_seen_location && !missingFields.includes("last_seen_location")) {
    missingFields.push("last_seen_location");
  }
  if (person.last_seen_location) {
    missingFields = [];
  }

  return {
    source: "whatsapp",
    source_detail: from || "WhatsApp CLI",
    case_type: intent === "found_person" ? "found" : "missing",
    status: "open",
    priority: person.priority || priorityFromFlags(riskFlags),
    missing_person_name: valueOrNull(person.missing_person_name),
    gender: valueOrNull(person.gender) || "Unknown",
    age_band: valueOrNull(person.age_band),
    state: valueOrNull(person.state),
    district: valueOrNull(person.district),
    language: valueOrNull(person.language),
    last_seen_location: valueOrNull(person.last_seen_location),
    zone_name: null,
    reporter_mobile: from ? from.replace(/^whatsapp:/, "") : null,
    physical_description: valueOrNull(person.physical_description) || text,
    raw_report: text,
    structured_data: {
      openai_extracted: true,
      missing_fields: missingFields,
      follow_up_question: valueOrNull(person.follow_up_question),
      user_reply: valueOrNull(analysis.reply),
      reply_language: valueOrNull(analysis.reply_language),
    },
    private_verification_clues: [],
    risk_flags: riskFlags,
  };
}

function normalizeTrustCheck(text, trust) {
  const data = trust || {};
  return {
    source: "whatsapp",
    raw_message: text,
    extracted_phone: valueOrNull(data.extracted_phone),
    extracted_upi_vpa: valueOrNull(data.extracted_upi_vpa),
    extracted_payee_name: valueOrNull(data.extracted_payee_name),
    extracted_amount: typeof data.extracted_amount === "number" ? data.extracted_amount : null,
    claimed_entity_name: valueOrNull(data.claimed_entity_name),
    risk_level: valueOrNull(data.risk_level) || "unverified",
    reasons: Array.isArray(data.reasons) ? data.reasons : [],
  };
}

function priorityFromFlags(flags) {
  if (flags.includes("possible_death_or_medical_emergency") || flags.includes("child")) return "critical";
  if (flags.includes("elderly")) return "high";
  return "medium";
}

function normalizeFlag(flag) {
  return String(flag || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function valueOrNull(value) {
  if (value === undefined || value === null) return null;
  const stringValue = String(value).trim();
  if (!stringValue || stringValue.toLowerCase() === "null") return null;
  return stringValue;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

module.exports = {
  handleMessage,
};
