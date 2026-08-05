import { NextResponse } from "next/server";
import { authErrorResponse, canUseRemoteAccess, requireAuthorizedSession } from "@/lib/server-auth";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";

const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;

function mediaFileName(mediaId: string, mimeType?: string | null, providedName?: string | null) {
  if (providedName) return providedName;
  const extension = mimeType?.split("/")[1]?.split(";")[0] || "bin";
  return `midia-whatsapp-${mediaId}.${extension}`;
}

export async function GET(_request: Request, context: { params: Promise<{ mediaId: string }> }) {
  try {
    const user = await requireAuthorizedSession();
    if (!isSupabaseAdminConfigured) {
      return NextResponse.json({ error: "Supabase server-side nao configurado." }, { status: 500 });
    }

    if (!canUseRemoteAccess(user.user)) {
      return NextResponse.json({ error: "Usuario nao autorizado." }, { status: 403 });
    }

    if (!whatsappToken) {
      return NextResponse.json({ error: "Token do WhatsApp nao configurado." }, { status: 500 });
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
  } catch (error) {
    return authErrorResponse(error);
  }
}
