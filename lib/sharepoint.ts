import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Machine } from "@/lib/types";

type GraphSite = {
  id: string;
};

type GraphDrive = {
  id: string;
  name: string;
};

type GraphDriveItem = {
  id: string;
  name: string;
  webUrl?: string;
};

type OperationalBackupData = {
  machines: Record<string, unknown>[];
};

const graphBaseUrl = "https://graph.microsoft.com/v1.0";
const tenantId = process.env.MS_GRAPH_TENANT_ID;
const clientId = process.env.MS_GRAPH_CLIENT_ID;
const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
const sharePointSiteUrl = process.env.SHAREPOINT_SITE_URL;
const sharePointDriveName = process.env.SHAREPOINT_DRIVE_NAME ?? "Máquinas";
const sharePointBasePath = normalizeSharePointPath(process.env.SHAREPOINT_BASE_PATH ?? "");

export function isSharePointConfigured() {
  return Boolean(tenantId && clientId && clientSecret && sharePointSiteUrl);
}

export function sharePointConfigurationError() {
  if (isSharePointConfigured()) return "";
  return "Configuração do SharePoint incompleta. Verifique MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET e SHAREPOINT_SITE_URL.";
}

function normalizeSharePointPath(value: string) {
  return value
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

function safePathSegment(value: string | null | undefined, fallback: string) {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|#%{}~&]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .slice(0, 90);
  return cleaned || fallback;
}

function encodePath(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function graphRequest<T>(path: string, init: RequestInit = {}) {
  const token = await getGraphAccessToken();
  const response = await fetch(`${graphBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body instanceof Buffer ? {} : { "Content-Type": "application/json" }),
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Microsoft Graph retornou ${response.status}. ${detail}`);
  }

  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

async function getGraphAccessToken() {
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(sharePointConfigurationError());
  }

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials"
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Falha ao autenticar no Microsoft Graph. ${detail}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Microsoft Graph não retornou token de acesso.");
  return data.access_token;
}

async function getSharePointSite() {
  if (!sharePointSiteUrl) throw new Error(sharePointConfigurationError());
  const url = new URL(sharePointSiteUrl);
  const sitePath = url.pathname.replace(/\/$/, "");
  return graphRequest<GraphSite>(`/sites/${url.hostname}:${sitePath}`);
}

async function getSharePointDrive(siteId: string) {
  if (!sharePointDriveName.trim()) {
    return graphRequest<GraphDrive>(`/sites/${siteId}/drive`);
  }

  const data = await graphRequest<{ value?: GraphDrive[] }>(`/sites/${siteId}/drives`);
  const normalizedTarget = sharePointDriveName.trim().toLowerCase();
  const drive = data.value?.find((item) => item.name.trim().toLowerCase() === normalizedTarget);
  if (!drive) {
    throw new Error(`Biblioteca do SharePoint não encontrada: ${sharePointDriveName}.`);
  }

  return drive;
}

async function ensureFolder(driveId: string, folderPath: string) {
  const parts = normalizeSharePointPath(folderPath).split("/").filter(Boolean);
  let currentPath = "";

  for (const part of parts) {
    const parentPath = currentPath;
    currentPath = normalizeSharePointPath(`${currentPath}/${part}`);
    const parentEndpoint = parentPath
      ? `/drives/${driveId}/root:/${encodePath(parentPath)}:/children`
      : `/drives/${driveId}/root/children`;

    try {
      await graphRequest<GraphDriveItem>(parentEndpoint, {
        method: "POST",
        body: JSON.stringify({
          name: part,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail"
        })
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("nameAlreadyExists") && !message.includes("409")) {
        throw error;
      }
    }
  }
}

async function uploadFile(folderPath: string, filename: string, content: Buffer, contentType: string) {
  const site = await getSharePointSite();
  const drive = await getSharePointDrive(site.id);
  const normalizedFolder = normalizeSharePointPath(folderPath);
  await ensureFolder(drive.id, normalizedFolder);
  const filePath = encodePath(`${normalizedFolder}/${safePathSegment(filename, "arquivo")}`);
  const body = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as BodyInit;
  return graphRequest<GraphDriveItem>(`/drives/${drive.id}/root:/${filePath}:/content`, {
    method: "PUT",
    body,
    headers: { "Content-Type": contentType }
  });
}

function htmlCell(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const machineBackupColumns = [
  ["code", "Código"],
  ["model", "Modelo"],
  ["description", "Descrição"],
  ["client", "Cliente"],
  ["unit_city", "Localização"],
  ["serial", "Número de série"],
  ["mechanical_list", "Lista mecânica"],
  ["manufacture_month", "Fabricação"],
  ["software_version", "Software"],
  ["software_code", "Código do software"],
  ["vm", "VM"],
  ["ip_range", "Faixa de IP"],
  ["remote_access", "Acesso remoto"],
  ["access_method", "Forma de acesso"],
  ["vnc_ip", "IP de acesso VNC"],
  ["vnc_user", "Usuário VNC"],
  ["vnc_notes", "Observações VNC"],
  ["sinema_url", "Endereço SINEMA"],
  ["sinema_user", "Usuário SINEMA"],
  ["sinema_notes", "Observações SINEMA"],
  ["created_at", "Criado em"],
  ["updated_at", "Atualizado em"]
] as const;

function tableHtml(
  title: string,
  rows: Record<string, unknown>[],
  columns: readonly (readonly [string, string])[]
) {
  return `
    <h2>${htmlCell(title)}</h2>
    <table>
      <thead><tr>${columns.map(([, label]) => `<th>${htmlCell(label)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.map((row) => `<tr>${columns.map(([key]) => `<td>${htmlCell(row[key])}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

function createOperationalBackupWorkbook(data: OperationalBackupData) {
  const generatedAt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; }
    h1 { color: #0b63ce; }
    h2 { margin-top: 28px; color: #0b63ce; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
    th { background: #eef4ff; font-weight: 700; }
  </style>
</head>
<body>
  <h1>Backup Hub Tomasoni</h1>
  <p>Gerado em ${htmlCell(generatedAt)}</p>
  ${tableHtml("Máquinas cadastradas", data.machines, machineBackupColumns)}
</body>
</html>`;

  return Buffer.from(`\ufeff${html}`, "utf8");
}

async function loadOperationalBackupData(admin: SupabaseClient): Promise<OperationalBackupData> {
  const machinesResult = await admin
    .from("machines")
    .select("code, model, description, client, unit_city, serial, mechanical_list, manufacture_month, software_version, software_code, vm, ip_range, remote_access, access_method, vnc_ip, vnc_user, vnc_notes, sinema_url, sinema_user, sinema_notes, created_at, updated_at")
    .order("code", { ascending: true });

  if (machinesResult.error) {
    throw new Error(machinesResult.error.message);
  }

  return {
    machines: (machinesResult.data ?? []) as Record<string, unknown>[]
  };
}

export async function backupOperationalDataToSharePoint(admin: SupabaseClient) {
  if (!isSharePointConfigured()) {
    return { skipped: true, message: sharePointConfigurationError() };
  }

  const data = await loadOperationalBackupData(admin);
  const workbook = createOperationalBackupWorkbook(data);
  const uploaded = await uploadFile(
    `${sharePointBasePath}/Backup`,
    "backup-cadastros-hub-tomasoni.xls",
    workbook,
    "application/vnd.ms-excel; charset=utf-8"
  );

  return { skipped: false, item: uploaded };
}

export async function uploadServiceReportToSharePoint(options: {
  machineCode?: string | null;
  filename: string;
  pdfBase64: string;
}) {
  if (!isSharePointConfigured()) {
    return { skipped: true, message: sharePointConfigurationError() };
  }

  const machineFolder = safePathSegment(options.machineCode, "maquina-sem-codigo");
  const uploaded = await uploadFile(
    `${sharePointBasePath}/Relatórios/${machineFolder}`,
    options.filename,
    Buffer.from(options.pdfBase64, "base64"),
    "application/pdf"
  );

  return { skipped: false, item: uploaded };
}

export async function safeBackupOperationalDataToSharePoint(admin: SupabaseClient) {
  try {
    return await backupOperationalDataToSharePoint(admin);
  } catch (error) {
    return {
      skipped: false,
      error: error instanceof Error ? error.message : "Falha desconhecida ao atualizar backup no SharePoint."
    };
  }
}

export function machineSharePointCode(machine: Pick<Machine, "code" | "id"> | null | undefined) {
  return safePathSegment(machine?.code, machine?.id ?? "maquina-sem-codigo");
}
