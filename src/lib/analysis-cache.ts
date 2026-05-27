import { unstable_cache } from "next/cache";
import { getRealTimeAnalysisStats } from "@/lib/analysis";
import { Profile } from "@/lib/schemas";

export const getCachedRealTimeAnalysisStats = (profile: Profile, todayStr: string) => {
  // We incorporate profile values or todayStr into the cache key so it naturally expires and rolls over daily
  return unstable_cache(
    async () => {
      return getRealTimeAnalysisStats(profile, todayStr);
    },
    ["analysis-stats", todayStr],
    {
      tags: ["analysis-7day"],
    }
  )();
};
