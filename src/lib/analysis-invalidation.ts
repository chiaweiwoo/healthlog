import { revalidateTag } from "next/cache";

export function invalidateAnalysisCache() {
  console.log("[Cache] Invalidating 7-day analysis cache due to data mutation.");
  try {
    const fn = revalidateTag as unknown as (tag: string) => void;
    fn("analysis-7day");
  } catch (err) {
    console.error("[Cache] Failed to invalidate tag 'analysis-7day':", err);
  }
}
