import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";
import { uploadToR2 } from "@/lib/r2";
import AdmZip from "adm-zip";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const guard = await requireActiveUser();
    if (!guard.ok) return guard.response;

    const formData = await req.formData();
    const csvFile = formData.get("csv") as File | null;
    const mediaFile = formData.get("media") as File | null;
    const groupEntity = formData.get("groupEntity") as string;

    if (!csvFile || !groupEntity) {
      return NextResponse.json(
        { error: "CSV file and groupEntity are required" },
        { status: 400 }
      );
    }

    const jobId = crypto.randomUUID().replace(/-/g, "").slice(0, 25);
    const r2Prefix = `users/${guard.user.id}/uploads/${jobId}`;

    // Upload CSV
    const csvBuffer = Buffer.from(await csvFile.arrayBuffer());
    const csvKey = `${r2Prefix}/messages.csv`;
    await uploadToR2(csvKey, csvBuffer, "text/csv");

    // Extract and upload media files from ZIP
    let mediaPrefix: string | undefined;
    let mediaCount = 0;

    if (mediaFile && mediaFile.size > 0) {
      const mediaBuffer = Buffer.from(await mediaFile.arrayBuffer());
      mediaPrefix = `${r2Prefix}/media`;

      const zip = new AdmZip(mediaBuffer);
      const entries = zip.getEntries();

      for (const entry of entries) {
        // Skip directories and hidden files
        if (entry.isDirectory) continue;
        const entryName = entry.entryName;
        if (entryName.startsWith("__MACOSX") || entryName.startsWith(".")) continue;

        // Get just the filename (strip any folder structure from ZIP)
        const fileName = path.basename(entryName);
        if (!fileName) continue;

        const fileBuffer = entry.getData();
        const r2Key = `${mediaPrefix}/${fileName}`;
        await uploadToR2(r2Key, fileBuffer);
        mediaCount++;
      }

      console.log(`[upload] Extracted ${mediaCount} media files from ZIP`);
    }

    // Create a scrape job record for reference
    const job = await prisma.scrapeJob.create({
      data: {
        userId: guard.user.id,
        groupEntity,
        status: "COMPLETED",
        csvR2Key: csvKey,
        mediaR2Prefix: mediaPrefix,
      },
    });

    return NextResponse.json({
      id: job.id,
      csvKey,
      mediaPrefix,
      mediaCount,
    });
  } catch (err) {
    console.error("[upload] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
