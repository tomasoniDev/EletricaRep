import { NextResponse } from "next/server";
import { authErrorResponse, canEmitReports, requireAuthorizedSession } from "@/lib/server-auth";

type SendEmailPayload = {
  to?: string[];
  subject?: string;
  filename?: string;
  pdfBase64?: string;
};

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Tomasoni Relatórios <onboarding@resend.dev>";

function cleanRecipients(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((email) => String(email).trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthorizedSession();
    if (!canEmitReports(session.user.role)) {
      return NextResponse.json({ error: "Usuário sem permissão para enviar relatórios." }, { status: 403 });
    }

    if (!resendApiKey) {
      return NextResponse.json({ error: "RESEND_API_KEY não configurada na Vercel." }, { status: 500 });
    }

    const body = (await request.json()) as SendEmailPayload;
    const to = cleanRecipients(body.to);

    if (!to.length) {
      return NextResponse.json({ error: "Nenhum e-mail válido informado para envio." }, { status: 400 });
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
  } catch (error) {
    return authErrorResponse(error);
  }
}
