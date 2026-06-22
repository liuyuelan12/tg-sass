import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { getBrandConfigFromHost } from "@/lib/branding";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

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

    // Print OTP to console for debugging
    {
      console.log(`\n========== OTP ==========`);
      console.log(`  Email: ${normalizedEmail}`);
      console.log(`  Code:  ${code}`);
      console.log(`=========================\n`);
    }

    // 按访问域名（host）选择品牌署名
    const brand = getBrandConfigFromHost(
      req.headers.get("x-forwarded-host") ?? req.headers.get("host")
    );

    const { data, error } = await getResend().emails.send({
      from: process.env.OTP_FROM_EMAIL || `${brand.emailName} <noreply@example.com>`,
      to: normalizedEmail,
      subject: `您的${brand.emailName}登录验证码`,
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #3b82f6;">${brand.emailName}</h2>
          <p>您的验证码是：</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 20px; background: #f1f5f9; border-radius: 8px; margin: 16px 0;">
            ${code}
          </div>
          <p style="color: #64748b; font-size: 14px;">此验证码 10 分钟内有效。</p>
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
