import dynamic from "next/dynamic";
import type { MapPoint } from "./LeafletMiniMap";

const LeafletMiniMap = dynamic(() => import("./LeafletMiniMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{ height: "320px" }}
      className="w-full border-2 border-black bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500"
    >
      Loading map…
    </div>
  ),
});

export type { MapPoint };
export default LeafletMiniMap;
