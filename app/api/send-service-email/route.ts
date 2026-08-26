import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { authErrorResponse, canEmitReports, requireAuthorizedSession } from "@/lib/server-auth";
import { uploadServiceReportToSharePoint } from "@/lib/sharepoint";

type SendEmailPayload = {
  to?: string[];
  subject?: string;
  filename?: string;
  pdfBase64?: string;
  machineCode?: string;
};

type SharePointUploadResult = Awaited<ReturnType<typeof uploadServiceReportToSharePoint>> | {
  skipped: false;
  error: string;
};

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT ?? 587);
const smtpSecure = process.env.SMTP_SECURE === "true";
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const fromEmail = process.env.SMTP_FROM ?? (smtpUser ? `Hub Tomasoni <${smtpUser}>` : undefined);

function cleanRecipients(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((email) => String(email).trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    .filter((email) => {
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    });
}

function smtpConfigurationError() {
  if (!smtpHost || !smtpUser || !smtpPass || !fromEmail) {
    return "Configuração SMTP incompleta na Vercel. Verifique SMTP_HOST, SMTP_USER, SMTP_PASS e SMTP_FROM.";
  }

  if (!Number.isFinite(smtpPort)) {
    return "SMTP_PORT inválida na Vercel.";
  }

  return "";
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthorizedSession();
    if (!canEmitReports(session.user.role)) {
      return NextResponse.json({ error: "Usuário sem permissão para enviar relatórios." }, { status: 403 });
    }

    const configError = smtpConfigurationError();
    if (configError) {
      return NextResponse.json({ error: configError }, { status: 500 });
    }

    const body = (await request.json()) as SendEmailPayload;
    const to = cleanRecipients(body.to);

    if (!to.length) {
      return NextResponse.json({ error: "Nenhum e-mail válido informado para envio." }, { status: 400 });
    }

    if (!body.pdfBase64 || !body.filename || !body.subject) {
      return NextResponse.json({ error: "Dados do relatório incompletos." }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      requireTLS: !smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass
      },
      tls: {
        minVersion: "TLSv1.2"
      }
    });

    const info = await transporter.sendMail({
      from: fromEmail,
      to,
      subject: body.subject,
      text: "Mensagem automática. Não responda este e-mail.\n\nO relatório de atendimento segue em anexo.",
      html: "<p>Mensagem automática. Não responda este e-mail.</p><p>O relatório de atendimento segue em anexo.</p>",
      attachments: [
        {
          filename: body.filename,
          content: Buffer.from(body.pdfBase64, "base64"),
          contentType: "application/pdf"
        }
      ]
    });

    let sharePoint: SharePointUploadResult | null = null;
    try {
      sharePoint = await uploadServiceReportToSharePoint({
        machineCode: body.machineCode,
        filename: body.filename,
        pdfBase64: body.pdfBase64
      });
    } catch (sharePointError) {
      sharePoint = {
        skipped: false,
        error: sharePointError instanceof Error ? sharePointError.message : "Falha ao salvar PDF no SharePoint."
      };
    }

    return NextResponse.json({ id: info.messageId ?? null, accepted: info.accepted ?? [], sharePoint });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { error: `Não foi possível enviar o e-mail via SMTP. Detalhe: ${error.message}` },
        { status: 502 }
      );
    }

    return authErrorResponse(error);
  }
}
