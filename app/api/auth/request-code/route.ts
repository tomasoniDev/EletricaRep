import { NextResponse } from "next/server";
import { createSupabaseAuthClient, isSupabaseServerConfigured } from "@/lib/server-supabase";
import { getAuthorizedUserByEmail, isCorporateEmail } from "@/lib/server-auth";

type RequestCodePayload = {
  email?: string;
};

export async function POST(request: Request) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Configuração server-side do Supabase ausente." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as RequestCodePayload | null;
  const email = body?.email?.trim().toLowerCase() ?? "";

  if (!isCorporateEmail(email)) {
    return NextResponse.json({ error: "Use um e-mail corporativo da Tomasoni." }, { status: 403 });
  }

  const authorizedUser = await getAuthorizedUserByEmail(email);
  if (!authorizedUser) {
    return NextResponse.json({ error: "E-mail não cadastrado para acesso ao sistema." }, { status: 403 });
  }

  const supabase = createSupabaseAuthClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false
    }
  });

  if (error) {
    return NextResponse.json({ error: "Não foi possível enviar o código de acesso." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
