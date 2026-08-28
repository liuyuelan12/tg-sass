import { describe, expect, it } from "vitest";
import {
  NothingToDownloadError,
  planDownload,
  zipKeyFor,
  type DownloadableJob,
} from "./downloads";

const job = (over: Partial<DownloadableJob> = {}): DownloadableJob => ({
  id: "job1",
  csvR2Key: "users/u1/scrapes/job1/messages.csv",
  mediaR2Prefix: null,
  includeMedia: false,
  zipR2Key: null,
  ...over,
});

describe("planDownload", () => {
  it("presigns the CSV directly when there is no media", () => {
    expect(planDownload(job())).toEqual({
      kind: "presign",
      key: "users/u1/scrapes/job1/messages.csv",
      filename: "scrape-job1.csv",
    });
  });

  it("reuses a cached zip instead of rebuilding it", () => {
    const plan = planDownload(job({ zipR2Key: "users/u1/scrapes/job1/scrape-job1.zip" }));
    expect(plan).toEqual({
      kind: "presign-zip",
      key: "users/u1/scrapes/job1/scrape-job1.zip",
      filename: "scrape-job1.zip",
    });
  });

  it("builds a zip on the first download of a job that has media", () => {
    expect(planDownload(job({ mediaR2Prefix: "users/u1/scrapes/job1/media" }))).toEqual({
      kind: "build-zip",
      csvKey: "users/u1/scrapes/job1/messages.csv",
      mediaPrefix: "users/u1/scrapes/job1/media",
      zipKey: "users/u1/scrapes/job1/scrape-job1.zip",
    });
  });

  it("prefers the cached zip even when a media prefix is present", () => {
    const plan = planDownload(
      job({ mediaR2Prefix: "users/u1/scrapes/job1/media", zipR2Key: "cached.zip" })
    );
    expect(plan.kind).toBe("presign-zip");
  });

  it("trusts the media prefix over includeMedia for jobs that predate the flag", () => {
    // Old rows were scraped before the flag existed: they carry media but would
    // read as includeMedia=false, and must still get a zip.
    const plan = planDownload(
      job({ mediaR2Prefix: "users/u1/scrapes/job1/media", includeMedia: false })
    );
    expect(plan.kind).toBe("build-zip");
  });

  it("does not build a zip merely because includeMedia was requested", () => {
    // The scrape may have been asked for media and found none.
    expect(planDownload(job({ includeMedia: true })).kind).toBe("presign");
  });

  it("rejects a job with no CSV", () => {
    expect(() => planDownload(job({ csvR2Key: null }))).toThrow(NothingToDownloadError);
  });
});

describe("zipKeyFor", () => {
  it("places the archive beside the CSV so per-job cleanup still catches it", () => {
    expect(zipKeyFor({ id: "job1", csvR2Key: "users/u1/scrapes/job1/messages.csv" })).toBe(
      "users/u1/scrapes/job1/scrape-job1.zip"
    );
  });
});
