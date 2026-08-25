import "server-only";

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import type { AuthorizedUser, UserRole } from "@/lib/types";
import { createSupabaseAdminClient, sessionSecret } from "@/lib/server-supabase";

export const APP_SESSION_COOKIE = "tomasoni_app_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const ALLOWED_EMAIL_DOMAINS = ["tomasoni.ind.br", "tomasoni.in.br"];

export type AppSession = {
  userId: string;
  email: string;
  expiresAt: number;
};

export type AuthorizedSession = AppSession & {
  user: AuthorizedUser;
};

export function isCorporateEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`));
}

export function hasFullAccess(role?: UserRole | null) {
  return role === "Admin" || role === "Diretoria";
}

export function canManageUsers(role?: UserRole | null) {
  return role === "Admin" || role === "Diretoria" || role === "Coordenador";
}

export function canEditMachine(role?: UserRole | null) {
  return role === "Admin" || role === "Diretoria" || role === "Engenharia" || role === "Coordenador";
}

export function canManageContracts(role?: UserRole | null) {
  return role === "Admin" || role === "Diretoria";
}

export function canEmitReports(role?: UserRole | null) {
  return role === "Admin" || role === "Diretoria" || role === "Engenharia" || role === "Coordenador" || role === "Montagem";
}

export function canEditSchedule(role?: UserRole | null) {
  return role === "Admin" || role === "Diretoria";
}

export function canUseRemoteAccess(user?: Pick<AuthorizedUser, "role" | "remote_access_allowed"> | null) {
  return user?.role === "Admin" || Boolean(user?.remote_access_allowed);
}

export function canAccessCredentials(user?: Pick<AuthorizedUser, "role" | "credential_access_allowed"> | null) {
  return user?.role === "Admin" || Boolean(user?.credential_access_allowed);
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function unbase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function encodeSession(session: AppSession) {
  const payload = base64Url(JSON.stringify(session));
  return `${payload}.${signPayload(payload)}`;
}

function decodeSession(value?: string): AppSession | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expected = signPayload(payload);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const session = JSON.parse(unbase64Url(payload)) as AppSession;
    if (!session.email || !session.userId || !session.expiresAt) return null;
    if (Date.now() > session.expiresAt) return null;
    return { ...session, email: session.email.toLowerCase() };
  } catch {
    return null;
  }
}

export async function setAppSession(session: Pick<AppSession, "userId" | "email">) {
  const cookieStore = await cookies();
  const value = encodeSession({
    userId: session.userId,
    email: session.email.toLowerCase(),
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000
  });

  cookieStore.set(APP_SESSION_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
}

export async function clearAppSession() {
  const cookieStore = await cookies();
  cookieStore.set(APP_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
}

export async function getRawAppSession() {
  const cookieStore = await cookies();
  return decodeSession(cookieStore.get(APP_SESSION_COOKIE)?.value);
}

export async function getAuthorizedUserByEmail(email: string) {
  if (!isCorporateEmail(email)) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("authorized_users")
    .select("id, name, email, role, phone, remote_access_allowed, credential_access_allowed, created_at, updated_at")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return (data as AuthorizedUser | null) ?? null;
}

export async function requireAuthorizedSession(): Promise<AuthorizedSession> {
  const session = await getRawAppSession();
  if (!session) {
    throw new Response("Sessão expirada.", { status: 401 });
  }

  const user = await getAuthorizedUserByEmail(session.email);
  if (!user) {
    throw new Response("Usuário não autorizado.", { status: 403 });
  }

  return { ...session, user };
}

export function authErrorResponse(error: unknown) {
  if (error instanceof Response) return error;
  return new Response("Não foi possível validar a sessão.", { status: 500 });
}
