import { NextRequest, NextResponse } from "next/server";
import type { LlmProvider } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";
import { parseGroupInput } from "@/lib/telegram/scraper";

const VALID_PROVIDERS: LlmProvider[] = [
  "GROQ_DEFAULT",
  "GROQ_BYOK",
  "OPENAI_BYOK",
  "ANTHROPIC_BYOK",
  "OPENAI_COMPAT_BYOK",
];

export async function GET() {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const jobs = await prisma.aIChatJob.findMany({
    where: { userId: guard.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json(jobs);
}

export async function DELETE() {
  try {
    const guard = await requireActiveUser();
    if (!guard.ok) return guard.response;

    const deleted = await prisma.aIChatJob.deleteMany({
      where: {
        userId: guard.user.id,
        status: { not: "RUNNING" },
      },
    });

    return NextResponse.json({ deleted: deleted.count });
  } catch (err) {
    console.error("[ai-chat DELETE all] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const body = await req.json();
  const {
    sessionIds,
    scrapeJobId,
    targetGroup,
    provider = "GROQ_DEFAULT",
    apiKeyId,
    model,
    intervalMin = 8,
    intervalMax = 20,
    sendPct = 60,
    replyPct = 30,
    reactPct = 10,
    contextSize = 10,
    maxMessages = 200,
    shouldLoop = false,
    dryRun = false,
    priorityReplyStrangers = false,
    bannedKeywords = [],
    newsEnabled = false,
    newsIntervalMinutes = 120,
    newsRssUrl,
    manualPersonas,
  } = body;

  const normalizedBanned: string[] = Array.isArray(bannedKeywords)
    ? Array.from(
        new Set(
          bannedKeywords
            .map((kw: unknown) => (typeof kw === "string" ? kw.trim() : ""))
            .filter((kw: string) => kw.length > 0 && kw.length <= 64)
        )
      ).slice(0, 50)
    : [];

  if (!Array.isArray(sessionIds) || sessionIds.length === 0 || !targetGroup) {
    return NextResponse.json(
      { error: "Missing required fields (sessionIds, targetGroup)" },
      { status: 400 }
    );
  }

  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  if (sendPct + replyPct + reactPct > 100) {
    return NextResponse.json(
      { error: "sendPct + replyPct + reactPct must be ≤ 100" },
      { status: 400 }
    );
  }

  if (intervalMin < 1 || intervalMax < intervalMin) {
    return NextResponse.json(
      { error: "Invalid interval range" },
      { status: 400 }
    );
  }

  if (maxMessages < 1 || maxMessages > 5000) {
    return NextResponse.json(
      { error: "maxMessages must be between 1 and 5000" },
      { status: 400 }
    );
  }

  const tgSessions = await prisma.tgSession.findMany({
    where: { id: { in: sessionIds }, userId: guard.user.id },
  });
  if (tgSessions.length === 0) {
    return NextResponse.json({ error: "No valid sessions" }, { status: 400 });
  }

  let scrapeJob: { id: string; csvR2Key: string | null } | null = null;
  if (scrapeJobId) {
    scrapeJob = await prisma.scrapeJob.findFirst({
      where: { id: scrapeJobId, userId: guard.user.id },
      select: { id: true, csvR2Key: true },
    });
    if (!scrapeJob?.csvR2Key) {
      return NextResponse.json(
        { error: "ScrapeJob not found or has no CSV" },
        { status: 404 }
      );
    }
  } else {
    // No scrape source — require manual personas covering every selected session.
    const manualCount =
      manualPersonas && typeof manualPersonas === "object"
        ? Object.keys(manualPersonas).length
        : 0;
    if (manualCount < tgSessions.length) {
      return NextResponse.json(
        {
          error: `Without scrapeJobId, manualPersonas must cover all ${tgSessions.length} sessions (got ${manualCount})`,
        },
        { status: 400 }
      );
    }
  }

  let resolvedApiKeyId: string | null = null;
  let resolvedModel = model || null;
  if (provider !== "GROQ_DEFAULT") {
    const key = apiKeyId
      ? await prisma.userApiKey.findFirst({
          where: { id: apiKeyId, userId: guard.user.id, provider },
        })
      : await prisma.userApiKey.findFirst({
          where: { userId: guard.user.id, provider },
        });
    if (!key) {
      return NextResponse.json(
        {
          error: `No saved API key for provider ${provider}. Add one first.`,
        },
        { status: 400 }
      );
    }
    resolvedApiKeyId = key.id;
    if (!resolvedModel) resolvedModel = key.model || null;
    if (provider === "OPENAI_COMPAT_BYOK" && !key.baseUrl) {
      return NextResponse.json(
        { error: "OPENAI_COMPAT_BYOK key missing baseUrl" },
        { status: 400 }
      );
    }
  } else if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "Server GROQ_API_KEY not configured" },
      { status: 500 }
    );
  }

  if (!resolvedModel) {
    resolvedModel = "llama-3.3-70b-versatile";
  }

  const { entity, topicId } = parseGroupInput(targetGroup);

  const existing = await prisma.aIChatJob.findFirst({
    where: {
      userId: guard.user.id,
      groupEntity: entity,
      status: "RUNNING",
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: `An AI chat job is already running on group ${entity}` },
      { status: 409 }
    );
  }

  const job = await prisma.aIChatJob.create({
    data: {
      userId: guard.user.id,
      groupEntity: entity,
      topicId,
      scrapeJobId: scrapeJob?.id ?? null,
      sessionIds: tgSessions.map((s) => s.id),
      provider,
      apiKeyId: resolvedApiKeyId,
      model: resolvedModel,
      intervalMin,
      intervalMax,
      sendPct,
      replyPct,
      reactPct,
      contextSize,
      maxMessages,
      shouldLoop,
      dryRun,
      priorityReplyStrangers,
      bannedKeywords: normalizedBanned,
      newsEnabled: Boolean(newsEnabled),
      newsIntervalMinutes: Math.max(1, Number(newsIntervalMinutes) || 120),
      newsRssUrl: typeof newsRssUrl === "string" && newsRssUrl.trim() ? newsRssUrl.trim() : null,
      manualPersonasJson: manualPersonas && typeof manualPersonas === "object" ? manualPersonas : undefined,
      status: "PENDING",
    },
  });

  return NextResponse.json({ id: job.id, status: "PENDING" });
}
