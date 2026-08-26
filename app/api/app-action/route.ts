import { NextResponse } from "next/server";
import {
  type AuthorizedSession,
  authErrorResponse,
  canAccessCredentials,
  canEditMachine,
  canEditSchedule,
  canEmitReports,
  canManageContracts,
  canManageUsers,
  canUseRemoteAccess,
  hasFullAccess,
  isCorporateEmail,
  requireAuthorizedSession
} from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/server-supabase";
import { archiveServiceReportInSharePoint, safeBackupOperationalDataToSharePoint, uploadServiceReportToSharePoint } from "@/lib/sharepoint";

type ActionBody = {
  action?: string;
  payload?: Record<string, unknown>;
};

const AUTHORIZED_USER_ROLES = new Set([
  "Admin",
  "Diretoria",
  "Coordenador",
  "Engenharia",
  "Montagem",
  "Montagem Elétrica",
  "Montagem Mecânica",
  "Controladoria",
  "Comercial"
]);

function text(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function userRole(value: unknown) {
  const role = text(value) ?? "Montagem Elétrica";
  return AUTHORIZED_USER_ROLES.has(role) ? role : null;
}

function upper(value: unknown) {
  return text(value)?.toUpperCase() ?? null;
}

function id(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function bool(value: unknown) {
  return Boolean(value);
}

function serviceAttachments(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 6)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const name = String(row.name ?? "imagem").trim().slice(0, 120) || "imagem";
      const type = String(row.type ?? "image/jpeg").trim().slice(0, 80) || "image/jpeg";
      const dataUrl = String(row.dataUrl ?? "").trim();
      const caption = text(row.caption);
      const width = Number(row.width);
      const height = Number(row.height);
      if (!type.startsWith("image/") || !dataUrl.startsWith("data:image/")) return null;
      if (dataUrl.length > 1_800_000) return null;
      return {
        id: String(row.id ?? crypto.randomUUID()).trim().slice(0, 80) || crypto.randomUUID(),
        name,
        type,
        dataUrl,
        width: Number.isFinite(width) && width > 0 ? width : null,
        height: Number.isFinite(height) && height > 0 ? height : null,
        caption
      };
    })
    .filter(Boolean);
}

function serviceRecipients(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item)?.toLowerCase())
    .filter((item): item is string => Boolean(item))
    .slice(0, 20);
}

function serviceTechnicians(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const name = text(row.name);
      if (!name) return null;
      return {
        id: id(row.id),
        name,
        email: text(row.email)?.toLowerCase() ?? null,
        role: text(row.role)
      };
    })
    .filter((item): item is { id: string | null; name: string; email: string | null; role: string | null } => Boolean(item))
    .slice(0, 12);
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function safeRecordAudit(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  session: AuthorizedSession,
  entry: {
    action: string;
    entity?: string | null;
    entityId?: string | null;
    entityLabel?: string | null;
    details?: Record<string, unknown>;
  }
) {
  try {
    await admin.from("app_audit_logs").insert({
      action: entry.action,
      entity: entry.entity ?? null,
      entity_id: entry.entityId ?? null,
      entity_label: entry.entityLabel ?? null,
      user_id: session.userId,
      user_email: session.email,
      user_name: session.user.name,
      user_role: session.user.role,
      details: entry.details ?? {}
    });
  } catch {
    // A auditoria depende da migration mais recente; a ação principal não deve ser bloqueada por isso.
  }
}

async function safeRefreshSharePointBackup(admin: ReturnType<typeof createSupabaseAdminClient>) {
  return safeBackupOperationalDataToSharePoint(admin);
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthorizedSession();
    const body = (await request.json().catch(() => null)) as ActionBody | null;
    const action = body?.action ?? "";
    const payload = body?.payload ?? {};
    const admin = createSupabaseAdminClient();

    if (action === "saveMachine") {
      if (!canEditMachine(session.user.role)) return jsonError("Usuário sem permissão para alterar máquinas.", 403);

      const machinePayload = {
        code: upper(payload.code),
        model: text(payload.model),
        client: text(payload.client),
        unit_city: text(payload.unit_city),
        serial: upper(payload.serial),
        description: text(payload.description),
        manufacture_month: text(payload.manufacture_month),
        mechanical_list: upper(payload.mechanical_list),
        software_code: upper(payload.software_code),
        ip_range: text(payload.ip_range),
        vm: text(payload.vm),
        software_version: text(payload.software_version),
        access_method: null,
        remote_access: text(payload.remote_access) ?? "Sem acesso remoto"
      };
      const editingId = id(payload.id);
      const result = editingId
        ? await admin.from("machines").update(machinePayload).eq("id", editingId).select().single()
        : await admin.from("machines").insert(machinePayload).select().single();

      if (result.error || !result.data) return jsonError(result.error?.message ?? "Máquina não salva.", 500);

      if (canAccessCredentials(session.user)) {
        const remoteAccess = machinePayload.remote_access;
        const credentialPayload = {
          machine_id: result.data.id,
          vnc_ip: remoteAccess === "VNC" ? text(payload.vnc_ip) : null,
          vnc_user: remoteAccess === "VNC" ? text(payload.vnc_user) : null,
          vnc_password: remoteAccess === "VNC" ? text(payload.vnc_password) : null,
          vnc_vm_password: remoteAccess === "VNC" ? text(payload.vnc_vm_password) : null,
          vnc_notes: remoteAccess === "VNC" ? text(payload.vnc_notes) : null,
          sinema_url: remoteAccess === "SINEMA" ? text(payload.sinema_url) : null,
          sinema_user: remoteAccess === "SINEMA" ? text(payload.sinema_user) : null,
          sinema_password: remoteAccess === "SINEMA" ? text(payload.sinema_password) : null,
          sinema_notes: remoteAccess === "SINEMA" ? text(payload.sinema_notes) : null,
          updated_at: new Date().toISOString()
        };
        const credentialResult = await admin.from("machine_credentials").upsert(credentialPayload, { onConflict: "machine_id" });
        if (credentialResult.error) return jsonError("Máquina salva, mas as credenciais não foram atualizadas.", 500);
      }

      await safeRecordAudit(admin, session, {
        action: editingId ? "machine.updated" : "machine.created",
        entity: "machines",
        entityId: result.data.id,
        entityLabel: machinePayload.code ?? machinePayload.model ?? machinePayload.client,
        details: {
          code: machinePayload.code,
          client: machinePayload.client,
          model: machinePayload.model,
          remote_access: machinePayload.remote_access
        }
      });

      const backup = await safeRefreshSharePointBackup(admin);
      return NextResponse.json({ data: result.data, backup });
    }

    if (action === "saveUser") {
      if (!canManageUsers(session.user.role)) return jsonError("Usuário sem permissão para gerenciar usuários.", 403);
      const email = String(payload.email ?? "").trim().toLowerCase();
      if (!isCorporateEmail(email)) return jsonError("Cadastre apenas e-mails corporativos da Tomasoni.");
      const userPayload = {
        name: text(payload.name),
        email,
        role: userRole(payload.role),
        phone: String(payload.phone ?? "").replace(/\D/g, ""),
        remote_access_allowed: bool(payload.remote_access_allowed),
        credential_access_allowed: bool(payload.credential_access_allowed)
      };
      if (!userPayload.role) return jsonError("Perfil de usuário inválido.");
      const editingId = id(payload.id);
      const result = await admin
        .rpc("save_authorized_user_as_operator", {
          input_operator_email: session.email,
          input_id: editingId,
          input_name: userPayload.name,
          input_email: userPayload.email,
          input_role: userPayload.role,
          input_remote_access_allowed: userPayload.remote_access_allowed,
          input_credential_access_allowed: userPayload.credential_access_allowed,
          input_phone: userPayload.phone
        })
        .single();
      if (result.error || !result.data) return jsonError(result.error?.message ?? "Usuário não salvo.", 500);
      const savedUser = result.data as { id?: string };
      await safeRecordAudit(admin, session, {
        action: editingId ? "user.updated" : "user.created",
        entity: "authorized_users",
        entityId: savedUser.id,
        entityLabel: userPayload.email,
        details: {
          name: userPayload.name,
          email: userPayload.email,
          role: userPayload.role,
          remote_access_allowed: userPayload.remote_access_allowed,
          credential_access_allowed: userPayload.credential_access_allowed
        }
      });
      await safeRefreshSharePointBackup(admin);
      return NextResponse.json({ data: result.data });
    }

    if (action === "saveProfile") {
      const displayName = text(payload.display_name);
      if (!displayName) return jsonError("Informe o nome exibido.");
      await admin.from("profiles").upsert({
        user_id: session.userId,
        email: session.email,
        display_name: displayName
      }, { onConflict: "user_id" });
      const result = await admin
        .from("authorized_users")
        .update({ name: displayName })
        .eq("email", session.email)
        .select()
        .single();
      if (result.error || !result.data) return jsonError(result.error?.message ?? "Usuário não atualizado.", 500);
      await safeRecordAudit(admin, session, {
        action: "profile.updated",
        entity: "authorized_users",
        entityId: result.data.id,
        entityLabel: session.email,
        details: { display_name: displayName }
      });
      await safeRefreshSharePointBackup(admin);
      return NextResponse.json({ data: result.data });
    }

    if (action === "saveChatContact") {
      if (!canUseRemoteAccess(session.user)) return jsonError("Usuário sem permissão para editar clientes do Acesso Remoto.", 403);
      const contactId = id(payload.id);
      if (!contactId) return jsonError("Cliente não informado.");
      const phone = String(payload.phone ?? "").replace(/\D/g, "");
      if (!phone) return jsonError("Informe um telefone válido.");
      const result = await admin
        .from("chat_contacts")
        .update({
          name: text(payload.name),
          company: text(payload.company),
          phone,
          updated_at: new Date().toISOString()
        })
        .eq("id", contactId)
        .select()
        .single();
      if (result.error || !result.data) return jsonError(result.error?.message ?? "Cliente não atualizado.", 500);
      await safeRecordAudit(admin, session, {
        action: "chat_contact.updated",
        entity: "chat_contacts",
        entityId: result.data.id,
        entityLabel: result.data.name || result.data.phone,
        details: { company: result.data.company, phone: result.data.phone }
      });
      await safeRefreshSharePointBackup(admin);
      return NextResponse.json({ data: result.data });
    }

    if (action === "backupSharePoint") {
      if (!hasFullAccess(session.user.role)) return jsonError("Usuário sem permissão para atualizar backup no SharePoint.", 403);
      const backup = await safeRefreshSharePointBackup(admin);
      if ("error" in backup && backup.error) return jsonError(backup.error, 502);
      if ("skipped" in backup && backup.skipped) {
        const message = "message" in backup ? backup.message : "Backup do SharePoint não configurado.";
        return jsonError(message ?? "Backup do SharePoint não configurado.", 500);
      }
      await safeRecordAudit(admin, session, {
        action: "sharepoint.backup",
        entity: "machines",
        entityLabel: "Backup SharePoint",
        details: { item: "item" in backup ? backup.item : null }
      });
      return NextResponse.json({ ok: true, backup });
    }

    if (action === "resetClientSecretRotation") {
      if (!hasFullAccess(session.user.role)) return jsonError("Usuário sem permissão para atualizar alertas administrativos.", 403);
      const today = new Date().toISOString().slice(0, 10);
      const settingPayload = {
        key: "sharepoint_client_secret_rotation",
        value: {
          rotated_at: today,
          rotation_days: 180
        },
        updated_by: session.userId
      };
      const result = await admin
        .from("app_settings")
        .upsert(settingPayload, { onConflict: "key" })
        .select("key, value, updated_at")
        .single();
      if (result.error || !result.data) return jsonError(result.error?.message ?? "Alerta administrativo não atualizado.", 500);
      await safeRecordAudit(admin, session, {
        action: "security.client_secret_rotation_reset",
        entity: "app_settings",
        entityId: "sharepoint_client_secret_rotation",
        entityLabel: "CLIENT_SECRET SharePoint",
        details: settingPayload.value
      });
      return NextResponse.json({ data: result.data });
    }

    if (action === "saveTravel") {
      if (!canEditSchedule(session.user.role)) return jsonError("Usuário sem permissão para editar cronograma.", 403);
      const travelPayload = {
        start_date: text(payload.start_date) ?? "",
        end_date: text(payload.end_date) ?? "",
        code: upper(payload.code),
        client: text(payload.client),
        technicians: text(payload.technicians),
        status: text(payload.status),
        reason: text(payload.reason)
      };
      const editingId = id(payload.id);
      const result = editingId
        ? await admin.from("travel_schedules").update(travelPayload).eq("id", editingId).select().single()
        : await admin.from("travel_schedules").insert({ ...travelPayload, created_by: session.userId }).select().single();
      if (result.error || !result.data) return jsonError(result.error?.message ?? "Cronograma não salvo.", 500);
      await safeRecordAudit(admin, session, {
        action: editingId ? "travel.updated" : "travel.created",
        entity: "travel_schedules",
        entityId: result.data.id,
        entityLabel: travelPayload.code ?? travelPayload.client,
        details: {
          client: travelPayload.client,
          status: travelPayload.status,
          start_date: travelPayload.start_date,
          end_date: travelPayload.end_date
        }
      });
      await safeRefreshSharePointBackup(admin);
      return NextResponse.json({ data: result.data });
    }

    if (action === "saveContract") {
      if (!canManageContracts(session.user.role)) return jsonError("Usuário sem permissão para editar contratos.", 403);
      const status = text(payload.status) ?? "Ativo";
      const contractPayload = {
        machine_id: id(payload.machine_id),
        code: upper(payload.code),
        client: text(payload.client),
        serial: upper(payload.serial),
        contract_type: text(payload.contract_type),
        status,
        active: status === "Ativo",
        support_contract_until: text(payload.support_contract_until)
      };
      const editingId = id(payload.id);
      const result = editingId
        ? await admin.from("support_contracts").update(contractPayload).eq("id", editingId).select().single()
        : await admin.from("support_contracts").insert({ ...contractPayload, created_by: session.userId }).select().single();
      if (result.error || !result.data) return jsonError(result.error?.message ?? "Contrato não salvo.", 500);
      await safeRecordAudit(admin, session, {
        action: editingId ? "contract.updated" : "contract.created",
        entity: "support_contracts",
        entityId: result.data.id,
        entityLabel: contractPayload.code ?? contractPayload.serial ?? contractPayload.client,
        details: {
          client: contractPayload.client,
          status: contractPayload.status,
          contract_type: contractPayload.contract_type,
          support_contract_until: contractPayload.support_contract_until
        }
      });
      await safeRefreshSharePointBackup(admin);
      return NextResponse.json({ data: result.data });
    }

    if (action === "saveService") {
      if (!canEmitReports(session.user.role)) return jsonError("Usuário sem permissão para emitir relatórios.", 403);
      const editingId = id(payload.id);
      if (editingId) {
        const { data: existing } = await admin.from("service_records").select("created_by").eq("id", editingId).maybeSingle();
        if (existing?.created_by !== session.userId) {
          return jsonError("Este atendimento só pode ser alterado pelo usuário que lançou o registro.", 403);
        }
      }
      const servicePayload = {
        machine_id: id(payload.machine_id),
        technician_id: null,
        technician_name: session.user.name,
        technician_email: session.email,
        technician_role: session.user.role,
        technician_phone: text(session.user.phone),
        support_technicians: serviceTechnicians(payload.support_technicians),
        service_type: text(payload.service_type),
        service_date: text(payload.service_date),
        service_start: text(payload.service_start),
        service_end: text(payload.service_end),
        equipment: text(payload.equipment),
        issue_summary: text(payload.issue_summary),
        request: text(payload.request) ?? "",
        diagnosis: text(payload.diagnosis) ?? "",
        service_done: text(payload.service_done) ?? "",
        observations: text(payload.observations),
        customer_name: text(payload.customer_name),
        customer_signature: text(payload.customer_signature),
        attachments: serviceAttachments(payload.attachments),
        report_status: text(payload.report_status) === "Finalizado" ? "Finalizado" : "Rascunho",
        report_recipients: serviceRecipients(payload.report_recipients)
      };
      if (!servicePayload.machine_id || !servicePayload.service_date) return jsonError("Máquina e data são obrigatórias.");
      const result = editingId
        ? await admin.from("service_records").update(servicePayload).eq("id", editingId).select().single()
        : await admin.from("service_records").insert({ ...servicePayload, created_by: session.userId }).select().single();
      if (result.error || !result.data) return jsonError(result.error?.message ?? "Atendimento não salvo.", 500);
      await safeRecordAudit(admin, session, {
        action: editingId ? "service.updated" : "service.created",
        entity: "service_records",
        entityId: result.data.id,
        entityLabel: servicePayload.issue_summary ?? servicePayload.equipment ?? servicePayload.service_date,
        details: {
          machine_id: servicePayload.machine_id,
          service_date: servicePayload.service_date,
          service_type: servicePayload.service_type,
          issue_summary: servicePayload.issue_summary,
          report_status: servicePayload.report_status,
          support_technicians: servicePayload.support_technicians.map((technician) => technician.name)
        }
      });
      return NextResponse.json({ data: result.data });
    }

    if (action === "finalizeService") {
      if (!canEmitReports(session.user.role)) return jsonError("Usuário sem permissão para finalizar relatórios.", 403);
      const recordId = id(payload.id);
      if (!recordId) return jsonError("Atendimento não informado.");

      const { data: existing } = await admin.from("service_records").select("created_by").eq("id", recordId).maybeSingle();
      if (existing?.created_by !== session.userId) {
        return jsonError("Este atendimento só pode ser finalizado pelo usuário que lançou o registro.", 403);
      }

      const result = await admin
        .from("service_records")
        .update({ report_status: "Finalizado" })
        .eq("id", recordId)
        .select()
        .single();

      if (result.error || !result.data) return jsonError(result.error?.message ?? "Atendimento não finalizado.", 500);
      await safeRecordAudit(admin, session, {
        action: "service.finalized",
        entity: "service_records",
        entityId: result.data.id,
        entityLabel: result.data.issue_summary ?? result.data.equipment ?? result.data.service_date,
        details: {
          machine_id: result.data.machine_id,
          service_date: result.data.service_date,
          service_type: result.data.service_type
        }
      });
      return NextResponse.json({ data: result.data });
    }

    if (action === "syncServiceReportSharePoint") {
      if (!canEmitReports(session.user.role)) return jsonError("Usuário sem permissão para atualizar o espelho do relatório.", 403);
      const mode = text(payload.mode);
      const filename = text(payload.filename);
      if (!filename) return jsonError("Arquivo do relatório não informado.");

      if (mode === "upload") {
        const pdfBase64 = text(payload.pdfBase64);
        if (!pdfBase64) return jsonError("PDF do relatório não informado.");
        const sharePoint = await uploadServiceReportToSharePoint({
          machineCode: text(payload.machineCode),
          filename,
          pdfBase64
        });
        await safeRecordAudit(admin, session, {
          action: "sharepoint.report.uploaded",
          entity: "service_records",
          entityId: id(payload.recordId),
          entityLabel: filename,
          details: { machine_code: text(payload.machineCode), filename }
        });
        return NextResponse.json({ data: sharePoint });
      }

      if (mode === "archive") {
        const recordId = id(payload.recordId);
        if (recordId) {
          const { data: existing } = await admin.from("service_records").select("created_by").eq("id", recordId).maybeSingle();
          if (existing && !hasFullAccess(session.user.role) && existing.created_by !== session.userId) {
            return jsonError("Este relatório só pode ser arquivado pelo autor ou por usuário com acesso total.", 403);
          }
        }
        const sharePoint = await archiveServiceReportInSharePoint({
          machineCode: text(payload.machineCode),
          filename
        });
        await safeRecordAudit(admin, session, {
          action: "sharepoint.report.archived",
          entity: "service_records",
          entityId: recordId,
          entityLabel: filename,
          details: { machine_code: text(payload.machineCode), filename }
        });
        return NextResponse.json({ data: sharePoint });
      }

      return jsonError("Ação do SharePoint não reconhecida.");
    }

    if (action === "delete") {
      const table = String(payload.table ?? "");
      const rowId = id(payload.id);
      if (!rowId) return jsonError("Registro não informado.");
      const allowedTables = new Set(["machines", "authorized_users", "chat_contacts", "travel_schedules", "support_contracts", "service_records"]);
      if (!allowedTables.has(table)) return jsonError("Tabela não permitida.", 403);

      if (table === "machines" && !canEditMachine(session.user.role)) return jsonError("Usuário sem permissão para excluir máquinas.", 403);
      if (table === "authorized_users" && !canManageUsers(session.user.role)) return jsonError("Usuário sem permissão para excluir usuários.", 403);
      if (table === "chat_contacts" && !canUseRemoteAccess(session.user)) return jsonError("Usuário sem permissão para excluir clientes.", 403);
      if (table === "travel_schedules" && !canEditSchedule(session.user.role)) return jsonError("Usuário sem permissão para excluir cronograma.", 403);
      if (table === "support_contracts" && !canManageContracts(session.user.role)) return jsonError("Usuário sem permissão para excluir contratos.", 403);
      if (table === "service_records") {
        const { data: existing } = await admin.from("service_records").select("created_by").eq("id", rowId).maybeSingle();
        if (!hasFullAccess(session.user.role) && (!canEmitReports(session.user.role) || existing?.created_by !== session.userId)) {
          return jsonError("Este atendimento só pode ser excluído pelo autor ou por usuário com acesso total.", 403);
        }
      }

      const result = await admin.from(table).delete().eq("id", rowId);
      if (result.error) return jsonError(result.error.message, 500);
      await safeRecordAudit(admin, session, {
        action: `${table}.deleted`,
        entity: table,
        entityId: rowId,
        entityLabel: rowId,
        details: { table }
      });
      if (["machines", "authorized_users", "chat_contacts", "travel_schedules", "support_contracts"].includes(table)) {
        await safeRefreshSharePointBackup(admin);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "assignChat") {
      if (!canUseRemoteAccess(session.user)) return jsonError("Usuário sem permissão para Acesso Remoto.", 403);
      const conversationId = id(payload.conversationId);
      const targetEmail = String(payload.userEmail ?? session.email).trim().toLowerCase();
      if (!conversationId || !targetEmail) return jsonError("Conversa ou usuário não informado.");
      const { data: target } = await admin
        .from("authorized_users")
        .select("id, name, email, role, remote_access_allowed")
        .eq("email", targetEmail)
        .maybeSingle();
      if (!target || !canUseRemoteAccess(target)) return jsonError("Usuário de destino não autorizado.", 403);
      const now = new Date().toISOString();
      const update = await admin
        .from("chat_conversations")
        .update({
          status: "assigned",
          assigned_to: targetEmail === session.email ? session.userId : null,
          assigned_to_email: targetEmail,
          assigned_to_name: target.name || target.email,
          updated_at: now
        })
        .eq("id", conversationId);
      if (update.error) return jsonError(update.error.message, 500);
      await admin.from("chat_messages").insert({
        conversation_id: conversationId,
        direction: "system",
        body: `Conversa atribuída para ${target.name || target.email}.`,
        sender_email: session.email,
        sender_name: session.user.name,
        created_by: session.userId
      });
      await safeRecordAudit(admin, session, {
        action: "chat.assigned",
        entity: "chat_conversations",
        entityId: conversationId,
        entityLabel: target.email,
        details: {
          assigned_to_email: target.email,
          assigned_to_name: target.name
        }
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "closeChat") {
      if (!canUseRemoteAccess(session.user)) return jsonError("Usuário sem permissão para Acesso Remoto.", 403);
      const conversationId = id(payload.conversationId);
      if (!conversationId) return jsonError("Conversa não informada.");
      const now = new Date().toISOString();
      const update = await admin
        .from("chat_conversations")
        .update({
          status: "closed",
          closed_by: session.userId,
          closed_at: now,
          updated_at: now
        })
        .eq("id", conversationId);
      if (update.error) return jsonError(update.error.message, 500);
      await admin.from("chat_messages").insert({
        conversation_id: conversationId,
        direction: "system",
        body: "Conversa encerrada.",
        sender_email: session.email,
        sender_name: session.user.name,
        created_by: session.userId
      });
      await safeRecordAudit(admin, session, {
        action: "chat.closed",
        entity: "chat_conversations",
        entityId: conversationId,
        entityLabel: conversationId,
        details: { closed_at: now }
      });
      return NextResponse.json({ ok: true });
    }

    return jsonError("Ação não reconhecida.", 404);
  } catch (error) {
    return authErrorResponse(error);
  }
}
