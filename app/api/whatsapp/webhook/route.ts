import { NextResponse } from "next/server";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";

type WhatsAppMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  text?: { body?: string };
  type?: string;
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
  return message.type ? `[Mensagem ${message.type}]` : "[Mensagem recebida]";
}

function messageDate(timestamp?: string) {
  if (!timestamp) return new Date().toISOString();
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
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

      const { data: existingConversation } = await supabase
        .from("chat_conversations")
        .select("*")
        .eq("customer_phone", phone)
        .neq("status", "closed")
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const conversation = existingConversation ?? (await supabase
        .from("chat_conversations")
        .insert({
          customer_phone: phone,
          customer_name: customerName,
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
          whatsapp_message_id: message.id ?? null,
          sender_phone: phone,
          sender_name: customerName,
          created_at: createdAt
        });

      await supabase
        .from("chat_conversations")
        .update({
          customer_name: customerName ?? conversation.customer_name,
          last_message_at: createdAt,
          updated_at: new Date().toISOString()
        })
        .eq("id", conversation.id);
    }
  }

  return NextResponse.json({ ok: true });
}
