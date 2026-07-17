import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;

async function authorizedUserFromToken(token: string) {
  if (!supabaseUrl || !supabaseAnonKey || !isSupabaseAdminConfigured) return null;

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user?.email) return null;

  const admin = createSupabaseAdminClient();
  const { data: authorizedUser } = await admin
    .from("authorized_users")
    .select("remote_access_allowed")
    .eq("email", userData.user.email.toLowerCase())
    .maybeSingle();

  return authorizedUser?.remote_access_allowed ? userData.user : null;
}

function mediaFileName(mediaId: string, mimeType?: string | null, providedName?: string | null) {
  if (providedName) return providedName;
  const extension = mimeType?.split("/")[1]?.split(";")[0] || "bin";
  return `midia-whatsapp-${mediaId}.${extension}`;
}

export async function GET(request: Request, context: { params: Promise<{ mediaId: string }> }) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase server-side nao configurado." }, { status: 500 });
  }

  if (!whatsappToken) {
    return NextResponse.json({ error: "Token do WhatsApp nao configurado." }, { status: 500 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Sessao nao informada." }, { status: 401 });
  }

  const user = await authorizedUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: "Usuario nao autorizado." }, { status: 403 });
  }

  const { mediaId } = await context.params;
  const admin = createSupabaseAdminClient();
  const { data: message } = await admin
    .from("chat_messages")
    .select("media_id, media_mime_type, media_filename")
    .eq("media_id", mediaId)
    .maybeSingle();

  if (!message?.media_id) {
    return NextResponse.json({ error: "Midia nao encontrada no historico." }, { status: 404 });
  }

  const metadataResponse = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${whatsappToken}` }
  });

  const metadata = await metadataResponse.json().catch(() => null);
  if (!metadataResponse.ok || !metadata?.url) {
    return NextResponse.json({ error: metadata?.error?.message ?? "Midia indisponivel na Meta." }, { status: 502 });
  }

  const mediaResponse = await fetch(metadata.url, {
    headers: { Authorization: `Bearer ${whatsappToken}` }
  });

  if (!mediaResponse.ok || !mediaResponse.body) {
    return NextResponse.json({ error: "Nao foi possivel baixar a midia da Meta." }, { status: 502 });
  }

  const contentType = metadata.mime_type || message.media_mime_type || "application/octet-stream";
  const filename = mediaFileName(mediaId, contentType, message.media_filename);

  return new Response(mediaResponse.body, {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
      "Content-Type": contentType
    }
  });
}
