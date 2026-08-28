import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";
import {
  getPresignedUrl,
  listR2Objects,
  streamFromR2,
  uploadToR2,
} from "@/lib/r2";
import { NothingToDownloadError, planDownload } from "@/lib/downloads";
import archiver from "archiver";

/** Presigned links are single-use in practice; an hour is plenty for a browser. */
const LINK_TTL_SECONDS = 3600;

/**
 * Streams the CSV plus every attachment into a zip and stores it in R2.
 *
 * Everything is piped rather than buffered: `archiver` consumes each object as a
 * stream, so peak memory is a few chunks instead of the whole media set. The zip
 * itself still has to be collected before `PutObjectCommand` can send it, which
 * is the one place this route holds bytes — and it happens once per job, ever.
 */
async function buildAndCacheZip(
  csvKey: string,
  mediaPrefix: string,
  zipKey: string
): Promise<void> {
  const archive = archiver("zip", { zlib: { level: 5 } });
  const chunks: Buffer[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(chunk));

  const finished = new Promise<void>((resolve, reject) => {
    archive.on("end", () => resolve());
    archive.on("error", reject);
  });

  archive.append(await streamFromR2(csvKey), { name: "messages.csv" });

  for (const key of await listR2Objects(mediaPrefix)) {
    try {
      archive.append(await streamFromR2(key), {
        name: `media/${key.split("/").pop() || key}`,
      });
    } catch {
      // One unreadable attachment must not cost the user the whole archive.
    }
  }

  await archive.finalize();
  await finished;
  await uploadToR2(zipKey, Buffer.concat(chunks), "application/zip");
}

export async function GET(req: NextRequest) {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const job = await prisma.scrapeJob.findFirst({
    where: { id: jobId, userId: guard.user.id },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  try {
    const plan = planDownload(job);

    if (plan.kind === "build-zip") {
      await buildAndCacheZip(plan.csvKey, plan.mediaPrefix, plan.zipKey);
      await prisma.scrapeJob.update({
        where: { id: job.id },
        data: { zipR2Key: plan.zipKey },
      });
      const filename = `scrape-${job.id}.zip`;
      const url = await getPresignedUrl(plan.zipKey, LINK_TTL_SECONDS, filename);
      return NextResponse.json({ url, filename });
    }

    // The browser fetches straight from R2, whose egress is free — these bytes
    // never pass through this server at all.
    const url = await getPresignedUrl(plan.key, LINK_TTL_SECONDS, plan.filename);
    return NextResponse.json({ url, filename: plan.filename });
  } catch (err) {
    if (err instanceof NothingToDownloadError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Download failed" },
      { status: 500 }
    );
  }
}
