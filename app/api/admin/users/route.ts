import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

async function verifyAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      isPaid: true,
      isDisabled: true,
      trialExpiresAt: true,
      createdAt: true,
      _count: {
        select: {
          tgSessions: true,
          scrapeJobs: true,
          chatJobs: true,
        },
      },
    },
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { email, password, hours } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const trialHours = parseInt(hours || "72");
    const trialExpiresAt = new Date(
      Date.now() + trialHours * 60 * 60 * 1000
    );

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        trialExpiresAt,
      },
    });

    return NextResponse.json({
      id: user.id,
      email: user.email,
      trialExpiresAt: user.trialExpiresAt,
    });
  } catch (err) {
    console.error("[admin create user] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create user" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId, action, value } = await req.json();

  if (!userId || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  switch (action) {
    case "extend": {
      const hours = parseInt(value || "3");
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const baseTime =
        user?.trialExpiresAt && user.trialExpiresAt > new Date()
          ? user.trialExpiresAt
          : new Date();
      await prisma.user.update({
        where: { id: userId },
        data: {
          trialExpiresAt: new Date(
            baseTime.getTime() + hours * 60 * 60 * 1000
          ),
        },
      });
      break;
    }
    case "paid":
      await prisma.user.update({
        where: { id: userId },
        data: { isPaid: true },
      });
      break;
    case "unpaid":
      await prisma.user.update({
        where: { id: userId },
        data: { isPaid: false },
      });
      break;
    case "disable":
      await prisma.user.update({
        where: { id: userId },
        data: { isDisabled: true },
      });
      break;
    case "enable":
      await prisma.user.update({
        where: { id: userId },
        data: { isDisabled: false },
      });
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
