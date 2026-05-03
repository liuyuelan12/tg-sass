import { NextRequest, NextResponse } from "next/server";
import type { LlmProvider } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";
import { encrypt, decrypt } from "@/lib/crypto";

const VALID_PROVIDERS: LlmProvider[] = [
  "GROQ_BYOK",
  "OPENAI_BYOK",
  "ANTHROPIC_BYOK",
  "OPENAI_COMPAT_BYOK",
];

function maskKey(plaintext: string): string {
  if (plaintext.length <= 8) return "***";
  return `${plaintext.slice(0, 4)}...${plaintext.slice(-4)}`;
}

export async function GET() {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const keys = await prisma.userApiKey.findMany({
    where: { userId: guard.user.id },
    orderBy: { createdAt: "desc" },
  });

  const safe = keys.map((k) => {
    let keyMasked = "***";
    try {
      keyMasked = maskKey(decrypt(k.encryptedKey));
    } catch {
      // ignore — show *** on decryption failure
    }
    return {
      id: k.id,
      provider: k.provider,
      label: k.label,
      model: k.model,
      baseUrl: k.baseUrl,
      keyMasked,
      createdAt: k.createdAt,
    };
  });

  return NextResponse.json(safe);
}

export async function POST(req: NextRequest) {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  let body: {
    provider?: LlmProvider;
    apiKey?: string;
    label?: string;
    model?: string;
    baseUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { provider, apiKey, label, model, baseUrl } = body;
  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }
  if (!apiKey || apiKey.length < 8) {
    return NextResponse.json(
      { error: "apiKey is required (min 8 chars)" },
      { status: 400 }
    );
  }
  if (provider === "OPENAI_COMPAT_BYOK" && !baseUrl) {
    return NextResponse.json(
      { error: "baseUrl is required for OPENAI_COMPAT_BYOK" },
      { status: 400 }
    );
  }

  const encryptedKey = encrypt(apiKey);

  const saved = await prisma.userApiKey.upsert({
    where: {
      userId_provider: { userId: guard.user.id, provider },
    },
    create: {
      userId: guard.user.id,
      provider,
      encryptedKey,
      label: label ?? null,
      model: model ?? null,
      baseUrl: baseUrl ?? null,
    },
    update: {
      encryptedKey,
      label: label ?? null,
      model: model ?? null,
      baseUrl: baseUrl ?? null,
    },
  });

  return NextResponse.json({
    id: saved.id,
    provider: saved.provider,
    label: saved.label,
    model: saved.model,
    baseUrl: saved.baseUrl,
    keyMasked: maskKey(apiKey),
    createdAt: saved.createdAt,
  });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }

  const key = await prisma.userApiKey.findFirst({
    where: { id, userId: guard.user.id },
  });
  if (!key) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  await prisma.userApiKey.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
