import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

type GuardResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: NextResponse };

/**
 * Server-side guard for API routes.
 * Checks: authenticated + not disabled + trial not expired (or paid/admin).
 */
export async function requireActiveUser(): Promise<GuardResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      role: true,
      isPaid: true,
      isDisabled: true,
      trialExpiresAt: true,
    },
  });

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "User not found" }, { status: 404 }),
    };
  }

  if (user.isDisabled) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Account is disabled" },
        { status: 403 }
      ),
    };
  }

  // Admin and paid users bypass trial check
  if (user.role !== "ADMIN" && !user.isPaid) {
    const trialExpired = user.trialExpiresAt
      ? new Date() > user.trialExpiresAt
      : true; // No trialExpiresAt = never had trial = expired

    if (trialExpired) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Trial expired. Please upgrade to continue." },
          { status: 402 }
        ),
      };
    }
  }

  return {
    ok: true,
    user: { id: user.id, email: user.email, role: user.role },
  };
}
