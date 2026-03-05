import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: "otp",
      name: "Email OTP",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "OTP Code", type: "text" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string)?.toLowerCase().trim();
        const code = credentials?.code as string;
        if (!email || !code) {
          console.log("[otp-auth] missing email or code");
          return null;
        }

        console.log("[otp-auth] verifying:", email, "code:", code);

        const otpRecord = await prisma.otpCode.findFirst({
          where: {
            email,
            code,
            used: false,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
        });

        if (!otpRecord) {
          console.log("[otp-auth] no valid OTP found for:", email);
          return null;
        }

        await prisma.otpCode.update({
          where: { id: otpRecord.id },
          data: { used: true },
        });

        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          user = await prisma.user.create({
            data: {
              email,
              trialExpiresAt: new Date(
                Date.now() +
                  (parseInt(process.env.TRIAL_DURATION_HOURS || "3") || 3) *
                    60 *
                    60 *
                    1000
              ),
            },
          });
        }

        if (user.isDisabled) return null;

        return {
          id: user.id,
          email: user.email,
          role: user.role,
        };
      },
    }),
    Credentials({
      id: "password",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;
        if (!email || !password) {
          console.log("[password-auth] missing email or password");
          return null;
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });
        if (!user) {
          console.log("[password-auth] user not found:", normalizedEmail);
          return null;
        }
        if (!user.passwordHash) {
          console.log("[password-auth] no password set for:", normalizedEmail);
          return null;
        }
        if (user.isDisabled) {
          console.log("[password-auth] user disabled:", normalizedEmail);
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          console.log("[password-auth] invalid password for:", normalizedEmail);
          return null;
        }

        console.log("[password-auth] success:", normalizedEmail);
        return {
          id: user.id,
          email: user.email,
          role: user.role,
        };
      },
    }),
    Credentials({
      id: "admin",
      name: "Admin Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || user.role !== "ADMIN" || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role: string }).role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.AUTH_SECRET,
});
