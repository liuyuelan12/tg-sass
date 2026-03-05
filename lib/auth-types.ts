import "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      role: string;
    };
  }
}

// JWT augmentation is inlined in auth.ts callbacks
