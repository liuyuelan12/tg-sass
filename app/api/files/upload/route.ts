import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";
import { uploadToR2 } from "@/lib/r2";

export async function POST(req: NextRequest) {
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

  // Upload media zip
  let mediaPrefix: string | undefined;
  if (mediaFile) {
    const mediaBuffer = Buffer.from(await mediaFile.arrayBuffer());
    const mediaKey = `${r2Prefix}/media.zip`;
    await uploadToR2(mediaKey, mediaBuffer, "application/zip");
    mediaPrefix = `${r2Prefix}/media`;
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

  return NextResponse.json({ id: job.id, csvKey, mediaPrefix });
}
