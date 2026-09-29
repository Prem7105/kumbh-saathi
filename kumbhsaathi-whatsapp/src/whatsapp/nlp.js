const LOCATIONS = [
  "Ramkund Ghat",
  "Trimbakeshwar Approach",
  "Panchavati Circle",
  "Madsangvi Transit",
  "Sadhugram Gate 2",
  "Nashik Road Station",
  "Trimbak Road",
  "Gauri Patangan",
  "Dasak Ghat",
  "Adgaon Parking",
  "Nandur Ghat",
  "Laxmi Narayan Ghat",
  "Takli Sangam",
  "Bus Stand Nashik",
  "Madsangvi Transit",
];

const LOCATION_ZONES = [
  [/ramkund|panchavati/i, "Zone Area 1"],
  [/trimbak|trimbakeshwar/i, "Zone Area 2"],
  [/adgaon/i, "Zone Area 4"],
  [/nashik road|bus stand/i, "Zone Area 3"],
  [/sadhugram/i, "Zone Area 5"],
  [/madsangvi/i, "Zone Area 6"],
  [/takli|sangam/i, "Zone Area 7"],
];

const LANGUAGE_HINTS = [
  "Hindi",
  "Marathi",
  "Bhojpuri",
  "Maithili",
  "Gujarati",
  "Telugu",
  "Kannada",
  "Tamil",
  "Bengali",
  "Awadhi",
  "English",
];

function classifyIntent(text) {
  const normalized = text.toLowerCase();
  if (/(son|daughter|mother|father|brother|sister|child|beta|beti|maa|papa|dadi|nani).*(dead|death|died|might be dead|mar gaya|marr gaya|मर|मृत|behosh|unconscious|injured|blood|accident|hospital)/i.test(text)) {
    return "missing_person";
  }
  if (/(hotel|room|booking|lodge|stay|accommodation|upi|advance|payment|qr|otp|aadhaar|aadhar|pay now|बुकिंग|होटल|रूम)/i.test(text)) {
    return "trust_check";
  }
  if (/(status|case|update|kmp-|कंप्लेंट|शिकायत)/i.test(text)) {
    return "status";
  }
  if (/(found|mila|mil gaya|sapadla|मिला|मिल गया|सापडला|found person)/i.test(normalized)) {
    return "found_person";
  }
  if (/(lost|missing|kho|gum|gum ho|खो|गुम|हरव|missing person|lost someone)/i.test(normalized)) {
    return "missing_person";
  }
  return "unknown";
}

function detectAgeBand(text) {
  const match = text.match(/(\d{1,3})\s*(?:year|yr|saal|साल|varsh|वर्ष|age)?/i);
  if (!match) return null;
  const age = Number(match[1]);
  if (!Number.isFinite(age)) return null;
  if (age <= 12) return "0-12";
  if (age <= 17) return "13-17";
  if (age <= 40) return "18-40";
  if (age <= 60) return "41-60";
  if (age <= 70) return "61-70";
  if (age <= 80) return "71-80";
  return "80+";
}

function detectGender(text) {
  if (/(woman|female|lady|mother|maa|dadi|nani|girl|beti|mahila|aurat|स्त्री|महिला|माँ|दादी|लड़की)/i.test(text)) {
    return "Female";
  }
  if (/(man|male|father|papa|dada|nana|boy|beta|purush|aadmi|पुरुष|आदमी|पिता|दादा|लड़का)/i.test(text)) {
    return "Male";
  }
  return "Unknown";
}

function detectLanguage(text) {
  for (const lang of LANGUAGE_HINTS) {
    if (new RegExp(lang, "i").test(text)) return lang;
  }
  if (/[अ-ह]/.test(text)) return "Hindi";
  if (/\b(mera|meri|beta|beti|maa|papa|dadi|nani|kho|gaya|gayi|gum|madat|karo|naam|umar|kahan|dikha|dekha|paas)\b/i.test(text)) {
    return "Hindi";
  }
  return "English";
}

function detectLocation(text) {
  const found = LOCATIONS.find((loc) => new RegExp(loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text));
  if (found) return found;
  const placeMatch = text.match(/(?:near|at|in|inside|around|by|पास|javal|जवळ|mein|me|par)\s+(?:the\s+)?([A-Za-z0-9 /-]{3,40})/i);
  if (placeMatch) return cleanLocation(placeMatch[1]);
  const generic = text.match(/\b(river|ghat|parking|bus stand|station|bridge|temple|camp|road|gate|sangam|kund)\b/i);
  return generic ? cleanLocation(generic[1]) : null;
}

function zoneForLocation(location) {
  if (!location) return null;
  const matched = LOCATION_ZONES.find(([pattern]) => pattern.test(location));
  return matched ? matched[1] : null;
}

function extractName(text) {
  const patterns = [
    /(?:my|mera|meri)\s+(?:son|daughter|mother|father|brother|sister|child|beta|beti|maa|papa|dadi|nani)\s+([A-Za-z][A-Za-z ]{1,30})/i,
    /name\s+(?:is\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /naam\s+([A-Za-z ]{2,30})/i,
    /नाम\s+([^\s,।.]{2,30})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanName(match[1]);
  }
  return null;
}

function cleanName(value) {
  return value
    .replace(/\b(kho gaya|kho gayi|gum ho gaya|gum ho gayi|lost|missing|madat|help|please|near|at)\b.*$/i, "")
    .replace(/[!,.।]+$/g, "")
    .trim() || null;
}

function cleanLocation(value) {
  const cleaned = value
    .replace(/\b(madat karo|karo|please help|help|madat|is lost|lost|kho gaya|kho gayi|gum ho gaya|gum ho gayi)\b.*$/gi, "")
    .replace(/[!,.।]+$/g, "")
    .trim();
  if (!cleaned || /^(karo|help|madat|please)$/i.test(cleaned)) return null;
  return cleaned;
}

function extractPhone(text) {
  const match = text.match(/(?:\+91[\s-]?)?[6-9]\d{9}/);
  return match ? match[0].replace(/\s|-/g, "") : null;
}

function riskFlagsFor(report) {
  const flags = [];
  if (["0-12", "13-17"].includes(report.age_band)) flags.push("child");
  if (["61-70", "71-80", "80+"].includes(report.age_band)) flags.push("elderly");
  if (/(dead|death|died|might be dead|mar gaya|marr gaya|मर|मृत|behosh|unconscious|injured|blood|accident|hospital)/i.test(report.raw_report || "")) {
    flags.push("possible_death_or_medical_emergency");
  }
  if (!report.missing_person_name) flags.push("no_name");
  if (!report.reporter_mobile) flags.push("no_mobile");
  if (!report.physical_description || report.physical_description.length < 24) flags.push("vague_description");
  if (flags.includes("child") || flags.includes("elderly")) flags.push("needs_private_verification");
  return flags;
}

function priorityFor(flags) {
  if (flags.includes("possible_death_or_medical_emergency") || flags.includes("medical_emergency") || flags.includes("possible_death")) return "critical";
  if (flags.includes("child")) return "critical";
  if (flags.includes("elderly") && (flags.includes("no_name") || flags.includes("no_mobile"))) return "critical";
  if (flags.includes("elderly") || flags.includes("no_mobile")) return "high";
  return "medium";
}

function extractPersonReport({ text, from, intent, latitude, longitude }) {
  const lastSeen = detectLocation(text);
  const report = {
    source: "whatsapp",
    source_detail: from || "WhatsApp simulator",
    case_type: intent === "found_person" ? "found" : "missing",
    status: "open",
    missing_person_name: extractName(text),
    gender: detectGender(text),
    age_band: detectAgeBand(text),
    state: null,
    district: null,
    language: detectLanguage(text),
    last_seen_location: lastSeen,
    zone_name: zoneForLocation(lastSeen),
    reporter_mobile: extractPhone(text) || normalizeWhatsAppPhone(from),
    physical_description: text.slice(0, 500),
    raw_report: text,
    structured_data: {
      intake_language: detectLanguage(text),
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      missing_fields: [],
    },
    private_verification_clues: [],
  };

  if (!report.missing_person_name) report.structured_data.missing_fields.push("name");
  if (!report.age_band) report.structured_data.missing_fields.push("age");
  if (!report.last_seen_location) report.structured_data.missing_fields.push("last_seen_location");
  if (!report.reporter_mobile) report.structured_data.missing_fields.push("reporter_mobile");

  report.private_verification_clues = [
    "Ask the claimant to describe clothing without showing the public report.",
    "Ask which language the missing person speaks at home.",
    "Ask for a recent family detail not used in loudspeaker announcements.",
  ];

  report.risk_flags = riskFlagsFor(report);
  report.priority = priorityFor(report.risk_flags);
  return report;
}

function normalizeWhatsAppPhone(from) {
  if (!from) return null;
  return from.replace(/^whatsapp:/, "").trim() || null;
}

function nextQuestion(report) {
  const missing = report.structured_data?.missing_fields || [];
  const language = report.structured_data?.user_language || report.language || "English";
  if (missing.includes("last_seen_location")) return localizedQuestion("last_seen_location", language);
  return null;
}

function localizedQuestion(field, language) {
  const lang = String(language || "English").toLowerCase();
  const questions = {
    English: {
      name: "What is the missing person's name?",
      age: "What is their approximate age?",
      last_seen_location: "Where were they last seen?",
      reporter_mobile: "What mobile number should we use for updates?",
    },
    Hindi: {
      name: "Unka naam kya hai?",
      age: "Unki umar lagbhag kitni hai?",
      last_seen_location: "Aakhri baar kahan dekha tha?",
      reporter_mobile: "Updates ke liye mobile number kya hai?",
    },
  };
  const bucket = lang.includes("hindi") || lang.includes("bhojpuri") || lang.includes("maithili") || lang.includes("awadhi")
    ? questions.Hindi
    : questions.English;
  return bucket[field];
}

module.exports = {
  classifyIntent,
  extractPersonReport,
  nextQuestion,
};
