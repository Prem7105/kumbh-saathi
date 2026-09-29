function extractPhone(text) {
  const match = text.match(/(?:\+91[\s-]?)?[6-9]\d{9}/);
  return match ? match[0].replace(/\s|-/g, "") : null;
}

function extractUpi(text) {
  const match = text.match(/[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

function extractAmount(text) {
  const match = text.match(/(?:rs\.?|inr|₹)\s*([0-9,]+)|([0-9,]+)\s*(?:rs\.?|inr|₹)/i);
  if (!match) return null;
  const raw = (match[1] || match[2] || "").replace(/,/g, "");
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function extractClaimedEntity(text) {
  const patterns = [
    /(hotel|lodge|camp|ashram|dharamshala)\s+([A-Za-z0-9 &'-]{2,40})/i,
    /([A-Za-z0-9 &'-]{2,40})\s+(hotel|lodge|camp|ashram|dharamshala)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  return null;
}

function assessTrustMessage(text) {
  const reasons = [];
  const phone = extractPhone(text);
  const upi = extractUpi(text);
  const amount = extractAmount(text);
  const entity = extractClaimedEntity(text);

  if (/(urgent|immediate|pay now|last room|limited|within 10 minutes|अभी|तुरंत|जल्दी)/i.test(text)) {
    reasons.push("urgent_payment_pressure");
  }
  if (/(otp|one time password|aadhaar|aadhar|pan card|cvv|pin|password)/i.test(text)) {
    reasons.push("asks_for_sensitive_pii_or_secret");
  }
  if (/(advance|deposit|booking amount|token money|prepaid|पहले भुगतान|advance payment)/i.test(text)) {
    reasons.push("advance_payment_requested");
  }
  if (upi) reasons.push("upi_id_present_requires_verification");
  if (!entity) reasons.push("no_clear_verified_accommodation_name");
  if (!phone && !upi) reasons.push("no_verifiable_contact_or_payment_identifier");
  if (amount && amount >= 5000) reasons.push("high_amount_request");

  let risk = "unverified";
  if (
    reasons.includes("asks_for_sensitive_pii_or_secret") ||
    (reasons.includes("urgent_payment_pressure") && reasons.includes("advance_payment_requested")) ||
    (reasons.includes("upi_id_present_requires_verification") && reasons.includes("no_clear_verified_accommodation_name"))
  ) {
    risk = "high_concern";
  }

  return {
    source: "whatsapp",
    raw_message: text,
    extracted_phone: phone,
    extracted_upi_vpa: upi,
    extracted_payee_name: null,
    extracted_amount: amount,
    claimed_entity_name: entity,
    risk_level: risk,
    reasons,
  };
}

function trustReply(report) {
  if (report.risk_level === "high_concern") {
    return [
      "Trust Check: High concern.",
      "Do not pay or share OTP/Aadhaar/PIN until an official help desk verifies this.",
      `Reasons: ${report.reasons.join(", ") || "suspicious pattern"}.`,
      "This is not bank verification. We have created a report for official review.",
    ].join("\n");
  }

  return [
    "Trust Check: Unverified.",
    "We could not confirm this as official from the message alone.",
    `Found: ${[report.claimed_entity_name, report.extracted_phone, report.extracted_upi_vpa].filter(Boolean).join(", ") || "limited details"}.`,
    "Please verify at an official help desk before paying.",
  ].join("\n");
}

module.exports = {
  assessTrustMessage,
  trustReply,
};
