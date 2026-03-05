import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";
import { downloadFromR2, listR2Objects } from "@/lib/r2";
import archiver from "archiver";
import { PassThrough } from "stream";

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

  if (!job || !job.csvR2Key) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  try {
    const archive = archiver("zip", { zlib: { level: 5 } });
    const passThrough = new PassThrough();

    archive.pipe(passThrough);

    // Add CSV
    const csvBuffer = await downloadFromR2(job.csvR2Key);
    archive.append(csvBuffer, { name: "messages.csv" });

    // Add media files
    if (job.mediaR2Prefix) {
      const mediaKeys = await listR2Objects(job.mediaR2Prefix);
      for (const key of mediaKeys) {
        try {
          const buffer = await downloadFromR2(key);
          const fileName = key.split("/").pop() || key;
          archive.append(buffer, { name: `media/${fileName}` });
        } catch {
          // skip failed media downloads
        }
      }
    }

    archive.finalize();

    // Convert Node stream to Web ReadableStream
    const readable = new ReadableStream({
      start(controller) {
        passThrough.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        passThrough.on("end", () => {
          controller.close();
        });
        passThrough.on("error", (err) => {
          controller.error(err);
        });
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="scrape-${jobId}.zip"`,
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Download failed" },
      { status: 500 }
    );
  }
}
