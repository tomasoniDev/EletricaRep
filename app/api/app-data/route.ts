import { NextResponse } from "next/server";
import { readdirSync, statSync } from "fs";
import path from "path";
import { authErrorResponse, canAccessCredentials, hasFullAccess, requireAuthorizedSession } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/server-supabase";
import type { AppAdminInfo, AppAuditLog, MachineCredential } from "@/lib/types";

const MACHINE_SAFE_SELECT = `
  id,
  code,
  model,
  client,
  unit_city,
  serial,
  description,
  manufacture_month,
  mechanical_list,
  software_code,
  ip_range,
  vm,
  software_version,
  access_method,
  remote_access,
  support_contract_active,
  support_contract_type,
  support_contract_until,
  created_at,
  updated_at,
  machine_emails(*),
  service_records(*)
`;

const EMPTY_MACHINE_CREDENTIALS = {
  vnc_ip: null,
  vnc_user: null,
  vnc_password: null,
  vnc_vm_password: null,
  vnc_notes: null,
  sinema_url: null,
  sinema_user: null,
  sinema_password: null,
  sinema_notes: null
};

const MACHINE_CREDENTIAL_SAFE_SELECT = "machine_id, vnc_ip, vnc_user, vnc_notes, sinema_url, sinema_user, sinema_notes, created_at, updated_at";
const MACHINE_CREDENTIAL_FULL_SELECT = "machine_id, vnc_ip, vnc_user, vnc_password, vnc_vm_password, vnc_notes, sinema_url, sinema_user, sinema_password, sinema_notes, created_at, updated_at";

function loadMigrationInfo() {
  try {
    const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
    return readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => {
        const [version, ...nameParts] = file.replace(/\.sql$/, "").split("_");
        const stats = statSync(path.join(migrationsDir, file));
        return {
          version,
          name: nameParts.join(" ").replace(/\b\w/g, (char) => char.toUpperCase()),
          file,
          updated_at: stats.mtime.toISOString()
        };
      })
      .reverse()
      .slice(0, 12);
  } catch {
    return [];
  }
}

function deploymentInfo() {
  return {
    environment: process.env.VERCEL_ENV ?? null,
    url: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? null,
    commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    commit_message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    commit_author: process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME ?? null,
    region: process.env.VERCEL_REGION ?? process.env.VERCEL_FUNCTION_REGION ?? null,
    node_env: process.env.NODE_ENV ?? null,
    generated_at: new Date().toISOString()
  };
}

export async function GET() {
  try {
    const session = await requireAuthorizedSession();
    const admin = createSupabaseAdminClient();

    const { data: machineRows, error: machineError } = await admin
      .from("machines")
      .select(MACHINE_SAFE_SELECT)
      .order("code", { ascending: true });

    if (machineError) {
      return NextResponse.json({ error: machineError.message }, { status: 500 });
    }

    const machineIds = (machineRows ?? []).map((machine) => machine.id).filter(Boolean);
    const credentialRows: MachineCredential[] = [];

    if (machineIds.length && canAccessCredentials(session.user)) {
      const { data: credentials, error: credentialError } = await admin
        .from("machine_credentials")
        .select(MACHINE_CREDENTIAL_FULL_SELECT)
        .in("machine_id", machineIds);

      if (!credentialError) {
        credentialRows.push(...((credentials ?? []) as MachineCredential[]));
      }
    } else if (machineIds.length) {
      const { data: credentials, error: credentialError } = await admin
        .from("machine_credentials")
        .select(MACHINE_CREDENTIAL_SAFE_SELECT)
        .in("machine_id", machineIds);

      if (!credentialError) {
        credentialRows.push(...((credentials ?? []) as unknown as MachineCredential[]));
      }
    }

    const credentialByMachine = new Map(credentialRows.map((credential) => [credential.machine_id, credential]));
    const machines = (machineRows ?? []).map((machine) => ({
      ...EMPTY_MACHINE_CREDENTIALS,
      ...machine,
      ...(credentialByMachine.get(machine.id) ?? {})
    }));

    const [
      usersResult,
      scheduleResult,
      contractResult,
      contactResult,
      chatResult
    ] = await Promise.all([
      admin
        .from("authorized_users")
        .select("id, name, email, role, phone, remote_access_allowed, credential_access_allowed, created_at, updated_at")
        .order("name", { ascending: true }),
      admin
        .from("travel_schedules")
        .select("id, start_date, end_date, code, client, technicians, status, reason, created_by, created_at, updated_at")
        .order("created_at", { ascending: false }),
      admin
        .from("support_contracts")
        .select("id, machine_id, code, client, serial, contract_type, status, active, support_contract_until, created_by, created_at, updated_at")
        .order("support_contract_until", { ascending: true }),
      admin
        .from("chat_contacts")
        .select("id, phone, name, company, created_at, updated_at")
        .order("company", { ascending: true }),
      admin
        .from("chat_conversations")
        .select("id, customer_phone, customer_name, customer_company, contact_id, machine_id, machine_code, machine_serial, identification_status, status, assigned_to, assigned_to_email, assigned_to_name, closed_by, closed_at, last_message_at, created_at, updated_at, chat_messages(id, conversation_id, direction, body, message_type, media_id, media_mime_type, media_sha256, media_filename, media_caption, whatsapp_message_id, sender_phone, sender_name, sender_email, created_by, created_at)")
        .order("last_message_at", { ascending: false })
    ]);

    let adminInfo: AppAdminInfo | null = null;
    let auditWarning: string | null = null;
    if (hasFullAccess(session.user.role)) {
      const auditResult = await admin
        .from("app_audit_logs")
        .select("id, action, entity, entity_id, entity_label, user_id, user_email, user_name, user_role, details, created_at")
        .order("created_at", { ascending: false })
        .limit(80);

      auditWarning = auditResult.error?.message ?? null;
      adminInfo = {
        migrations: loadMigrationInfo(),
        deployment: deploymentInfo(),
        auditLogs: (auditResult.data ?? []) as AppAuditLog[]
      };
    }

    return NextResponse.json({
      session: {
        userId: session.userId,
        email: session.email,
        expiresAt: session.expiresAt
      },
      user: session.user,
      machines,
      authorizedUsers: usersResult.data ?? [],
      travelSchedules: scheduleResult.data ?? [],
      supportContracts: contractResult.data ?? [],
      chatContacts: contactResult.data ?? [],
      chatConversations: chatResult.data ?? [],
      adminInfo,
      warnings: {
        users: usersResult.error?.message ?? null,
        travelSchedules: scheduleResult.error?.message ?? null,
        supportContracts: contractResult.error?.message ?? null,
        chatContacts: contactResult.error?.message ?? null,
        chatConversations: chatResult.error?.message ?? null,
        auditLogs: auditWarning
      }
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
