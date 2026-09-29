// Fetches official spatial tables from Supabase and writes exact-count GeoJSON files
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Set SUPABASE_URL and server-only SUPABASE_SERVICE_ROLE_KEY before running this script.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function toFeature(row, latField, lngField, props) {
  const lat = row[latField];
  const lng = row[lngField];
  if (lat == null || lng == null) return null;
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
    properties: { ...props(row) },
  };
}

function toGeoJSON(features) {
  return { type: "FeatureCollection", features: features.filter(Boolean) };
}

// Fetch with pagination to get all rows
async function fetchAll(table, select, limit = 1000) {
  let rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + limit - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows = rows.concat(data);
    if (data.length < limit) break;
    from += limit;
  }
  return rows;
}

// CCTV cameras (official 1,280)
console.log("Fetching cctv_locations...");
const cctvRows = await fetchAll("cctv_locations", "camera_id,latitude,longitude");
const cctvGeoJSON = toGeoJSON(
  cctvRows.map((r) =>
    toFeature(r, "latitude", "longitude", (row) => ({
      camera_id: row.camera_id,
    }))
  )
);
writeFileSync("private-assets/maps/cctv-official.geojson", JSON.stringify(cctvGeoJSON, null, 2));
console.log(`✓ cctv-official.geojson  (${cctvGeoJSON.features.length} cameras)`);

// Police stations (official 14)
console.log("Fetching police_stations...");
const policeRows = await fetchAll("police_stations", "station_name,latitude,longitude");
const policeGeoJSON = toGeoJSON(
  policeRows.map((r) =>
    toFeature(r, "latitude", "longitude", (row) => ({
      name: row.station_name,
    }))
  )
);
writeFileSync("private-assets/maps/police-official.geojson", JSON.stringify(policeGeoJSON, null, 2));
console.log(`✓ police-official.geojson  (${policeGeoJSON.features.length} stations)`);

// Chokepoints (official 85, enriched)
console.log("Fetching chokepoints_parking...");
const chopRows = await fetchAll(
  "chokepoints_parking",
  "location_name,category,latitude,longitude,risk_level,project_status,source_url,note,kml_description"
);
const chopGeoJSON = toGeoJSON(
  chopRows.map((r) =>
    toFeature(r, "latitude", "longitude", (row) => ({
      location_name: row.location_name,
      category: row.category,
      risk_level: row.risk_level,
      project_status: row.project_status,
      source_url: row.source_url,
      note: row.note,
      kml_description: row.kml_description,
    }))
  )
);
writeFileSync("private-assets/maps/chokepoints-official.geojson", JSON.stringify(chopGeoJSON, null, 2));
console.log(`✓ chokepoints-official.geojson  (${chopGeoJSON.features.length} points)`);
