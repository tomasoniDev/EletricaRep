import { NextResponse } from "next/server";
import { createSupabaseAuthClient, isSupabaseServerConfigured } from "@/lib/server-supabase";
import { getAuthorizedUserByEmail, isCorporateEmail, setAppSession } from "@/lib/server-auth";

type VerifyCodePayload = {
  email?: string;
  code?: string;
};

export async function POST(request: Request) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Configuração server-side do Supabase ausente." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as VerifyCodePayload | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const code = body?.code?.trim() ?? "";

  if (!isCorporateEmail(email)) {
    return NextResponse.json({ error: "Use um e-mail corporativo da Tomasoni." }, { status: 403 });
  }

  if (!code) {
    return NextResponse.json({ error: "Informe o código recebido por e-mail." }, { status: 400 });
  }

  const authorizedUser = await getAuthorizedUserByEmail(email);
  if (!authorizedUser) {
    return NextResponse.json({ error: "E-mail não cadastrado para acesso ao sistema." }, { status: 403 });
  }

  const supabase = createSupabaseAuthClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "email"
  });

  if (error || !data.user?.id || !data.user.email) {
    return NextResponse.json({ error: "Código inválido ou expirado." }, { status: 401 });
  }

  await setAppSession({
    userId: data.user.id,
    email: data.user.email
  });

  return NextResponse.json({
    session: {
      userId: data.user.id,
      email: data.user.email.toLowerCase()
    },
    user: authorizedUser
  });
}
