// Converts KML files in private-assets/data/ to GeoJSON in private-assets/maps/
import { readFileSync, writeFileSync } from "fs";
import { DOMParser } from "@xmldom/xmldom";
import { kml } from "@tmcw/togeojson";

const KML_FILES = [
  { src: "private-assets/data/CCTV Dataset.kml", dest: "private-assets/maps/cctv.geojson" },
  { src: "private-assets/data/Police Stations.kml", dest: "private-assets/maps/police.geojson" },
  { src: "private-assets/data/nashik_kumbh_chokepoints_parking_map.kml", dest: "private-assets/maps/chokepoints.geojson" },
];

for (const { src, dest } of KML_FILES) {
  const xmlStr = readFileSync(src, "utf8");
  const doc = new DOMParser().parseFromString(xmlStr, "text/xml");
  const geojson = kml(doc);
  writeFileSync(dest, JSON.stringify(geojson, null, 2));
  console.log(`✓ ${src} → ${dest}  (${geojson.features.length} features)`);
}
