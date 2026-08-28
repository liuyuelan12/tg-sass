/**
 * Decides how a scrape job's artefacts should reach the user.
 *
 * The old download route pulled the CSV *and every attachment* out of R2, zipped
 * them in memory, and streamed the result through this server — so the same bytes
 * were billed as egress on the way in to R2 and again on the way out to the user,
 * while the buffered attachments blew past the heap limit.
 *
 * Cloudflare R2 charges nothing for egress, so anything the browser can fetch
 * directly is free. That gives three cases, and only one of them ever touches
 * this process.
 */

export type DownloadPlan =
  /** Nothing but a CSV — presign it and redirect. Zero egress, zero memory. */
  | { kind: "presign"; key: string; filename: string }
  /** A zip was built on an earlier request and cached in R2. Redirect to it. */
  | { kind: "presign-zip"; key: string; filename: string }
  /** First download of a job with media: build the zip once, cache, then redirect. */
  | { kind: "build-zip"; csvKey: string; mediaPrefix: string; zipKey: string };

export interface DownloadableJob {
  id: string;
  csvR2Key: string | null;
  mediaR2Prefix: string | null;
  includeMedia: boolean;
  zipR2Key: string | null;
}

export class NothingToDownloadError extends Error {}

export function zipKeyFor(job: Pick<DownloadableJob, "csvR2Key" | "id">): string {
  // Sits beside the CSV so a job's artefacts stay under one prefix and the
  // existing per-job cleanup keeps working unchanged.
  const prefix = (job.csvR2Key ?? "").replace(/\/[^/]*$/, "");
  return `${prefix}/scrape-${job.id}.zip`;
}

export function planDownload(job: DownloadableJob): DownloadPlan {
  if (!job.csvR2Key) {
    throw new NothingToDownloadError("Job has no CSV");
  }

  if (job.zipR2Key) {
    return { kind: "presign-zip", key: job.zipR2Key, filename: `scrape-${job.id}.zip` };
  }

  // `includeMedia` gates the *scrape*, but an older job may predate the flag and
  // still have a media prefix — so trust the prefix, not the flag, when deciding
  // whether there is anything to bundle.
  if (job.mediaR2Prefix) {
    return {
      kind: "build-zip",
      csvKey: job.csvR2Key,
      mediaPrefix: job.mediaR2Prefix,
      zipKey: zipKeyFor(job),
    };
  }

  return { kind: "presign", key: job.csvR2Key, filename: `scrape-${job.id}.csv` };
}
