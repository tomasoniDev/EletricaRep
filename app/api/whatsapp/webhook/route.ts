import { NextResponse } from "next/server";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";

type WhatsAppMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  text?: { body?: string };
  image?: WhatsAppMedia;
  video?: WhatsAppMedia;
  audio?: WhatsAppMedia;
  document?: WhatsAppMedia;
  type?: string;
};

type WhatsAppMedia = {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
};

type WhatsAppContact = {
  wa_id?: string;
  profile?: { name?: string };
};

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: WhatsAppContact[];
        messages?: WhatsAppMessage[];
      };
    }>;
  }>;
};

function normalizePhone(value?: string) {
  return String(value ?? "").replace(/\D/g, "");
}

function messageBody(message: WhatsAppMessage) {
  if (message.text?.body) return message.text.body;
  const media = messageMedia(message);
  if (media?.caption) return media.caption;
  if (message.type === "image") return "[Imagem recebida]";
  if (message.type === "video") return "[Vídeo recebido]";
  if (message.type === "audio") return "[Áudio recebido]";
  if (message.type === "document") return `[Documento recebido${media?.filename ? `: ${media.filename}` : ""}]`;
  return message.type ? `[Mensagem ${message.type}]` : "[Mensagem recebida]";
}

function messageMedia(message: WhatsAppMessage) {
  if (message.type === "image") return message.image;
  if (message.type === "video") return message.video;
  if (message.type === "audio") return message.audio;
  if (message.type === "document") return message.document;
  return null;
}

function messageType(message: WhatsAppMessage) {
  if (message.type === "text") return "text";
  if (message.type === "image" || message.type === "video" || message.type === "audio" || message.type === "document") return message.type;
  return "unknown";
}

function messageDate(timestamp?: string) {
  if (!timestamp) return new Date().toISOString();
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

async function sendAutomaticMessage(to: string, body: string) {
  const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!whatsappToken || !whatsappPhoneNumberId) {
    return { sent: false, reason: "API do WhatsApp não configurada." };
  }

  const response = await fetch(`https://graph.facebook.com/v20.0/${whatsappPhoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${whatsappToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body }
    })
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    return { sent: false, reason: result?.error?.message ?? "Falha no envio da mensagem automática." };
  }

  return { sent: true, whatsappMessageId: result?.messages?.[0]?.id ?? null };
}

async function registerAutomaticMessage(supabase: ReturnType<typeof createSupabaseAdminClient>, conversationId: string, customerPhone: string, body: string) {
  const result = await sendAutomaticMessage(customerPhone, body);

  await supabase
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      direction: result.sent ? "outbound" : "system",
      body: result.sent ? body : `Mensagem automática não enviada: ${result.reason}`,
      message_type: "text",
      whatsapp_message_id: result.sent ? result.whatsappMessageId ?? null : null,
      sender_name: "Sistema"
    });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }

  return NextResponse.json({ error: "Token de verificacao invalido." }, { status: 403 });
}

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase server-side nao configurado." }, { status: 500 });
  }

  const supabase = createSupabaseAdminClient();
  const payload = (await request.json().catch(() => null)) as WhatsAppWebhookPayload | null;
  const changes = payload?.entry?.flatMap((entry) => entry.changes ?? []) ?? [];

  for (const change of changes) {
    const contacts = change.value?.contacts ?? [];
    const messages = change.value?.messages ?? [];

    for (const message of messages) {
      const phone = normalizePhone(message.from);
      if (!phone) continue;

      const contact = contacts.find((item) => normalizePhone(item.wa_id) === phone) ?? contacts[0];
      const customerName = contact?.profile?.name ?? null;
      const createdAt = messageDate(message.timestamp);
      const media = messageMedia(message);

      const { data: chatContact } = await supabase
        .from("chat_contacts")
        .upsert({
          phone,
          name: customerName,
          updated_at: new Date().toISOString()
        }, { onConflict: "phone", ignoreDuplicates: false })
        .select()
        .single();

      const { data: existingConversation } = await supabase
        .from("chat_conversations")
        .select("*")
        .eq("customer_phone", phone)
        .neq("status", "closed")
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isNewConversation = !existingConversation;
      const nextIdentificationStatus = chatContact?.company ? "pending_machine" : "pending_customer";
      const conversation = existingConversation ?? (await supabase
        .from("chat_conversations")
        .insert({
          customer_phone: phone,
          customer_name: customerName,
          customer_company: chatContact?.company ?? null,
          contact_id: chatContact?.id ?? null,
          identification_status: nextIdentificationStatus,
          status: "open",
          last_message_at: createdAt
        })
        .select()
        .single()).data;

      if (!conversation) continue;

      if (message.id) {
        const { data: existingMessage } = await supabase
          .from("chat_messages")
          .select("id")
          .eq("whatsapp_message_id", message.id)
          .maybeSingle();

        if (existingMessage) continue;
      }

      await supabase
        .from("chat_messages")
        .insert({
          conversation_id: conversation.id,
          direction: "inbound",
          body: messageBody(message),
          message_type: messageType(message),
          media_id: media?.id ?? null,
          media_mime_type: media?.mime_type ?? null,
          media_sha256: media?.sha256 ?? null,
          media_filename: media?.filename ?? null,
          media_caption: media?.caption ?? null,
          whatsapp_message_id: message.id ?? null,
          sender_phone: phone,
          sender_name: customerName,
          created_at: createdAt
        });

      await supabase
        .from("chat_conversations")
        .update({
          customer_name: customerName ?? conversation.customer_name,
          customer_company: conversation.customer_company ?? chatContact?.company ?? null,
          contact_id: conversation.contact_id ?? chatContact?.id ?? null,
          last_message_at: createdAt,
          updated_at: new Date().toISOString()
        })
        .eq("id", conversation.id);

      if (isNewConversation) {
        const automaticMessage = chatContact?.company
          ? `Olá, ${customerName ?? "tudo bem"}! Recebemos sua mensagem. Para direcionar o atendimento, informe o código da máquina ou o número de série.`
          : "Olá! Recebemos sua mensagem no Acesso Remoto Tomasoni. Para iniciar o atendimento, informe por favor seu nome e a empresa.";

        await registerAutomaticMessage(supabase, conversation.id, phone, automaticMessage);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
