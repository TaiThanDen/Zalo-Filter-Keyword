import type { AuthenticatedUser } from "@/src/types/auth";

export type LoginInput = {
  email: string;
  password: string;
};

export type SessionUser = AuthenticatedUser;
