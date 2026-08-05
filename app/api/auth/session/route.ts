import { NextResponse } from "next/server";
import { clearAppSession, getRawAppSession, getAuthorizedUserByEmail } from "@/lib/server-auth";

export async function GET() {
  const session = await getRawAppSession();
  if (!session) {
    return NextResponse.json({ session: null }, { status: 401 });
  }

  const user = await getAuthorizedUserByEmail(session.email);
  if (!user) {
    await clearAppSession();
    return NextResponse.json({ session: null, error: "E-mail não cadastrado para acesso ao sistema." }, { status: 403 });
  }

  return NextResponse.json({
    session: {
      userId: session.userId,
      email: session.email,
      expiresAt: session.expiresAt
    },
    user
  });
}
