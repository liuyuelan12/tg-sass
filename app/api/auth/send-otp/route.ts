import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/db";

const resend = new Resend(process.env.RESEND_API_KEY);

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user is disabled
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser?.isDisabled) {
      return NextResponse.json({ error: "Account is disabled" }, { status: 403 });
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.otpCode.create({
      data: {
        email: normalizedEmail,
        code,
        expiresAt,
      },
    });

    // Dev mode: always print OTP to console
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n========== OTP ==========`);
      console.log(`  Email: ${normalizedEmail}`);
      console.log(`  Code:  ${code}`);
      console.log(`=========================\n`);
    }

    const { data, error } = await resend.emails.send({
      from: process.env.OTP_FROM_EMAIL || "TG-SaaS <noreply@example.com>",
      to: normalizedEmail,
      subject: "Your TG-SaaS Login Code",
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #3b82f6;">TG-SaaS</h2>
          <p>Your verification code is:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 20px; background: #f1f5f9; border-radius: 8px; margin: 16px 0;">
            ${code}
          </div>
          <p style="color: #64748b; font-size: 14px;">This code expires in 10 minutes.</p>
        </div>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      // Still return success in dev — user can read OTP from console
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
      }
    } else {
      console.log("Resend success, id:", data?.id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Send OTP error:", err);
    return NextResponse.json({ error: "Failed to send OTP" }, { status: 500 });
  }
}
