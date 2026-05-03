import { NextRequest, NextResponse } from "next/server";
import type { LlmProvider } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";
import { downloadFromR2 } from "@/lib/r2";
import { decrypt } from "@/lib/crypto";
import { analyzePersonas } from "@/lib/ai/personas";

export async function POST(req: NextRequest) {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  let body: {
    scrapeJobId?: string;
    provider?: LlmProvider;
    apiKeyId?: string;
    model?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { scrapeJobId, provider = "GROQ_DEFAULT", apiKeyId } = body;
  if (!scrapeJobId) {
    return NextResponse.json({ error: "scrapeJobId required" }, { status: 400 });
  }

  const scrapeJob = await prisma.scrapeJob.findFirst({
    where: { id: scrapeJobId, userId: guard.user.id },
  });
  if (!scrapeJob?.csvR2Key) {
    return NextResponse.json(
      { error: "ScrapeJob not found or has no CSV" },
      { status: 404 }
    );
  }

  let apiKey: string;
  let baseUrl: string | undefined;
  let model = body.model;

  if (provider === "GROQ_DEFAULT") {
    apiKey = process.env.GROQ_API_KEY ?? "";
    if (!apiKey) {
      return NextResponse.json(
        { error: "Server GROQ_API_KEY not set" },
        { status: 500 }
      );
    }
    if (!model) model = "llama-3.3-70b-versatile";
  } else {
    const key = apiKeyId
      ? await prisma.userApiKey.findFirst({
          where: { id: apiKeyId, userId: guard.user.id, provider },
        })
      : await prisma.userApiKey.findFirst({
          where: { userId: guard.user.id, provider },
        });
    if (!key) {
      return NextResponse.json(
        { error: `No saved API key for provider ${provider}` },
        { status: 400 }
      );
    }
    try {
      apiKey = decrypt(key.encryptedKey);
    } catch {
      return NextResponse.json(
        { error: "Failed to decrypt saved API key" },
        { status: 500 }
      );
    }
    baseUrl = key.baseUrl ?? undefined;
    if (!model) model = key.model ?? "";
  }

  if (!model) {
    return NextResponse.json({ error: "model required" }, { status: 400 });
  }

  try {
    const csvBuffer = await downloadFromR2(scrapeJob.csvR2Key);
    const analysis = await analyzePersonas(csvBuffer.toString("utf-8"), {
      provider,
      apiKey,
      baseUrl,
      model,
    });
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("[preview-personas] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Persona analysis failed" },
      { status: 500 }
    );
  }
}
