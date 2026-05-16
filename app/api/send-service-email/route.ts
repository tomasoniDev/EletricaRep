import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SendEmailPayload = {
  to?: string[];
  subject?: string;
  filename?: string;
  pdfBase64?: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Tomasoni Relatórios <onboarding@resend.dev>";

function cleanRecipients(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((email) => String(email).trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

export async function POST(request: Request) {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Configuração do Supabase ausente." }, { status: 500 });
  }

  if (!resendApiKey) {
    return NextResponse.json({ error: "RESEND_API_KEY não configurada na Vercel." }, { status: 500 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Sessão não informada." }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const body = (await request.json()) as SendEmailPayload;
  const to = cleanRecipients(body.to);

  if (!to.length) {
    return NextResponse.json({ error: "Nenhum e-mail válido cadastrado na máquina." }, { status: 400 });
  }

  if (!body.pdfBase64 || !body.filename || !body.subject) {
    return NextResponse.json({ error: "Dados do relatório incompletos." }, { status: 400 });
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to,
      subject: body.subject,
      html: "<p>Mensagem automática. Não responda este e-mail.</p><p>O relatório de atendimento segue em anexo.</p>",
      attachments: [
        {
          filename: body.filename,
          content: body.pdfBase64
        }
      ]
    })
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json(
      { error: result?.message ?? "Não foi possível enviar o e-mail pelo Resend." },
      { status: response.status }
    );
  }

  return NextResponse.json({ id: result?.id ?? null });
}
