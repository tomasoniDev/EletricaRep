import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";

type SendWhatsAppPayload = {
  conversationId?: string;
  body?: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

async function authorizedUserFromToken(token: string) {
  if (!supabaseUrl || !supabaseAnonKey || !isSupabaseAdminConfigured) return null;

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user?.email) return null;

  const admin = createSupabaseAdminClient();
  const { data: authorizedUser } = await admin
    .from("authorized_users")
    .select("*")
    .eq("email", userData.user.email.toLowerCase())
    .maybeSingle();

  if (!authorizedUser?.remote_access_allowed) return null;
  return {
    id: userData.user.id,
    email: userData.user.email.toLowerCase(),
    name: authorizedUser.name || userData.user.email
  };
}

async function sendToWhatsApp(to: string, body: string) {
  if (!whatsappToken || !whatsappPhoneNumberId) {
    return { configured: false, id: null };
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
    throw new Error(result?.error?.message ?? "Nao foi possivel enviar a mensagem pelo WhatsApp.");
  }

  return { configured: true, id: result?.messages?.[0]?.id ?? null };
}

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase server-side nao configurado." }, { status: 500 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Sessao nao informada." }, { status: 401 });
  }

  const user = await authorizedUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: "Usuario nao autorizado." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as SendWhatsAppPayload | null;
  const conversationId = body?.conversationId?.trim();
  const messageBody = body?.body?.trim();

  if (!conversationId || !messageBody) {
    return NextResponse.json({ error: "Conversa e mensagem sao obrigatorias." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: conversation } = await admin
    .from("chat_conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) {
    return NextResponse.json({ error: "Conversa nao encontrada." }, { status: 404 });
  }

  if (conversation.status === "closed") {
    return NextResponse.json({ error: "Conversa encerrada." }, { status: 409 });
  }

  let whatsappMessageId: string | null = null;
  let deliveryMode = "validation";

  try {
    const result = await sendToWhatsApp(conversation.customer_phone, messageBody);
    whatsappMessageId = result.id;
    deliveryMode = result.configured ? "whatsapp" : "validation";
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha no envio." }, { status: 502 });
  }

  const now = new Date().toISOString();
  const { error: insertError } = await admin
    .from("chat_messages")
    .insert({
      conversation_id: conversation.id,
      direction: "outbound",
      body: messageBody,
      whatsapp_message_id: whatsappMessageId,
      sender_email: user.email,
      sender_name: user.name,
      created_by: user.id
    });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await admin
    .from("chat_conversations")
    .update({
      status: "assigned",
      assigned_to: conversation.assigned_to ?? user.id,
      assigned_to_email: conversation.assigned_to_email ?? user.email,
      assigned_to_name: conversation.assigned_to_name ?? user.name,
      last_message_at: now,
      updated_at: now
    })
    .eq("id", conversation.id);

  return NextResponse.json({ ok: true, deliveryMode, whatsappMessageId });
}
