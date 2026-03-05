import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      role: true,
      trialExpiresAt: true,
      isPaid: true,
      isDisabled: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const trialExpired = user.trialExpiresAt
    ? new Date() > user.trialExpiresAt
    : false;

  const hasAccess = user.role === "ADMIN" || user.isPaid || !trialExpired;

  return NextResponse.json({
    email: user.email,
    role: user.role,
    isPaid: user.isPaid,
    trialExpiresAt: user.trialExpiresAt,
    trialExpired,
    hasAccess,
  });
}
