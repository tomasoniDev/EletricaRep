import { NextResponse } from "next/server";
import { clearAppSession } from "@/lib/server-auth";

export async function POST() {
  await clearAppSession();
  return NextResponse.json({ ok: true });
}
