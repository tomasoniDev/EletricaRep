import { NextResponse } from "next/server";
import {
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

type ActionBody = {
  action?: string;
  payload?: Record<string, unknown>;
};

function text(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
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

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
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

      return NextResponse.json({ data: result.data });
    }

    if (action === "saveUser") {
      if (!canManageUsers(session.user.role)) return jsonError("Usuário sem permissão para gerenciar usuários.", 403);
      const email = String(payload.email ?? "").trim().toLowerCase();
      if (!isCorporateEmail(email)) return jsonError("Cadastre apenas e-mails corporativos da Tomasoni.");
      const userPayload = {
        name: text(payload.name),
        email,
        role: text(payload.role) ?? "Montagem",
        phone: String(payload.phone ?? "").replace(/\D/g, ""),
        remote_access_allowed: bool(payload.remote_access_allowed),
        credential_access_allowed: bool(payload.credential_access_allowed)
      };
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
        technician_phone: text(session.user.phone),
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
        customer_signature: text(payload.customer_signature)
      };
      if (!servicePayload.machine_id || !servicePayload.service_date) return jsonError("Máquina e data são obrigatórias.");
      const result = editingId
        ? await admin.from("service_records").update(servicePayload).eq("id", editingId).select().single()
        : await admin.from("service_records").insert({ ...servicePayload, created_by: session.userId }).select().single();
      if (result.error || !result.data) return jsonError(result.error?.message ?? "Atendimento não salvo.", 500);
      return NextResponse.json({ data: result.data });
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
        if (!hasFullAccess(session.user.role) && existing?.created_by !== session.userId) {
          return jsonError("Este atendimento só pode ser excluído pelo autor ou por usuário com acesso total.", 403);
        }
      }

      const result = await admin.from(table).delete().eq("id", rowId);
      if (result.error) return jsonError(result.error.message, 500);
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
      return NextResponse.json({ ok: true });
    }

    return jsonError("Ação não reconhecida.", 404);
  } catch (error) {
    return authErrorResponse(error);
  }
}
