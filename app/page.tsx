"use client";

import { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { downloadServicePdf, servicePdfBase64, servicePdfFileName, servicePdfPreviewUrl } from "@/lib/pdf";
import type { AppAdminInfo, AppAuditLog, AuthorizedUser, ChatContact, ChatConversation, ChatMessage, Machine, ServiceAttachment, ServiceRecord, ServiceTechnician, SupportContract, TravelSchedule, UserRole } from "@/lib/types";

type View = "home" | "overview" | "admin" | "machineDetail" | "service" | "registry" | "schedule" | "chat";
type RegistryTab = "machines" | "users" | "clients";
type ScheduleTab = "travel" | "contracts";
type SortDirection = "asc" | "desc";
type MachineSortKey = "code" | "model" | "client" | "unit_city" | "serial" | "software_version" | "manufacture_month" | "vm" | "last_service";
type HistorySortKey = "service_date" | "equipment" | "technician_name" | "issue_summary";
type UserSortKey = "name" | "email" | "role";
type TravelSortKey = "start_date" | "end_date" | "code" | "client" | "technicians" | "status" | "reason" | "updated_at";
type RemoteAccess = "SINEMA" | "VNC" | "Sem acesso remoto";
type ServiceType = "Acesso remoto" | "Visita técnica";
type ThemeMode = "light" | "dark";
type ContractType = "Seg-Sex" | "Seg-Sab" | "Garantia";
type ContractStatus = "Ativo" | "Inativo" | "Em negociação";
type ActionMenuPosition = { top: number; right: number };
type RemoteAccessStatus = "Online" | "Offline" | "Ocupado";
type OnlineTechnician = { email: string; name: string; role?: string | null; status?: RemoteAccessStatus; onlineAt?: string };
type ServicePreviewState = { machineId: string; record: ServiceRecord; recipients: string[]; pdfUrl: string; finalizeOnSend?: boolean };
type AppSessionPayload = {
  session?: { userId: string; email: string; expiresAt?: number } | null;
  user?: AuthorizedUser | null;
};
type AppDataPayload = AppSessionPayload & {
  machines?: Machine[];
  authorizedUsers?: AuthorizedUser[];
  travelSchedules?: TravelSchedule[];
  supportContracts?: SupportContract[];
  chatContacts?: ChatContact[];
  chatConversations?: ChatConversation[];
  adminInfo?: AppAdminInfo | null;
  error?: string;
};
type LeafletLayerTarget = LeafletMap | LeafletLayerGroup;
type LeafletMap = {
  fitBounds: (bounds: [number, number][], options?: Record<string, unknown>) => LeafletMap;
  getZoom: () => number;
  hasLayer: (layer: LeafletLayerGroup) => boolean;
  addLayer: (layer: LeafletLayerGroup) => LeafletMap;
  removeLayer: (layer: LeafletLayerGroup) => LeafletMap;
  on: (event: string, handler: () => void) => LeafletMap;
  off: (event: string, handler: () => void) => LeafletMap;
  invalidateSize: () => LeafletMap;
  remove: () => void;
  setView: (center: [number, number], zoom: number) => LeafletMap;
};
type LeafletLayerGroup = {
  addTo: (map: LeafletMap) => LeafletLayerGroup;
  clearLayers: () => LeafletLayerGroup;
};
type LeafletMarker = {
  addTo: (target: LeafletLayerTarget) => LeafletMarker;
  bindPopup: (content: string) => LeafletMarker;
};
type LeafletTileLayer = {
  addTo: (map: LeafletMap) => LeafletTileLayer;
  on: (event: string, handler: () => void) => LeafletTileLayer;
  remove: () => void;
};
type LeafletNamespace = {
  map: (element: HTMLElement, options?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, options?: Record<string, unknown>) => LeafletTileLayer;
  layerGroup: () => LeafletLayerGroup;
  circleMarker: (center: [number, number], options?: Record<string, unknown>) => LeafletMarker;
};

type MachineFormState = {
  code: string;
  mechanical_list: string;
  software_code: string;
  ip_range: string;
  vm: string;
  serial: string;
  description: string;
  model: string;
  client: string;
  unit_city: string;
  manufacture_month: string;
  software_version: string;
  remote_access: RemoteAccess;
  vnc_ip: string;
  vnc_user: string;
  vnc_password: string;
  vnc_vm_password: string;
  vnc_notes: string;
  sinema_url: string;
  sinema_user: string;
  sinema_password: string;
  sinema_notes: string;
};

type AuthorizedUserFormState = {
  name: string;
  email: string;
  role: UserRole;
  phone: string;
  remote_access_allowed: boolean;
  credential_access_allowed: boolean;
};

type ChatContactFormState = {
  name: string;
  company: string;
  phone: string;
};

type TravelScheduleFormState = {
  start_date: string;
  end_date: string;
  code: string;
  client: string;
  technicians: string;
  status: string;
  reason: string;
};

type SupportContractFormState = {
  machine_id: string;
  code: string;
  client: string;
  serial: string;
  contract_type: string;
  support_contract_until: string;
  status: ContractStatus;
};

const ALLOWED_EMAIL_DOMAINS = ["tomasoni.ind.br", "tomasoni.in.br"];
const DEFAULT_MESSAGE = "Consulte uma máquina pelo código ou selecione uma linha da tabela.";
const GENERIC_AUTH_MESSAGE = "Não foi possível iniciar o acesso. Verifique o e-mail corporativo e tente novamente.";
const AUTH_CONFIRMED_AT_KEY = "tomasoni-servicecore-auth-confirmed-at";
const AUTH_CONFIRMATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const BIOMETRIC_EMAIL_KEY = "tomasoni-servicecore-biometric-email";
const BIOMETRIC_CREDENTIAL_KEY = "tomasoni-servicecore-biometric-credential";
const BIOMETRIC_PROMPT_DISMISSED_KEY = "tomasoni-servicecore-biometric-dismissed";
const BIOMETRIC_SESSION_VERIFIED_KEY = "tomasoni-servicecore-biometric-session-verified";
const THEME_KEY = "tomasoni-servicecore-theme";
const REMOTE_ACCESS_STATUS_KEY = "tomasoni-servicecore-remote-access-status";
const SERVICE_EMAIL_SUGGESTIONS_KEY = "tomasoni-servicecore-service-email-suggestions";
const PWA_SW_RELOAD_KEY = "tomasoni-servicecore-sw-reload";
const MAX_SERVICE_ATTACHMENTS = 6;
const REMOTE_ACCESS_OPTIONS: RemoteAccess[] = ["Sem acesso remoto", "SINEMA", "VNC"];
const SERVICE_TYPE_OPTIONS: ServiceType[] = ["Acesso remoto", "Visita técnica"];
const CONTRACT_TYPE_OPTIONS: ContractType[] = ["Seg-Sex", "Seg-Sab", "Garantia"];
const CONTRACT_STATUS_OPTIONS: ContractStatus[] = ["Ativo", "Em negociação", "Inativo"];
const SOFTWARE_OPTIONS = [
  ...Array.from({ length: 9 }, (_, index) => `TIA Portal V${index + 13}`),
  ...Array.from({ length: 5 }, (_, index) => `Scout 4.${index + 4}`)
];
const VM_OPTIONS = Array.from({ length: 9 }, (_, index) => `V${index + 13}`);
const USER_ROLE_OPTIONS: UserRole[] = ["Admin", "Diretoria", "Coordenador", "Engenharia", "Montagem Elétrica", "Montagem Mecânica", "Controladoria", "Comercial"];
const TRAVEL_STATUS_OPTIONS = ["A definir", "Planejado", "Em andamento", "Concluido", "Cancelado"];
const TRAVEL_CODE_PATTERN = /^C\d{3}$/;
const STATE_CENTERS: Record<string, [number, number]> = {
  AC: [-9.0238, -70.812],
  AL: [-9.5713, -36.782],
  AP: [1.3545, -51.916],
  AM: [-3.4168, -65.856],
  BA: [-12.5797, -41.7007],
  CE: [-5.4984, -39.3206],
  DF: [-15.7998, -47.8645],
  ES: [-19.1834, -40.3089],
  GO: [-15.827, -49.8362],
  MA: [-5.42, -45.44],
  MT: [-12.6819, -56.9211],
  MS: [-20.7722, -54.7852],
  MG: [-18.5122, -44.555],
  PA: [-3.79, -52.48],
  PB: [-7.24, -36.78],
  PR: [-24.89, -51.55],
  PE: [-8.38, -37.86],
  PI: [-6.6, -42.28],
  RJ: [-22.25, -42.66],
  RN: [-5.81, -36.59],
  RS: [-30.17, -53.5],
  RO: [-10.83, -63.34],
  RR: [2.05, -61.39],
  SC: [-27.33, -50.48],
  SP: [-22.19, -48.79],
  SE: [-10.57, -37.45],
  TO: [-10.25, -48.25]
};

function mapPointPosition(center: [number, number]) {
  const [lat, lon] = center;
  const left = Math.min(92, Math.max(8, ((lon + 74) / 40) * 100));
  const top = Math.min(92, Math.max(8, ((6 - lat) / 40) * 100));
  return { left: `${left}%`, top: `${top}%` };
}
const EMPTY_MACHINE_FORM: MachineFormState = {
  code: "",
  mechanical_list: "",
  software_code: "",
  ip_range: "",
  vm: "",
  serial: "",
  description: "",
  model: "",
  client: "",
  unit_city: "",
  manufacture_month: "",
  software_version: "",
  remote_access: "Sem acesso remoto",
  vnc_ip: "",
  vnc_user: "",
  vnc_password: "",
  vnc_vm_password: "",
  vnc_notes: "",
  sinema_url: "",
  sinema_user: "",
  sinema_password: "",
  sinema_notes: ""
};
const EMPTY_USER_FORM: AuthorizedUserFormState = {
  name: "",
  email: "",
  role: "Montagem Elétrica",
  phone: "",
  remote_access_allowed: false,
  credential_access_allowed: false
};
const EMPTY_CHAT_CONTACT_FORM: ChatContactFormState = {
  name: "",
  company: "",
  phone: ""
};
const EMPTY_TRAVEL_FORM: TravelScheduleFormState = {
  start_date: "",
  end_date: "",
  code: "",
  client: "",
  technicians: "",
  status: "A definir",
  reason: ""
};
const EMPTY_CONTRACT_FORM: SupportContractFormState = {
  machine_id: "",
  code: "",
  client: "",
  serial: "",
  contract_type: "",
  support_contract_until: "",
  status: "Ativo"
};
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

async function apiRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(data?.error ?? "Não foi possível concluir a operação.");
  }
  return data as T;
}

async function appAction<T>(action: string, payload: Record<string, unknown> = {}) {
  return apiRequest<{ data?: T; ok?: boolean; backup?: unknown }>("/api/app-action", {
    method: "POST",
    body: JSON.stringify({ action, payload })
  });
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatPhone(value?: string | null) {
  const digits = onlyDigits(String(value ?? "")).slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatFullDateInput(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function formatDayMonthInput(value: string) {
  const digits = onlyDigits(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function formatTravelClientCodeInput(value: string) {
  const digits = onlyDigits(value).slice(0, 3);
  if (!digits && !value.trim()) return "";
  return `C${digits}`;
}

function formatServiceDateTimeInput(value: string) {
  const digits = onlyDigits(value).slice(0, 10);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  if (digits.length <= 6) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 6)} - ${digits.slice(6)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 6)} - ${digits.slice(6, 8)}:${digits.slice(8)}`;
}

function formatMonthYearInput(value: string) {
  const digits = onlyDigits(value).slice(0, 6);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function normalizeFullDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return trimmed;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function extractDateFromServiceDateTime(value: string) {
  const normalized = value.trim();
  const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})(?:\s*-\s*\d{2}:\d{2})?$/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2]}-${match[1]}`;
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const today = new Date();
  const target = new Date(`${value}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function formatMonthYear(value?: string | null) {
  if (!value) return "-";
  const [year, month] = value.split("-");
  const shortMatch = value.match(/^(\d{2})\/(\d{2})$/);
  if (shortMatch) return `${shortMatch[1]}/20${shortMatch[2]}`;
  if (/^\d{2}\/\d{4}$/.test(value)) return value;
  if (!year || !month) return value;
  return `${month}/${year}`;
}

function monthYearSortValue(value?: string | null) {
  const formatted = formatMonthYear(value);
  const match = formatted.match(/^(\d{2})\/(\d{4})$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[2]) * 100 + Number(match[1]);
}

function normalizeMonthYear(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const shortMatch = trimmed.match(/^(\d{2})\/(\d{2})$/);
  if (shortMatch) return `${shortMatch[1]}/20${shortMatch[2]}`;
  const match = trimmed.match(/^(\d{2})\/(\d{4})$/);
  if (!match) return trimmed;
  return `${match[1]}/${match[2]}`;
}

function machineHasRemoteAccess(remoteAccess: string) {
  return remoteAccess !== "Sem acesso remoto";
}

function normalizeRemoteAccess(value?: string | null): RemoteAccess {
  if (value === "SINEMA" || value === "VNC") return value;
  return "Sem acesso remoto";
}

function normalizeServiceType(value?: string | null): ServiceType {
  if (value === "Visita técnica") return "Visita técnica";
  return "Acesso remoto";
}

function displayMachineCode(machine?: Pick<Machine, "code" | "model" | "client"> | null) {
  return machine?.code?.trim() || machine?.model?.trim() || machine?.client?.trim() || "Máquina sem código";
}

function normalizeLookup(value?: string | null) {
  return value?.trim().toUpperCase() ?? "";
}

function serviceMachineLookupLabel(machine?: Machine | null) {
  if (!machine) return "";
  const code = displayMachineCode(machine);
  const details = [machine.client, machine.model]
    .map((item) => item?.trim())
    .filter(Boolean)
    .join(" - ");
  return details ? `${code} - ${details}` : code;
}

function serviceTechnicianLookupLabel(user: AuthorizedUser) {
  const details = [user.email, user.role].filter(Boolean).join(" - ");
  return details ? `${user.name} - ${details}` : user.name;
}

function isAssemblyRole(role?: string | null) {
  return String(role ?? "").trim().toLowerCase().startsWith("montagem");
}

function normalizeLookupText(value?: string | null) {
  return value?.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() ?? "";
}

function findMachineByLookup(machines: Machine[], value: string) {
  const target = normalizeLookupText(value);
  if (!target) return null;

  return machines.find((machine) => {
    const candidates = [
      machine.id,
      machine.code,
      displayMachineCode(machine),
      serviceMachineLookupLabel(machine),
      machine.code && machine.client ? `${machine.code} - ${machine.client}` : "",
      machine.code && machine.model ? `${machine.code} - ${machine.model}` : ""
    ];
    return candidates.some((candidate) => normalizeLookupText(candidate) === target);
  }) ?? null;
}

function parseServiceTechnicianInput(value: string, users: AuthorizedUser[]) {
  const seen = new Set<string>();
  return value
    .split(/[;,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item): ServiceTechnician => {
      const normalized = normalizeLookupText(item);
      const user = users.find((candidate) => {
        const candidates = [candidate.name, candidate.email, serviceTechnicianLookupLabel(candidate)];
        return candidates.some((candidateValue) => normalizeLookupText(candidateValue) === normalized);
      });
      if (user) return { id: user.id, name: user.name, email: user.email, role: user.role };
      return { name: item, email: null, role: null };
    })
    .filter((technician) => {
      const key = normalizeLookupText(technician.email || technician.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function formatServiceTechniciansInput(technicians?: ServiceTechnician[] | null) {
  return (technicians ?? []).map((technician) => technician.name).filter(Boolean).join("; ");
}

function serviceRecordWithTechnicianRole(record: ServiceRecord, users: AuthorizedUser[]) {
  if (record.technician_role) return record;
  const technicianEmail = normalizeLookupText(record.technician_email);
  if (!technicianEmail) return record;
  const technician = users.find((user) => normalizeLookupText(user.email) === technicianEmail);
  return technician?.role ? { ...record, technician_role: technician.role } : record;
}

function contractMatchesMachine(contract: SupportContract, machine: Machine) {
  const contractSerial = normalizeLookup(contract.serial);
  const machineSerial = normalizeLookup(machine.serial);
  if (contractSerial && machineSerial && contractSerial === machineSerial) return true;
  if (contract.machine_id && contract.machine_id === machine.id) return true;
  const contractCode = normalizeLookup(contract.code);
  const machineCode = normalizeLookup(machine.code);
  return Boolean(contractCode && machineCode && contractCode === machineCode);
}

function contractStatus(contract?: SupportContract | null): ContractStatus {
  if (!contract) return "Inativo";
  if (contract.status === "Ativo" || contract.status === "Inativo" || contract.status === "Em negociação") {
    return contract.status;
  }
  return contract.active ? "Ativo" : "Inativo";
}

function isActiveContract(contract?: SupportContract | null) {
  return contractStatus(contract) === "Ativo";
}

function isNegotiatingContract(contract?: SupportContract | null) {
  return contractStatus(contract) === "Em negociação";
}

function sortContractsByRelevance(a: SupportContract, b: SupportContract) {
  const statusWeight: Record<ContractStatus, number> = { "Ativo": 3, "Em negociação": 2, "Inativo": 1 };
  const statusDiff = statusWeight[contractStatus(b)] - statusWeight[contractStatus(a)];
  if (statusDiff) return statusDiff;
  return compareDate(b.support_contract_until, a.support_contract_until);
}

function latestContractForMachine(contracts: SupportContract[], machine?: Machine | null) {
  if (!machine) return undefined;
  return contracts.filter((contract) => contractMatchesMachine(contract, machine)).sort(sortContractsByRelevance)[0];
}

function machineFormFromMachine(machine?: Machine | null): MachineFormState {
  if (!machine) return EMPTY_MACHINE_FORM;
  return {
    code: machine.code ?? "",
    mechanical_list: machine.mechanical_list ?? "",
    software_code: machine.software_code ?? "",
    ip_range: machine.ip_range ?? "",
    vm: machine.vm ?? "",
    serial: machine.serial ?? "",
    description: (machine.description ?? "").slice(0, 160),
    model: machine.model ?? "",
    client: machine.client ?? "",
    unit_city: machine.unit_city ?? "",
    manufacture_month: formatMonthYear(machine.manufacture_month) === "-" ? "" : formatMonthYear(machine.manufacture_month),
    software_version: machine.software_version ?? "",
    remote_access: normalizeRemoteAccess(machine.remote_access ?? machine.access_method),
    vnc_ip: machine.vnc_ip ?? "",
    vnc_user: machine.vnc_user ?? "",
    vnc_password: machine.vnc_password ?? "",
    vnc_vm_password: machine.vnc_vm_password ?? "",
    vnc_notes: machine.vnc_notes ?? "",
    sinema_url: machine.sinema_url ?? "",
    sinema_user: machine.sinema_user ?? "",
    sinema_password: machine.sinema_password ?? "",
    sinema_notes: machine.sinema_notes ?? ""
  };
}

function parseEmails(value: string) {
  return value
    .split(/[;,\n]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function serviceReportStatus(record: ServiceRecord) {
  return record.report_status === "Rascunho" ? "Rascunho" : "Finalizado";
}

function isServiceDraft(record: ServiceRecord) {
  return serviceReportStatus(record) === "Rascunho";
}

function finalizedServiceRecords(machine?: Machine | null) {
  return (machine?.service_records ?? []).filter((record) => !isServiceDraft(record));
}

function lastServiceDate(machine: Machine) {
  const dates = finalizedServiceRecords(machine).map((record) => record.service_date).filter(Boolean);
  return dates.sort().at(-1) ?? "";
}

function daysSince(value?: string | null) {
  if (!value) return null;
  const target = new Date(`${value}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - target.getTime()) / 86400000);
}

function monthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-");
  return `${month}/${year.slice(-2)}`;
}

function addMonths(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(1);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function locationState(value?: string | null) {
  const text = value?.trim();
  if (!text) return "Sem localização";
  const match = text.match(/(?:-|\/)\s*([A-Za-z]{2})\s*$/);
  return match ? match[1].toUpperCase() : "Sem UF";
}

function locationCity(value?: string | null) {
  const text = value?.trim();
  if (!text) return "";
  const match = text.match(/^(.+?)(?:\s*[-/]\s*)[A-Za-z]{2}\s*$/);
  return (match?.[1] ?? text).trim();
}

function percent(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function compareText(first?: string | null, second?: string | null) {
  return (first ?? "").localeCompare(second ?? "", "pt-BR", { numeric: true, sensitivity: "base" });
}

function compareDate(first?: string | null, second?: string | null) {
  return (first ?? "").localeCompare(second ?? "");
}

function normalizeStatus(value?: string | null) {
  return value?.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() ?? "";
}

function isCompletedTravel(item: TravelSchedule) {
  return normalizeStatus(item.status) === "concluido";
}

function dayMonthOrderValue(value?: string | null, fallback = Number.MAX_SAFE_INTEGER) {
  const normalized = value?.trim() ?? "";
  const match = normalized.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return fallback;
  return Number(match[2]) * 100 + Number(match[1]);
}

function compareTravelValue(first: TravelSchedule, second: TravelSchedule, key: TravelSortKey) {
  if (key === "start_date" || key === "end_date") {
    return dayMonthOrderValue(first[key]) - dayMonthOrderValue(second[key]);
  }
  if (key === "updated_at") {
    return compareDate(first.updated_at || first.created_at, second.updated_at || second.created_at);
  }
  return compareText(String(first[key] ?? ""), String(second[key] ?? ""));
}

function compareTravelBySort(first: TravelSchedule, second: TravelSchedule, sort: { key: TravelSortKey; direction: SortDirection }) {
  const result = compareTravelValue(first, second, sort.key);
  return sort.direction === "asc" ? result : -result;
}

function nextDirection(isSameColumn: boolean, currentDirection: SortDirection) {
  return isSameColumn && currentDirection === "asc" ? "desc" : "asc";
}

function sortMark(isActive: boolean, direction: SortDirection) {
  if (!isActive) return "↕";
  return direction === "asc" ? "↑" : "↓";
}

function isCorporateEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`));
}

function hasFreshAuthConfirmation() {
  const confirmedAt = Number(window.localStorage.getItem(AUTH_CONFIRMED_AT_KEY) ?? 0);
  return Boolean(confirmedAt) && Date.now() - confirmedAt < AUTH_CONFIRMATION_INTERVAL_MS;
}

function storeAuthConfirmation() {
  window.localStorage.setItem(AUTH_CONFIRMED_AT_KEY, String(Date.now()));
}

function clearAuthConfirmation() {
  window.localStorage.removeItem(AUTH_CONFIRMED_AT_KEY);
}

function bufferToBase64Url(buffer: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBuffer(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function canUseWebAuthn() {
  return typeof window !== "undefined" && Boolean(window.PublicKeyCredential && navigator.credentials);
}

function isMobileAuthDevice() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 760px), ((pointer: coarse) and (max-width: 1024px))").matches;
}

function hasBiometricEnabledFor(email: string) {
  return Boolean(
    email
    && window.localStorage.getItem(BIOMETRIC_EMAIL_KEY) === email
    && window.localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY)
    && canUseWebAuthn()
  );
}

function hasBiometricVerifiedThisOpen(email: string) {
  return window.sessionStorage.getItem(BIOMETRIC_SESSION_VERIFIED_KEY) === email;
}

function storeBiometricVerifiedThisOpen(email: string) {
  window.sessionStorage.setItem(BIOMETRIC_SESSION_VERIFIED_KEY, email);
}

function clearBiometricVerifiedThisOpen() {
  window.sessionStorage.removeItem(BIOMETRIC_SESSION_VERIFIED_KEY);
}

function hasFullAccess(role?: UserRole | null) {
  return role === "Admin" || role === "Diretoria";
}

function canManageUsers(role?: UserRole | null) {
  return hasFullAccess(role) || role === "Coordenador";
}

function canEditMachine(role?: UserRole | null) {
  return hasFullAccess(role) || role === "Engenharia" || role === "Coordenador";
}

function canManageContracts(role?: UserRole | null) {
  return hasFullAccess(role);
}

function canEmitReports(role?: UserRole | null) {
  return hasFullAccess(role)
    || role === "Coordenador"
    || role === "Engenharia"
    || role === "Montagem"
    || role === "Montagem Elétrica"
    || role === "Montagem Mecânica";
}

function canEditSchedule(role?: UserRole | null) {
  return hasFullAccess(role);
}

function validateCodePattern(value: string, pattern: RegExp, label: string) {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return "";
  return pattern.test(normalized) ? "" : `${label} deve estar no padrão esperado ou ficar vazio.`;
}

function validateDayMonth(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "a definir") return "";
  const match = normalized.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return `${label} deve estar no formato dd/mm.`;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return `${label} possui mês inválido.`;
  const maxDay = new Date(2024, month, 0).getDate();
  if (day < 1 || day > maxDay) return `${label} possui dia inválido para o mês informado.`;
  return "";
}

function validateServiceDateTime(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) return "";
  if (/^\d{2}\/\d{2}$/.test(normalized)) return validateDayMonth(normalized, label);
  const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})(?:\s*-\s*(\d{2}):(\d{2}))?$/);
  if (!match) return `${label} deve estar no formato dd/mm/aa ou dd/mm/aa - hh:mm.`;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3].length === 2 ? Number(`20${match[3]}`) : Number(match[3]);
  const hour = match[4] ? Number(match[4]) : null;
  const minute = match[5] ? Number(match[5]) : null;
  if (month < 1 || month > 12) return `${label} possui mês inválido.`;
  if (year < 2000 || year > 2099) return `${label} possui ano inválido.`;
  const maxDay = new Date(year, month, 0).getDate();
  if (day < 1 || day > maxDay) return `${label} possui dia inválido para o mês informado.`;
  if (hour !== null && (hour < 0 || hour > 23)) return `${label} possui hora inválida.`;
  if (minute !== null && (minute < 0 || minute > 59)) return `${label} possui minuto inválido.`;
  return "";
}

function validateFullDate(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) return "";
  const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return `${label} deve estar no formato dd/mm/aaaa.`;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12) return `${label} possui mês inválido.`;
  if (year < 1900 || year > 2099) return `${label} possui ano inválido.`;
  const maxDay = new Date(year, month, 0).getDate();
  if (day < 1 || day > maxDay) return `${label} possui dia inválido para o mês informado.`;
  return "";
}

function validateMonthYear(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) return "";
  const match = normalized.match(/^(\d{2})\/(\d{4})$/);
  if (!match) return `${label} deve estar no formato mm/aaaa.`;
  const month = Number(match[1]);
  if (month < 1 || month > 12) return `${label} possui mês inválido.`;
  return "";
}

function isValidIpv4Octet(value: string) {
  if (!/^\d{1,3}$/.test(value)) return false;
  const number = Number(value);
  return number >= 0 && number <= 255;
}

function validateIpv4Like(value: string, label: string, options: { allowWildcard?: boolean; allowPort?: boolean } = {}) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  const [address, suffix] = normalized.split(/[/:]/);
  const separatorMatch = normalized.match(/[/:]/);
  if (suffix && (!options.allowPort || !/^\d{1,5}$/.test(suffix) || Number(suffix) < 1 || Number(suffix) > 65535)) {
    return `${label} possui porta inválida.`;
  }
  if (!suffix && separatorMatch) return `${label} possui formato de IP inválido.`;
  const octets = address.split(".");
  if (octets.length !== 4) return `${label} deve estar no formato IPv4, como 189.1.87.xxx ou 189.1.87.200.`;
  const valid = octets.every((octet, index) => {
    if (options.allowWildcard && index >= 2 && (/^x{1,3}$/.test(octet) || octet === "*")) return true;
    return isValidIpv4Octet(octet);
  });
  return valid ? "" : `${label} possui IPv4 inválido.`;
}

let leafletLoadPromise: Promise<LeafletNamespace> | null = null;

function loadLeaflet() {
  if (typeof window === "undefined") return Promise.reject(new Error("Mapa indisponível fora do navegador."));
  const existingLeaflet = (window as unknown as { L?: LeafletNamespace }).L;
  if (existingLeaflet) return Promise.resolve(existingLeaflet);

  if (!leafletLoadPromise) {
    leafletLoadPromise = import("leaflet").then((module) => {
      const leaflet = (module.default ?? module) as unknown as LeafletNamespace;
      (window as unknown as { L?: LeafletNamespace }).L = leaflet;
      return leaflet;
    });
  }

  return leafletLoadPromise;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[character] ?? character));
}

async function geocodeCity(city: string, state: string) {
  if (!city || !STATE_CENTERS[state]) return null;
  const cacheKey = `tomasoni-map-city:${city.toLowerCase()}-${state.toLowerCase()}`;
  const cached = window.localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as [number, number];
      if (Array.isArray(parsed) && parsed.length === 2) return parsed;
    } catch {
      window.localStorage.removeItem(cacheKey);
    }
  }

  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(`${city}, ${state}, Brasil`)}`);
  if (!response.ok) return null;
  const result = await response.json() as Array<{ lat?: string; lon?: string }>;
  const first = result[0];
  if (!first?.lat || !first?.lon) return null;
  const point: [number, number] = [Number(first.lat), Number(first.lon)];
  if (Number.isNaN(point[0]) || Number.isNaN(point[1])) return null;
  window.localStorage.setItem(cacheKey, JSON.stringify(point));
  return point;
}

function describeAuthError(error: unknown) {
  if (!error) return "erro não informado pelo Supabase.";
  if (typeof error === "string") return error || "erro não informado pelo Supabase.";
  if (error instanceof Error) {
    return [error.name, error.message].filter(Boolean).join(": ") || "erro não informado pelo Supabase.";
  }

  try {
    const entries = Object.entries(error as Record<string, unknown>)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
    return entries.length ? entries.join(" | ") : JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function authMessage(error: unknown) {
  const detail = describeAuthError(error);
  const normalized = detail.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "Código inválido ou expirado.";
  if (normalized.includes("failed to fetch") || normalized.includes("network")) return "Falha de conexão. Verifique a internet e tente novamente.";
  if (normalized.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (normalized.includes("user already registered")) return "Usuário já cadastrado.";
  if (normalized.includes("signup is disabled")) return "O cadastro de novos usuários está desativado no Supabase.";
  if (normalized.includes("rate limit") || normalized.includes("over_email_send_rate_limit") || normalized.includes("too many requests")) return "Limite temporário de envio de e-mails atingido. Aguarde alguns minutos e tente novamente.";
  if (normalized.includes("smtp") || normalized.includes("email provider") || normalized.includes("send email")) return `Falha no envio do e-mail pelo provedor SMTP. Detalhe: ${detail}`;
  if (normalized.includes("for security purposes")) return "Aguarde alguns segundos antes de solicitar um novo envio.";
  if (normalized.includes("otp") || normalized.includes("token")) return "Código inválido ou expirado. Solicite um novo código e tente novamente.";
  return `Não foi possível concluir a autenticação. Detalhe: ${detail}`;
}

function dataMessage(error: string) {
  const normalized = error.toLowerCase();
  if (normalized.includes("status") && normalized.includes("schema cache")) return "A coluna de status dos contratos ainda não foi reconhecida pela API do Supabase. Aplique a migration 022_refresh_support_contract_status_schema.sql e tente novamente.";
  if (normalized.includes("support_contracts") || normalized.includes("relation") || normalized.includes("schema cache")) return "Estrutura de contratos não encontrada no Supabase. Aplique as migrations 020_support_contracts_permissions.sql, 021_add_support_contract_status.sql e 022_refresh_support_contract_status_schema.sql e tente novamente.";
  if (normalized.includes("support_contracts_status_check")) return "Status de contrato inválido no banco. Aplique a migration 022_refresh_support_contract_status_schema.sql e tente novamente.";
  if (normalized.includes("duplicate") || normalized.includes("unique")) return "Já existe um cadastro com estes dados.";
  if (normalized.includes("permission") || normalized.includes("row-level security")) return "Seu usuário não tem permissão para executar esta ação.";
  if (normalized.includes("network") || normalized.includes("fetch")) return "Falha de conexão. Verifique a internet e tente novamente.";
  return "Não foi possível concluir a operação. Revise os dados e tente novamente.";
}

function screenLegend(view: View, registryTab: RegistryTab, selectedMachine?: Machine) {
  if (view === "home") return "Consulte uma máquina pelo código ou selecione uma linha da tabela.";
  if (view === "overview") return "Visão geral da base instalada, contratos, acessos e atendimentos registrados.";
  if (view === "admin") return "Monitore atualizações, deploys, migrations e ações registradas no sistema.";
  if (view === "chat") return "Acesso Remoto: receba, assuma, transfira e encerre conversas.";
  if (view === "machineDetail") return selectedMachine ? `Dados cadastrais e histórico da máquina ${displayMachineCode(selectedMachine)}.` : "Dados cadastrais e histórico da máquina.";
  if (view === "service") return "Registre um novo atendimento técnico e gere o relatório em PDF.";
  if (view === "schedule") return "Acompanhe o cronograma de viagens e atendimentos planejados.";
  if (registryTab === "machines") return "Cadastre, altere ou exclua máquinas e informações de acesso.";
  if (registryTab === "clients") return "Consulte e ajuste clientes identificados pelo Acesso Remoto.";
  return "Cadastre e gerencie os usuários autorizados a acessar o sistema.";
}

function helpText(view: View, registryTab: RegistryTab) {
  if (view === "home") return "Use o filtro para localizar uma máquina por código, modelo, cliente ou localização. Clique no código da máquina para abrir os dados cadastrais e o histórico de atendimentos.";
  if (view === "overview") return "A visão geral consolida indicadores da base cadastrada, contratos, acesso remoto, localização e volume de atendimentos. Use os rankings para localizar máquinas, clientes e regiões que merecem atenção.";
  if (view === "admin") return "A tela administrativa concentra informações técnicas do app e a trilha de auditoria das operações feitas pelos usuários. O acesso fica restrito aos perfis Admin e Diretoria.";
  if (view === "chat") return "Use a tela de Acesso Remoto para validar atendimentos recebidos pelo WhatsApp. Conversas podem ser assumidas por usuários Online, transferidas e encerradas com histórico salvo.";
  if (view === "machineDetail") return "Nesta tela ficam os dados técnicos da máquina, informações de acesso remoto e histórico. Clique em um atendimento para ver o registro completo ou use o menu de ações para baixar o PDF.";
  if (view === "service") return "Registre o atendimento com tipo, motivo breve e descrições completas. Em visita técnica, colete a assinatura do cliente para incluir no PDF.";
  if (view === "schedule") return "Use o cronograma para planejar viagens, técnicos envolvidos, cliente, código, status e motivo. Datas podem ser dd/mm ou A definir.";
  if (registryTab === "machines") return "Cadastre ou altere máquinas e informações de acesso. Use o menu de ações da tabela para editar ou excluir cadastros.";
  if (registryTab === "clients") return "Use esta lista para corrigir nome, empresa e telefone dos contatos que abriram chamados pelo Acesso Remoto.";
  return "Cadastre usuários autorizados. O perfil define permissões de cadastro, cronograma, contratos, histórico e relatórios.";
}

function helpSections(view: View, registryTab: RegistryTab) {
  if (view === "overview") {
    return [
      ["KPIs superiores", "Resumo rápido da base: máquinas cadastradas, atendimentos do mês, contratos, cobertura remota e máquinas que pedem atenção."],
      ["Tendência de atendimentos", "Mostra o volume mensal dos últimos meses para perceber aumento ou queda na demanda."],
      ["Acesso remoto", "Distribui a base entre SINEMA, VNC e máquinas sem acesso remoto cadastrado."],
      ["Contratos", "Resume contratos ativos, vencidos e a vencer, separando também o tipo de contrato quando informado."],
      ["Modelos", "Mostra quais modelos concentram mais máquinas cadastradas."],
      ["Softwares por VM", "Conta códigos de software únicos por VM. Se duas máquinas usam o mesmo código de software, ele entra uma única vez naquela VM."],
      ["Geolocalização", "No zoom inicial o mapa agrupa por estado. Ao aproximar, o mapa tenta posicionar as máquinas pela cidade cadastrada."],
      ["Clientes", "Clientes com mais máquinas indica base instalada. Clientes mais atendidos indica volume de chamados registrados."],
      ["Rankings inferiores", "Ajudam a localizar máquinas com mais atendimentos, máquinas há muito tempo sem registro e os últimos atendimentos lançados."]
    ];
  }

  if (view === "registry" && registryTab === "machines") {
    return [
      ["Código", "Número do projeto da máquina ou referência principal usada pela equipe."],
      ["Modelo e descrição", "Informe o tipo da máquina no modelo e detalhe a configuração no campo descrição."],
      ["Cliente e localização", "Informe a empresa e a cidade com UF, preferencialmente no formato Cidade - UF."],
      ["Mecânica", "Lista mecânica ou referência do projeto mecânico."],
      ["Código do software", "Número do software da máquina. Ele é usado nos indicadores por VM."],
      ["VM", "Nome ou identificação da VM onde o software está alocado."],
      ["Faixa de IP", "Faixa reservada pela engenharia no padrão IPv4, como 189.1.87.xxx."],
      ["Fabricação", "Mês e ano no formato mm/aaaa."],
      ["Software", "Selecione a versão padronizada de TIA Portal ou Scout."],
      ["Acesso remoto", "Escolha SINEMA, VNC ou sem acesso remoto. Os campos adicionais aparecem conforme a opção."],
      ["Contrato", "Preencha somente quando houver contrato ativo ou informação de vigência relevante."]
    ];
  }

  if (view === "service") {
    return [
      ["Máquina e equipamento", "Selecione a máquina atendida e indique o equipamento ou área afetada."],
      ["Tipo de atendimento", "Use acesso remoto para suporte remoto e visita técnica quando houver atendimento presencial."],
      ["E-mails para envio", "Informe os destinatários separados por ponto e vírgula. Esses e-mails não entram no PDF."],
      ["Motivo breve", "Resumo curto que aparece nas tabelas, por exemplo: Falha no acionamento X."],
      ["Campos descritivos", "Registre solicitação, diagnóstico, serviço realizado e observações com o máximo de clareza."],
      ["Assinatura", "Em visita técnica, o campo de assinatura entra no relatório em PDF."]
    ];
  }

  if (view === "machineDetail") {
    return [
      ["Card principal", "Mostra os dados cadastrais mais importantes da máquina."],
      ["Software", "Concentra software, código do software, VM, faixa de IP e último atendimento."],
      ["Acesso remoto", "Mostra informações de SINEMA ou VNC cadastradas para consulta rápida."],
      ["Histórico", "Clique em um atendimento para abrir o popup com o registro completo e baixar o PDF."],
      ["Ações rápidas", "Permite registrar novo atendimento, alterar cadastro ou baixar o último PDF."]
    ];
  }

  if (view === "home") {
    return [
      ["Filtro", "Use para buscar por código, modelo, cliente, localização, VM, software ou acesso remoto."],
      ["Tabela", "Clique no código da máquina para abrir seus dados cadastrais e histórico."],
      ["Ordenação", "Clique nos cabeçalhos para ordenar a lista conforme a coluna escolhida."]
    ];
  }

  if (view === "schedule") {
    return [
      ["Datas", "Informe início e fim no formato dd/mm ou escreva A definir quando a agenda ainda não estiver fechada."],
      ["Código e cliente", "Use o código da máquina ou projeto quando existir e selecione/digite o cliente atendido."],
      ["Técnicos", "Liste os técnicos envolvidos. O campo aceita mais de um nome e aparece completo na tabela."],
      ["Status", "Atualize o andamento da viagem para facilitar o acompanhamento operacional."],
      ["Motivo", "Descreva o objetivo da viagem ou atendimento planejado com o nível de detalhe necessário."]
    ];
  }

  if (view === "admin") {
    return [
      ["Deploy", "Mostra ambiente, URL, commit, autor e data da leitura informados pela Vercel."],
      ["Migrations", "Lista as migrations mais recentes versionadas no repositório para facilitar conferência com o Supabase."],
      ["Auditoria", "Mostra as últimas ações gravadas no sistema: criação, edição, exclusão, relatórios, contratos, cronograma e Acesso Remoto."],
      ["Permissões", "Esta tela é restrita aos perfis Admin e Diretoria."]
    ];
  }

  if (view === "chat") {
    return [
      ["Fila de conversas", "Lista mensagens recebidas pelo WhatsApp. Conversas abertas ainda não foram assumidas; atribuídas têm um técnico responsável; encerradas ficam no histórico."],
      ["Status do usuário", "O status fica no cartão inferior do perfil: Online recebe transferências, Ocupado responde apenas conversas já atribuídas e Offline apenas visualiza."],
      ["Assumir e transferir", "Um usuário Online pode assumir conversa sem responsável. Para transferir, escolha um usuário Online na janela de transferência."],
      ["Responder", "As respostas são gravadas no histórico. Quando as credenciais oficiais da Meta estiverem configuradas, também serão enviadas ao WhatsApp."],
      ["Encerrar", "Use ao finalizar o chamado para arquivar a conversa e manter o histórico consultável."]
    ];
  }

  if (view === "registry" && registryTab === "clients") {
    return [
      ["Origem dos clientes", "A lista é formada automaticamente pelos contatos que enviam mensagens ao WhatsApp do Acesso Remoto."],
      ["Edição manual", "Use quando o cliente responder de forma incompleta ou confusa às mensagens automáticas."],
      ["Máquinas", "Código de máquina e número de série continuam ligados ao chamado, não ao cadastro fixo do cliente."],
      ["Exclusão", "Remove o cadastro do cliente, mas não apaga as conversas já registradas no histórico."]
    ];
  }

  return [
    ["Usuário", "Cadastre o nome que será exibido no sistema e associado aos registros feitos por essa conta."],
    ["E-mail", "Informe o e-mail corporativo autorizado. Apenas e-mails cadastrados conseguem validar o acesso ao app."],
    ["Perfil / setor", "Escolha o perfil correto para liberar apenas as telas e ações compatíveis com o setor do usuário."],
    ["Acesso Remoto", "Marque esta permissão para liberar a tela de Acesso Remoto e o status de plantão no perfil inferior."],
    ["Permissões", "Admin e Diretoria têm acesso total, incluindo Cronograma e Contratos. Coordenador segue as permissões de Engenharia e também pode cadastrar usuários. Montagem Elétrica e Montagem Mecânica podem emitir relatórios. Controladoria e Comercial ficam em consulta, sem edição ou emissão."],
    ["Ações", "Use o menu de ações da tabela para editar dados do usuário ou remover acessos que não devem mais entrar no sistema."]
  ];
}

function displayUserName(value: string) {
  const localPart = value.trim().split("@")[0];
  return localPart ? localPart.replace(/\./g, " ") : "Usuário";
}

function initialsFromEmail(value: string) {
  const parts = displayUserName(value).split(/\s+/).filter(Boolean);
  if (!parts.length) return "US";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    "machine.created": "Máquina cadastrada",
    "machine.updated": "Máquina alterada",
    "authorized_users.deleted": "Usuário excluído",
    "user.created": "Usuário cadastrado",
    "user.updated": "Usuário alterado",
    "profile.updated": "Perfil alterado",
    "chat_contact.updated": "Cliente do acesso remoto alterado",
    "chat_contacts.deleted": "Cliente do acesso remoto excluído",
    "travel.created": "Viagem cadastrada",
    "travel.updated": "Viagem alterada",
    "travel_schedules.deleted": "Viagem excluída",
    "contract.created": "Contrato cadastrado",
    "contract.updated": "Contrato alterado",
    "support_contracts.deleted": "Contrato excluído",
    "service.created": "Atendimento registrado",
    "service.updated": "Atendimento alterado",
    "service_records.deleted": "Atendimento excluído",
    "machines.deleted": "Máquina excluída",
    "chat.assigned": "Conversa atribuída",
    "chat.closed": "Conversa encerrada"
  };
  return labels[action] ?? action;
}

function auditEntityLabel(entity?: string | null) {
  const labels: Record<string, string> = {
    machines: "Máquinas",
    authorized_users: "Usuários",
    chat_contacts: "Clientes",
    travel_schedules: "Cronograma",
    support_contracts: "Contratos",
    service_records: "Relatórios",
    chat_conversations: "Acesso Remoto"
  };
  return entity ? labels[entity] ?? entity : "-";
}

function auditDetailsSummary(log: AppAuditLog) {
  const details = log.details ?? {};
  const keys = ["code", "client", "model", "status", "service_type", "issue_summary", "contract_type", "assigned_to_name", "email"];
  const summary = keys
    .map((key) => {
      const value = details[key];
      return typeof value === "string" && value.trim() ? value.trim() : "";
    })
    .filter(Boolean)
    .slice(0, 3)
    .join(" · ");
  return summary || log.entity_label || "-";
}

function formatLongDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function shortCommit(value?: string | null) {
  return value ? value.slice(0, 7) : "-";
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function chatStatusLabel(status: ChatConversation["status"]) {
  if (status === "closed") return "Encerrada";
  if (status === "assigned") return "Em atendimento";
  return "Aberta";
}

function chatMediaLabel(message: ChatMessage) {
  if (message.message_type === "image") return "Abrir imagem";
  if (message.message_type === "video") return "Abrir vídeo";
  if (message.message_type === "audio") return "Abrir áudio";
  if (message.message_type === "document") return message.media_filename ? `Abrir ${message.media_filename}` : "Abrir documento";
  return "Abrir mídia";
}

function remoteAccessStatusClass(status: RemoteAccessStatus) {
  if (status === "Online") return "online";
  if (status === "Ocupado") return "busy";
  return "offline";
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h4" />
      <path d="m9 14 2 2 4-5" />
    </svg>
  );
}

function PdfDownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h4" />
      <path d="M12 10v6" />
      <path d="M9.5 13.5 12 16l2.5-2.5" />
      <path d="M9 19h6" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.6 2.6 0 0 1 5 1.2c0 1.8-2.5 2.1-2.5 4" />
      <path d="M12 18h.01" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M20 15.5A8.3 8.3 0 0 1 8.5 4 8.7 8.7 0 1 0 20 15.5z" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M21 3v18" />
    </svg>
  );
}

function DetailIcon({ type }: { type: "client" | "location" | "serial" | "calendar" | "mechanical" | "software" | "remote" | "info" | "history" | "check" | "alert" | "mail" | "detail" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {type === "client" && <><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="7" r="4" /></>}
      {type === "location" && <><path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.4" /></>}
      {type === "serial" && <><path d="M20 10 14 4 4 14l6 6 10-10Z" /><path d="m7.5 13.5 3 3" /></>}
      {type === "calendar" && <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>}
      {type === "mechanical" && <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></>}
      {type === "software" && <><rect x="4" y="5" width="16" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></>}
      {type === "remote" && <><path d="M5 13a10 10 0 0 1 14 0" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M12 20h.01" /></>}
      {type === "info" && <><circle cx="12" cy="12" r="9" /><path d="M12 10v6M12 7h.01" /></>}
      {type === "history" && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
      {type === "check" && <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.6 2.6L16.5 9" /></>}
      {type === "alert" && <><circle cx="12" cy="12" r="9" /><path d="M8 8l8 8M16 8l-8 8" /></>}
      {type === "mail" && <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>}
      {type === "detail" && <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>}
    </svg>
  );
}

export default function Home() {
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overviewMapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [currentUserName, setCurrentUserName] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [biometricPromptOpen, setBiometricPromptOpen] = useState(false);
  const [biometricRequired, setBiometricRequired] = useState(false);
  const [isMobileAuthDeviceState, setIsMobileAuthDeviceState] = useState(() => isMobileAuthDevice());
  const [view, setView] = useState<View>("home");
  const [registryTab, setRegistryTab] = useState<RegistryTab>("machines");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [authorizedUsers, setAuthorizedUsers] = useState<AuthorizedUser[]>([]);
  const [travelSchedules, setTravelSchedules] = useState<TravelSchedule[]>([]);
  const [supportContracts, setSupportContracts] = useState<SupportContract[]>([]);
  const [chatConversations, setChatConversations] = useState<ChatConversation[]>([]);
  const [chatContacts, setChatContacts] = useState<ChatContact[]>([]);
  const [adminInfo, setAdminInfo] = useState<AppAdminInfo | null>(null);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [chatReply, setChatReply] = useState("");
  const [onlineTechnicians, setOnlineTechnicians] = useState<OnlineTechnician[]>([]);
  const [remoteAccessStatus, setRemoteAccessStatus] = useState<RemoteAccessStatus>("Offline");
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [currentUserRemoteAccessAllowed, setCurrentUserRemoteAccessAllowed] = useState(false);
  const [currentUserCredentialAccessAllowed, setCurrentUserCredentialAccessAllowed] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [machineFilter, setMachineFilter] = useState("");
  const [historyFilter, setHistoryFilter] = useState("");
  const [machineSort, setMachineSort] = useState<{ key: MachineSortKey; direction: SortDirection }>({ key: "last_service", direction: "desc" });
  const [historySort, setHistorySort] = useState<{ key: HistorySortKey; direction: SortDirection }>({ key: "service_date", direction: "desc" });
  const [userSort, setUserSort] = useState<{ key: UserSortKey; direction: SortDirection }>({ key: "name", direction: "asc" });
  const [editingMachineId, setEditingMachineId] = useState("");
  const [editingUserId, setEditingUserId] = useState("");
  const [userForm, setUserForm] = useState<AuthorizedUserFormState>(EMPTY_USER_FORM);
  const [editingContact, setEditingContact] = useState<ChatContact | null>(null);
  const [contactForm, setContactForm] = useState<ChatContactFormState>(EMPTY_CHAT_CONTACT_FORM);
  const [editingTravelId, setEditingTravelId] = useState("");
  const [travelForm, setTravelForm] = useState<TravelScheduleFormState>(EMPTY_TRAVEL_FORM);
  const [scheduleTab, setScheduleTab] = useState<ScheduleTab>("travel");
  const [editingContractId, setEditingContractId] = useState("");
  const [contractForm, setContractForm] = useState<SupportContractFormState>(EMPTY_CONTRACT_FORM);
  const [travelSort, setTravelSort] = useState<{ key: TravelSortKey; direction: SortDirection }>({ key: "start_date", direction: "asc" });
  const [completedTravelSort, setCompletedTravelSort] = useState<{ key: TravelSortKey; direction: SortDirection }>({ key: "updated_at", direction: "desc" });
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [selectedServiceRecord, setSelectedServiceRecord] = useState<ServiceRecord | null>(null);
  const [servicePreview, setServicePreview] = useState<ServicePreviewState | null>(null);
  const [servicePreviewSending, setServicePreviewSending] = useState(false);
  const [editingServiceRecord, setEditingServiceRecord] = useState<ServiceRecord | null>(null);
  const [editingPreviewRecipients, setEditingPreviewRecipients] = useState<string[] | null>(null);
  const [mapMode, setMapMode] = useState<"loading" | "leaflet" | "fallback">("loading");
  const [focusedMapState, setFocusedMapState] = useState("");
  const [machineForm, setMachineForm] = useState<MachineFormState>(EMPTY_MACHINE_FORM);
  const [serviceType, setServiceType] = useState<ServiceType>("Acesso remoto");
  const [serviceMachineLookupInput, setServiceMachineLookupInput] = useState("");
  const [serviceMachineTouched, setServiceMachineTouched] = useState(false);
  const [supportTechniciansInput, setSupportTechniciansInput] = useState("");
  const [serviceRecipientsInput, setServiceRecipientsInput] = useState("");
  const [serviceRecipientSuggestionsOpen, setServiceRecipientSuggestionsOpen] = useState(false);
  const [savedServiceEmails, setSavedServiceEmails] = useState<string[]>([]);
  const [customerSignature, setCustomerSignature] = useState("");
  const [serviceAttachments, setServiceAttachments] = useState<ServiceAttachment[]>([]);
  const [isSigning, setIsSigning] = useState(false);
  const [signatureExpanded, setSignatureExpanded] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [openActionMenu, setOpenActionMenu] = useState("");
  const [actionMenuPosition, setActionMenuPosition] = useState<ActionMenuPosition | null>(null);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    setTheme(storedTheme);
    document.documentElement.classList.toggle("dark", storedTheme === "dark");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(async () => {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller && !window.sessionStorage.getItem(PWA_SW_RELOAD_KEY)) {
          window.sessionStorage.setItem(PWA_SW_RELOAD_KEY, "1");
          window.location.reload();
        }
      })
      .catch((error) => {
        if (process.env.NODE_ENV !== "production") console.error("Erro ao registrar service worker", error);
      });
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px), ((pointer: coarse) and (max-width: 1024px))");
    const updateDeviceMode = () => setIsMobileAuthDeviceState(query.matches);
    updateDeviceMode();
    query.addEventListener("change", updateDeviceMode);
    return () => query.removeEventListener("change", updateDeviceMode);
  }, []);

  useEffect(() => {
    const authScreenOpen = sessionReady && (!isAuthenticated || biometricRequired);
    document.documentElement.classList.toggle("auth-screen-open", authScreenOpen);
    document.body.classList.toggle("auth-screen-open", authScreenOpen);
    return () => {
      document.documentElement.classList.remove("auth-screen-open");
      document.body.classList.remove("auth-screen-open");
    };
  }, [biometricRequired, isAuthenticated, sessionReady]);

  useEffect(() => {
    try {
      const storedEmails = JSON.parse(window.localStorage.getItem(SERVICE_EMAIL_SUGGESTIONS_KEY) ?? "[]");
      if (Array.isArray(storedEmails)) {
        setSavedServiceEmails(storedEmails.filter((email): email is string => typeof email === "string"));
      }
    } catch {
      setSavedServiceEmails([]);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (servicePreview?.pdfUrl) URL.revokeObjectURL(servicePreview.pdfUrl);
    };
  }, [servicePreview?.pdfUrl]);

  useEffect(() => {
    let cancelled = false;
    fetch("https://servicodados.ibge.gov.br/api/v1/localidades/municipios")
      .then((response) => response.ok ? response.json() : [])
      .then((rows: Array<{ nome?: string; microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } } }>) => {
        if (cancelled) return;
        const suggestions = rows
          .map((row) => {
            const city = row.nome?.trim();
            const state = row.microrregiao?.mesorregiao?.UF?.sigla?.trim();
            return city && state ? `${city} - ${state}` : "";
          })
          .filter(Boolean)
          .sort((a, b) => compareText(a, b));
        setCitySuggestions(suggestions);
      })
      .catch(() => setCitySuggestions([]));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    apiRequest<AppSessionPayload>("/api/auth/session")
      .then(async (payload) => {
        if (cancelled) return;
        setSessionReady(true);
        const session = payload.session;
        const user = payload.user;
        const userEmail = session?.email ?? "";

        if (!session || !user) {
          setIsAuthenticated(false);
          return;
        }

        if (!isCorporateEmail(userEmail)) {
          await signOut();
          setMessage("Acesso negado. Use um e-mail corporativo da Tomasoni.");
          return;
        }

        if (!hasFreshAuthConfirmation()) {
          await signOut();
          setMessage("Por segurança, confirme seu acesso novamente com o código enviado ao e-mail.");
          return;
        }

        applyAuthorizedSession(session.userId, userEmail, user);
        if (isMobileAuthDeviceState && hasBiometricEnabledFor(userEmail) && !hasBiometricVerifiedThisOpen(userEmail)) {
          setBiometricRequired(true);
          setIsAuthenticated(false);
          setMessage("Confirme sua biometria para abrir o app neste dispositivo.");
          return;
        }

        setIsAuthenticated(true);
        await loadData();
      })
      .catch(() => {
        if (cancelled) return;
        setSessionReady(true);
        setIsAuthenticated(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isMobileAuthDeviceState]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = window.setInterval(() => {
      if (hasFreshAuthConfirmation()) return;
      setMessage("Por segurança, confirme seu acesso novamente com o código enviado ao e-mail.");
      void signOut();
    }, 60 * 1000);

    return () => window.clearInterval(interval);
  }, [isAuthenticated]);

  useEffect(() => {
    setOpenActionMenu("");
    setActionMenuPosition(null);
    setUserMenuOpen(false);
  }, [view, registryTab]);

  useEffect(() => {
    document.body.classList.toggle("signature-mode-open", signatureExpanded);
    return () => document.body.classList.remove("signature-mode-open");
  }, [signatureExpanded]);

  useEffect(() => {
    function closeFloatingLayers(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (!target.closest(".user-menu")) setUserMenuOpen(false);
      if (!target.closest(".row-actions") && !target.closest(".row-menu")) {
        setOpenActionMenu("");
        setActionMenuPosition(null);
      }
    }

    document.addEventListener("mousedown", closeFloatingLayers);
    return () => document.removeEventListener("mousedown", closeFloatingLayers);
  }, []);

  const selectedMachine = machines.find((machine) => machine.id === selectedMachineId);
  const serviceMachine = selectedMachine ?? machines[0];
  const previewMachine = servicePreview ? machines.find((machine) => machine.id === servicePreview.machineId) : null;
  const activeServiceEmailToken = serviceRecipientsInput.split(/[;,\n]/).at(-1)?.trim().toLowerCase() ?? "";
  const serviceEmailSuggestions = activeServiceEmailToken.length >= 2
    ? savedServiceEmails
        .filter((email) => email.includes(activeServiceEmailToken) && !parseEmails(serviceRecipientsInput).map((item) => item.toLowerCase()).includes(email.toLowerCase()))
        .slice(0, 5)
    : [];
  const serviceMachineLookupInvalid = serviceMachineTouched && Boolean(serviceMachineLookupInput.trim()) && !findMachineByLookup(machines, serviceMachineLookupInput);
  const editingMachine = machines.find((machine) => machine.id === editingMachineId);
  const selectedChat = chatConversations.find((conversation) => conversation.id === selectedChatId) ?? chatConversations[0];
  const showRemoteAccess = machineHasRemoteAccess(machineForm.remote_access);
  const currentUserHasFullAccess = hasFullAccess(currentUserRole);
  const currentUserCanViewAdmin = currentUserHasFullAccess;
  const currentUserCanUseRemoteAccess = currentUserRole === "Admin" || currentUserRemoteAccessAllowed;
  const currentUserCanAccessCredentials = currentUserRole === "Admin" || currentUserCredentialAccessAllowed;
  const canDownloadBackup = currentUserRole === "Admin";
  const currentUserCanManageUsers = canManageUsers(currentUserRole);
  const currentUserCanEditMachine = canEditMachine(currentUserRole);
  const currentUserCanManageContracts = canManageContracts(currentUserRole);
  const currentUserCanEmitReports = canEmitReports(currentUserRole);
  const currentUserCanEditSchedule = canEditSchedule(currentUserRole);
  const adminDeployment = adminInfo?.deployment;
  const adminMigrations = adminInfo?.migrations ?? [];
  const adminAuditLogs = adminInfo?.auditLogs ?? [];
  const machineMainFieldsDisabled = !currentUserCanEditMachine;
  const selectedMachineAccess = normalizeRemoteAccess(selectedMachine?.remote_access ?? selectedMachine?.access_method);
  const selectedMachineContract = latestContractForMachine(supportContracts, selectedMachine);
  const selectedMachineContractStatus = contractStatus(selectedMachineContract);
  const selectedMachineHasContractInfo = selectedMachineContractStatus === "Ativo" || selectedMachineContractStatus === "Em negociação";
  const selectedMachineContractDays = daysUntil(selectedMachineContract?.support_contract_until);
  const selectedMachineDraftReports = [...(selectedMachine?.service_records ?? [])]
    .filter((record) => currentUserCanEmitReports && isServiceDraft(record) && record.created_by === currentUserId)
    .sort((a, b) => compareDate(b.updated_at, a.updated_at) || compareDate(b.service_date, a.service_date));
  const selectedMachineRecentHistory = finalizedServiceRecords(selectedMachine)
    .sort((a, b) => compareDate(b.service_date, a.service_date))
    .slice(0, 5);
  const openTravelSchedules = travelSchedules
    .filter((item) => !isCompletedTravel(item))
    .sort((a, b) => compareTravelBySort(a, b, travelSort) || compareText(a.client, b.client));
  const completedTravelSchedules = travelSchedules
    .filter(isCompletedTravel)
    .sort((a, b) => compareTravelBySort(a, b, completedTravelSort) || compareText(a.client, b.client));
  const selectedChatAssignedToCurrent = Boolean(selectedChat?.assigned_to_email && selectedChat.assigned_to_email.toLowerCase() === currentUserEmail.toLowerCase());
  const canReplySelectedChat = Boolean(
    selectedChat
    && selectedChat.status !== "closed"
    && currentUserCanUseRemoteAccess
    && (remoteAccessStatus === "Online" || (remoteAccessStatus === "Ocupado" && selectedChatAssignedToCurrent))
  );
  const canAssumeSelectedChat = Boolean(selectedChat && selectedChat.status !== "closed" && !selectedChat.assigned_to_email && currentUserCanUseRemoteAccess && remoteAccessStatus === "Online");
  const availableTransferUsers = onlineTechnicians.filter((user) => user.status === "Online" && user.email.toLowerCase() !== currentUserEmail.toLowerCase());
  const canTransferSelectedChat = Boolean(selectedChat && selectedChat.status !== "closed" && canReplySelectedChat && availableTransferUsers.length);

  useEffect(() => {
    if (!currentUserCanManageContracts && scheduleTab !== "travel") {
      setScheduleTab("travel");
    }
  }, [currentUserCanManageContracts, scheduleTab]);

  useEffect(() => {
    if (view === "schedule" && !currentUserCanEditSchedule) {
      setView("home");
    }
  }, [currentUserCanEditSchedule, view]);

  useEffect(() => {
    if (view !== "registry") return;
    if (registryTab === "machines" && !currentUserCanEditMachine) {
      setRegistryTab(currentUserCanUseRemoteAccess ? "clients" : "users");
    }
    if (registryTab === "clients" && !currentUserCanUseRemoteAccess) {
      setRegistryTab(currentUserCanEditMachine ? "machines" : "users");
    }
    if (registryTab === "users" && !currentUserCanManageUsers) {
      setRegistryTab(currentUserCanUseRemoteAccess ? "clients" : "machines");
    }
  }, [currentUserCanEditMachine, currentUserCanManageUsers, currentUserCanUseRemoteAccess, registryTab, view]);

  useEffect(() => {
    if (view === "chat" && !currentUserCanUseRemoteAccess) {
      setView("home");
    }
  }, [currentUserCanUseRemoteAccess, view]);

  useEffect(() => {
    if (view === "admin" && !currentUserCanViewAdmin) {
      setView("home");
    }
  }, [currentUserCanViewAdmin, view]);

  useEffect(() => {
    if (!isAuthenticated || !currentUserEmail || !currentUserCanUseRemoteAccess) {
      setRemoteAccessStatus("Offline");
      return;
    }

    const storedStatus = window.localStorage.getItem(`${REMOTE_ACCESS_STATUS_KEY}:${currentUserEmail.toLowerCase()}`) as RemoteAccessStatus | null;
    setRemoteAccessStatus(storedStatus === "Online" || storedStatus === "Ocupado" ? storedStatus : "Offline");
  }, [currentUserCanUseRemoteAccess, currentUserEmail, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = window.setInterval(() => {
      void loadData();
    }, view === "chat" ? 15000 : 45000);

    return () => window.clearInterval(interval);
  }, [isAuthenticated, view]);

  useEffect(() => {
    if (!isAuthenticated || !currentUserCanUseRemoteAccess || !currentUserEmail || remoteAccessStatus === "Offline") {
      setOnlineTechnicians([]);
      return;
    }

    const currentUserPresence: OnlineTechnician = {
      email: currentUserEmail,
      name: currentUserName || displayUserName(currentUserEmail),
      role: currentUserRole,
      status: remoteAccessStatus,
      onlineAt: new Date().toISOString()
    };
    setOnlineTechnicians([currentUserPresence]);
  }, [currentUserCanUseRemoteAccess, currentUserEmail, currentUserName, currentUserRole, isAuthenticated, remoteAccessStatus]);

  const overviewData = useMemo(() => {
    const today = new Date();
    const currentMonth = monthKey(today);
    const lastSixMonths = Array.from({ length: 6 }, (_, index) => monthKey(addMonths(today, index - 5)));
    const serviceEntries = machines.flatMap((machine) => finalizedServiceRecords(machine).map((record) => ({ machine, record })));
    const machinesWithRemote = machines.filter((machine) => machineHasRemoteAccess(normalizeRemoteAccess(machine.remote_access ?? machine.access_method)));
    const machinesWithoutService = machines.filter((machine) => !lastServiceDate(machine));
    const machineContracts = machines
      .map((machine) => latestContractForMachine(supportContracts, machine))
      .filter((contract): contract is SupportContract => Boolean(contract));
    const activeContracts = machineContracts.filter(isActiveContract);
    const negotiatingContracts = machineContracts.filter(isNegotiatingContract);
    const expiringContracts = activeContracts.filter((contract) => {
      const days = daysUntil(contract.support_contract_until);
      return days !== null && days >= 0 && days <= 90;
    });
    const expiredContracts = activeContracts.filter((contract) => {
      const days = daysUntil(contract.support_contract_until);
      return days !== null && days < 0;
    });
    const staleMachines = machines.filter((machine) => {
      const days = daysSince(lastServiceDate(machine));
      return days === null || days > 180;
    });
    const machinesByState = new Map<string, Machine[]>();
    const machinesByCity = new Map<string, { city: string; state: string; machines: Machine[] }>();
    const softwareByVm = new Map<string, Set<string>>();
    machines.forEach((machine) => {
      const state = locationState(machine.unit_city);
      machinesByState.set(state, [...(machinesByState.get(state) ?? []), machine]);
      const city = locationCity(machine.unit_city);
      if (city && STATE_CENTERS[state]) {
        const key = `${city}|${state}`.toLowerCase();
        const current = machinesByCity.get(key) ?? { city, state, machines: [] };
        current.machines.push(machine);
        machinesByCity.set(key, current);
      }
      const softwareCode = machine.software_code?.trim();
      if (softwareCode) {
        const vm = machine.vm?.trim() || "VM não informada";
        const current = softwareByVm.get(vm) ?? new Set<string>();
        current.add(softwareCode.toUpperCase());
        softwareByVm.set(vm, current);
      }
    });

    const countBy = <T,>(items: T[], label: (item: T) => string) => {
      const map = new Map<string, number>();
      items.forEach((item) => {
        const key = label(item) || "Não informado";
        map.set(key, (map.get(key) ?? 0) + 1);
      });
      return [...map.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value || compareText(a.name, b.name));
    };

    const serviceMonthCounts = new Map(lastSixMonths.map((key) => [key, 0]));
    serviceEntries.forEach(({ record }) => {
      if (!record.service_date) return;
      const key = record.service_date.slice(0, 7);
      if (serviceMonthCounts.has(key)) serviceMonthCounts.set(key, (serviceMonthCounts.get(key) ?? 0) + 1);
    });

    const machineAttention = machines
      .map((machine) => ({
        machine,
        lastDate: lastServiceDate(machine),
        days: daysSince(lastServiceDate(machine)),
        services: finalizedServiceRecords(machine).length
      }))
      .sort((a, b) => (b.days ?? 99999) - (a.days ?? 99999))
      .slice(0, 6);

    const topMachinesByService = [...machines]
      .map((machine) => ({ machine, value: finalizedServiceRecords(machine).length }))
      .sort((a, b) => b.value - a.value || compareText(displayMachineCode(a.machine), displayMachineCode(b.machine)))
      .slice(0, 6);

    const recentServices = serviceEntries
      .sort((a, b) => compareDate(b.record.service_date, a.record.service_date))
      .slice(0, 6);

    return {
      totalMachines: machines.length,
      totalServices: serviceEntries.length,
      servicesThisMonth: serviceEntries.filter(({ record }) => record.service_date?.startsWith(currentMonth)).length,
      activeContracts: activeContracts.length,
      negotiatingContracts: negotiatingContracts.length,
      expiringContracts: expiringContracts.length,
      expiredContracts: expiredContracts.length,
      remoteCoverage: percent(machinesWithRemote.length, machines.length),
      staleMachines: staleMachines.length,
      machinesWithoutService: machinesWithoutService.length,
      byModel: countBy(machines, (machine) => machine.model?.trim() || "Modelo não informado").slice(0, 7),
      byAccess: countBy(machines, (machine) => normalizeRemoteAccess(machine.remote_access ?? machine.access_method)),
      byState: countBy(machines, (machine) => locationState(machine.unit_city)).slice(0, 8),
      geoStates: [...machinesByState.entries()]
        .filter(([state]) => Boolean(STATE_CENTERS[state]))
        .map(([state, stateMachines]) => ({ state, value: stateMachines.length, machines: stateMachines }))
        .sort((a, b) => b.value - a.value || compareText(a.state, b.state)),
      geoCities: [...machinesByCity.values()]
        .map((item) => ({ ...item, value: item.machines.length }))
        .sort((a, b) => b.value - a.value || compareText(`${a.city}-${a.state}`, `${b.city}-${b.state}`)),
      byContractType: countBy(activeContracts, (contract) => contract.contract_type || "Tipo não informado"),
      byServiceType: countBy(serviceEntries, ({ record }) => normalizeServiceType(record.service_type)),
      byClient: countBy(machines, (machine) => machine.client?.trim() || "Cliente não informado").slice(0, 8),
      byClientServices: countBy(serviceEntries, ({ machine }) => machine.client?.trim() || "Cliente não informado").slice(0, 8),
      byVmSoftware: [...softwareByVm.entries()]
        .map(([name, softwareCodes]) => ({ name, value: softwareCodes.size }))
        .sort((a, b) => b.value - a.value || compareText(a.name, b.name))
        .slice(0, 8),
      serviceTrend: [...serviceMonthCounts.entries()].map(([name, value]) => ({ name: monthLabel(name), value })),
      topMachinesByService,
      machineAttention,
      recentServices
    };
  }, [machines, supportContracts]);

  useEffect(() => {
    if (view !== "overview" || !overviewMapRef.current) {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
      return;
    }

    let cancelled = false;
    setMapMode("loading");
    const timeout = window.setTimeout(() => {
      if (!cancelled) setMapMode("fallback");
    }, 5000);

    loadLeaflet()
      .then((leaflet) => {
        if (cancelled || !overviewMapRef.current) return;
        window.clearTimeout(timeout);
        if (leafletMapRef.current) {
          leafletMapRef.current.remove();
          leafletMapRef.current = null;
        }

        const map = leaflet.map(overviewMapRef.current, {
          scrollWheelZoom: true,
          zoomControl: true
        }).setView([-14.235, -51.9253], 4);
        window.setTimeout(() => {
          if (!cancelled) map.invalidateSize();
        }, 120);

        leaflet.tileLayer("/api/map-tile/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap &copy; CARTO",
          detectRetina: true
        }).addTo(map);

        const stateLayer = leaflet.layerGroup();
        const cityLayer = leaflet.layerGroup();
        const bounds: [number, number][] = [];

        overviewData.geoStates.forEach((item) => {
          const center = STATE_CENTERS[item.state];
          if (!center) return;
          bounds.push(center);
          const machineList = item.machines
            .slice(0, 8)
            .map((machine) => `<li>${escapeHtml(displayMachineCode(machine))} - ${escapeHtml(machine.client || "Cliente não informado")}</li>`)
            .join("");

          leaflet.circleMarker(center, {
            radius: Math.min(28, 9 + item.value * 3),
            color: "#1268d8",
            fillColor: "#1268d8",
            fillOpacity: 0.72,
            weight: 2
          })
            .addTo(stateLayer)
            .bindPopup(`<strong>${escapeHtml(item.state)} - ${item.value} máquina${item.value === 1 ? "" : "s"}</strong><ul>${machineList}</ul>${item.value > 8 ? `<small>+${item.value - 8} máquinas</small>` : ""}`);
        });

        stateLayer.addTo(map);

        const updateGeoLayers = () => {
          const showCities = map.getZoom() >= 7;
          if (showCities) {
            if (map.hasLayer(stateLayer)) map.removeLayer(stateLayer);
            if (!map.hasLayer(cityLayer)) map.addLayer(cityLayer);
          } else {
            if (map.hasLayer(cityLayer)) map.removeLayer(cityLayer);
            if (!map.hasLayer(stateLayer)) map.addLayer(stateLayer);
          }
        };

        Promise.all(overviewData.geoCities.map(async (item) => {
          const center = await geocodeCity(item.city, item.state).catch(() => null);
          if (!center || cancelled) return;
          const machineList = item.machines
            .slice(0, 8)
            .map((machine) => `<li>${escapeHtml(displayMachineCode(machine))} - ${escapeHtml(machine.client || "Cliente não informado")}</li>`)
            .join("");
          leaflet.circleMarker(center, {
            radius: Math.min(22, 7 + item.value * 2),
            color: "#0f9b5f",
            fillColor: "#0f9b5f",
            fillOpacity: 0.72,
            weight: 2
          })
            .addTo(cityLayer)
            .bindPopup(`<strong>${escapeHtml(item.city)} - ${escapeHtml(item.state)}</strong><br/><span>${item.value} máquina${item.value === 1 ? "" : "s"}</span><ul>${machineList}</ul>${item.value > 8 ? `<small>+${item.value - 8} máquinas</small>` : ""}`);
        })).then(() => {
          if (!cancelled) updateGeoLayers();
        });

        map.on("zoomend", updateGeoLayers);
        if (bounds.length > 1) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 6 });
        updateGeoLayers();
        leafletMapRef.current = map;
        setMapMode("leaflet");
      })
      .catch(() => {
        window.clearTimeout(timeout);
        setMapMode("fallback");
        setMessage("Não foi possível carregar o mapa. Verifique a conexão e tente novamente.");
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [overviewData.geoCities, overviewData.geoStates, view]);

  useEffect(() => {
    if (view !== "overview" || !leafletMapRef.current) return;
    const center = focusedMapState ? STATE_CENTERS[focusedMapState] : null;
    if (center) {
      leafletMapRef.current.setView(center, 7);
      return;
    }

    const bounds = overviewData.geoStates
      .map((item) => STATE_CENTERS[item.state])
      .filter(Boolean);
    if (bounds.length > 1) leafletMapRef.current.fitBounds(bounds, { padding: [28, 28], maxZoom: 6 });
    else leafletMapRef.current.setView([-14.235, -51.9253], 4);
  }, [focusedMapState, overviewData.geoStates, view]);

  function focusOverviewMapState(stateName: string) {
    if (stateName === "Sem localização" || !STATE_CENTERS[stateName]) {
      setFocusedMapState("");
      return;
    }

    setFocusedMapState(stateName);
  }

  useEffect(() => {
    setMachineForm(machineFormFromMachine(editingMachine));
  }, [editingMachineId, editingMachine]);

  useEffect(() => {
    const nextServiceType = normalizeServiceType(editingServiceRecord?.service_type);
    setServiceType(nextServiceType);
    setCustomerSignature(nextServiceType === "Visita técnica" ? editingServiceRecord?.customer_signature ?? "" : "");
    setServiceAttachments(editingServiceRecord?.attachments ?? []);
  }, [editingServiceRecord]);

  useEffect(() => {
    const canvas = signatureCanvasRef.current;
    if (!canvas || serviceType !== "Visita técnica") return;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (!customerSignature) return;
    const image = new window.Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = customerSignature;
  }, [customerSignature, serviceType, view]);

  function applyAuthorizedSession(userId: string, userEmail: string, authorizedUser: AuthorizedUser) {
    const fallbackName = displayUserName(userEmail);
    setCurrentUserId(userId);
    setCurrentUserEmail(userEmail.toLowerCase());
    setCurrentUserRole(authorizedUser.role);
    setCurrentUserRemoteAccessAllowed(Boolean(authorizedUser.remote_access_allowed));
    setCurrentUserCredentialAccessAllowed(Boolean(authorizedUser.credential_access_allowed));
    setCurrentUserName(authorizedUser.name || fallbackName);
  }

  function applyAppData(payload: AppDataPayload) {
    if (payload.session && payload.user) {
      applyAuthorizedSession(payload.session.userId, payload.session.email, payload.user);
    }

    setMachines(payload.machines ?? []);
    setAuthorizedUsers(payload.authorizedUsers ?? []);
    setTravelSchedules(payload.travelSchedules ?? []);
    setSupportContracts(payload.supportContracts ?? []);
    setChatContacts(payload.chatContacts ?? []);
    setChatConversations(payload.chatConversations ?? []);
    setAdminInfo(payload.adminInfo ?? null);
  }

  async function loadData() {
    try {
      const payload = await apiRequest<AppDataPayload>("/api/app-data");
      applyAppData(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar os dados.");
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authLoading) return;
    const normalizedEmail = email.trim().toLowerCase();

    if (!isCorporateEmail(normalizedEmail)) {
      setMessage(GENERIC_AUTH_MESSAGE);
      return;
    }

    setAuthLoading(true);
    setMessage(DEFAULT_MESSAGE);

    if (!otpSent) {
      try {
        await apiRequest<{ ok: boolean }>("/api/auth/request-code", {
          method: "POST",
          body: JSON.stringify({ email: normalizedEmail })
        });
      } catch (error) {
        if (process.env.NODE_ENV !== "production") console.error("Erro ao enviar código de acesso", error);
        setMessage(error instanceof Error ? error.message : GENERIC_AUTH_MESSAGE);
        setAuthLoading(false);
        return;
      }

      setEmail(normalizedEmail);
      setOtpSent(true);
      setMessage("Enviamos um código de acesso para o seu e-mail corporativo.");
      setAuthLoading(false);
      return;
    }

    const sanitizedCode = otpCode.trim();
    if (!sanitizedCode) {
      setMessage("Informe o código recebido por e-mail.");
      setAuthLoading(false);
      return;
    }

    let authPayload: AppSessionPayload;
    try {
      authPayload = await apiRequest<AppSessionPayload>("/api/auth/verify-code", {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail, code: sanitizedCode })
      });
    } catch (error) {
      if (process.env.NODE_ENV !== "production") console.error("Erro ao validar código de acesso", error);
      setMessage(error instanceof Error ? error.message : GENERIC_AUTH_MESSAGE);
      setAuthLoading(false);
      return;
    }

    if (!authPayload.session || !authPayload.user) {
      setMessage(GENERIC_AUTH_MESSAGE);
      setAuthLoading(false);
      return;
    }

    storeAuthConfirmation();
    storeBiometricVerifiedThisOpen(authPayload.session.email);
    setOtpCode("");
    setOtpSent(false);
    setIsAuthenticated(true);
    applyAuthorizedSession(authPayload.session.userId, authPayload.session.email, authPayload.user);
    if (isMobileAuthDeviceState && canUseWebAuthn() && !window.localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY) && !window.localStorage.getItem(BIOMETRIC_PROMPT_DISMISSED_KEY)) {
      setBiometricPromptOpen(true);
    }
    setMessage("Acesso autorizado.");
    await loadData();
    setAuthLoading(false);
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => null);
    clearAuthConfirmation();
    clearBiometricVerifiedThisOpen();
    setIsAuthenticated(false);
    setCurrentUserId("");
    setCurrentUserEmail("");
    setCurrentUserName("");
    setCurrentUserRole(null);
    setCurrentUserRemoteAccessAllowed(false);
    setCurrentUserCredentialAccessAllowed(false);
    setRemoteAccessStatus("Offline");
    setMachines([]);
    setAuthorizedUsers([]);
    setChatContacts([]);
    setTravelSchedules([]);
    setSupportContracts([]);
    setChatConversations([]);
    setAdminInfo(null);
  }

  function updateRemoteAccessStatus(status: RemoteAccessStatus) {
    setRemoteAccessStatus(status);
    if (currentUserEmail) {
      window.localStorage.setItem(`${REMOTE_ACCESS_STATUS_KEY}:${currentUserEmail.toLowerCase()}`, status);
    }
    setUserMenuOpen(false);
    setMessage(`Status de Acesso Remoto alterado para ${status}.`);
  }

  function toggleTheme() {
    setTheme((current) => current === "dark" ? "light" : "dark");
  }

  function editUser() {
    setUserMenuOpen(false);
    setProfileName(currentUserName || displayUserName(currentUserEmail));
    setProfileModalOpen(true);
  }

  async function enableBiometricAuth() {
    if (!isMobileAuthDeviceState || !canUseWebAuthn() || !currentUserEmail) {
      setMessage("Biometria indisponível neste navegador ou dispositivo.");
      return;
    }

    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = crypto.getRandomValues(new Uint8Array(16));
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "Assistência Tomasoni" },
          user: {
            id: userId,
            name: currentUserEmail,
            displayName: currentUserName || displayUserName(currentUserEmail)
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 }
          ],
          authenticatorSelection: { userVerification: "required" },
          timeout: 60000
        }
      }) as PublicKeyCredential | null;

      if (!credential) throw new Error("Credencial não criada.");
      window.localStorage.setItem(BIOMETRIC_EMAIL_KEY, currentUserEmail);
      window.localStorage.setItem(BIOMETRIC_CREDENTIAL_KEY, bufferToBase64Url(credential.rawId));
      window.localStorage.setItem(BIOMETRIC_PROMPT_DISMISSED_KEY, "1");
      setBiometricPromptOpen(false);
      setMessage("Biometria habilitada para este dispositivo.");
    } catch {
      setMessage("Não foi possível habilitar a biometria neste dispositivo.");
    }
  }

  async function confirmBiometricAccess() {
    const credentialId = window.localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY);
    if (!isMobileAuthDeviceState || !credentialId || !canUseWebAuthn()) {
      setMessage("Biometria indisponível. Acesse novamente com o código enviado ao e-mail.");
      await signOut();
      return;
    }

    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ id: base64UrlToBuffer(credentialId), type: "public-key" }],
          userVerification: "required",
          timeout: 60000
        }
      });

      if (!credential) throw new Error("Biometria cancelada.");
      const biometricEmail = window.localStorage.getItem(BIOMETRIC_EMAIL_KEY) || currentUserEmail;
      storeBiometricVerifiedThisOpen(biometricEmail);
      setBiometricRequired(false);
      setIsAuthenticated(true);
      setMessage("Acesso liberado por biometria.");
      await loadData();
    } catch {
      setMessage("Biometria não confirmada. Acesse novamente com o código enviado ao e-mail.");
      await signOut();
    }
  }

  async function downloadMachinesBackup() {
    if (!canDownloadBackup) {
      setUserMenuOpen(false);
      setMessage("Backup disponível apenas para usuário autorizado.");
      return;
    }

    setUserMenuOpen(false);
    setMessage("Atualizando backup no SharePoint.");
    try {
      await appAction("backupSharePoint");
      setMessage("Backup atualizado no SharePoint com sucesso.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar o backup no SharePoint.");
    }
  }

  async function saveUserProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayName = profileName.trim() || displayUserName(currentUserEmail);

    try {
      const result = await appAction<AuthorizedUser>("saveProfile", { display_name: displayName });
      if (result.data) {
        applyAuthorizedSession(currentUserId, currentUserEmail, result.data);
      } else {
        setCurrentUserName(displayName);
      }
      setProfileModalOpen(false);
      setMessage("Usuário atualizado com sucesso.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar o usuário.");
    }
  }

  function signaturePoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function shouldExpandSignaturePad() {
    return window.matchMedia("(max-width: 760px)").matches && !signatureExpanded;
  }

  async function openSignaturePad() {
    setSignatureExpanded(true);
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: "landscape") => Promise<void> };
      await orientation.lock?.("landscape");
    } catch {}
  }

  async function closeSignaturePad() {
    finishSignature();
    setSignatureExpanded(false);
    try {
      screen.orientation?.unlock?.();
      if (document.fullscreenElement) await document.exitFullscreen?.();
    } catch {}
  }

  function startSignature(event: PointerEvent<HTMLCanvasElement>) {
    if (serviceType !== "Visita técnica") return;
    if (shouldExpandSignaturePad()) {
      event.preventDefault();
      void openSignaturePad();
      return;
    }
    const canvas = signatureCanvasRef.current;
    const point = signaturePoint(event);
    const context = canvas?.getContext("2d");
    if (!canvas || !point || !context) return;

    canvas.setPointerCapture(event.pointerId);
    context.strokeStyle = "#111111";
    context.lineWidth = 2.6;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(point.x, point.y);
    setIsSigning(true);
  }

  function drawSignature(event: PointerEvent<HTMLCanvasElement>) {
    if (!isSigning || serviceType !== "Visita técnica") return;
    const canvas = signatureCanvasRef.current;
    const point = signaturePoint(event);
    const context = canvas?.getContext("2d");
    if (!canvas || !point || !context) return;

    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function finishSignature(event?: PointerEvent<HTMLCanvasElement>) {
    if (!isSigning) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    if (event && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    setIsSigning(false);
    setCustomerSignature(canvas.toDataURL("image/png"));
  }

  function clearSignature() {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    setCustomerSignature("");
    setIsSigning(false);
  }

  function updateServiceType(value: ServiceType) {
    setServiceType(value);
    if (value !== "Visita técnica") {
      setSignatureExpanded(false);
      clearSignature();
    }
  }

  function rememberServiceEmails(emails: string[]) {
    const normalizedEmails = emails
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (!normalizedEmails.length) return;

    setSavedServiceEmails((current) => {
      const currentEmails = current.map((email) => email.toLowerCase());
      const next = Array.from(new Set([...normalizedEmails, ...currentEmails])).slice(0, 80);
      window.localStorage.setItem(SERVICE_EMAIL_SUGGESTIONS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function selectServiceEmailSuggestion(email: string) {
    const parts = serviceRecipientsInput.split(/([;,\n])/);
    let lastTextIndex = parts.length - 1;
    while (lastTextIndex >= 0 && /[;,\n]/.test(parts[lastTextIndex])) lastTextIndex -= 1;
    if (lastTextIndex < 0) {
      setServiceRecipientsInput(`${email}; `);
    } else {
      parts[lastTextIndex] = ` ${email}`;
      setServiceRecipientsInput(`${parts.join("").replace(/^\s+/, "")}; `);
    }
    setServiceRecipientSuggestionsOpen(false);
  }

  async function imageFileToAttachment(file: File): Promise<ServiceAttachment> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      reader.readAsDataURL(file);
    });

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Arquivo de imagem inválido."));
      element.src = dataUrl;
    });

    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a imagem.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return {
      id: crypto.randomUUID(),
      name: file.name,
      type: "image/jpeg",
      dataUrl: canvas.toDataURL("image/jpeg", 0.9),
      width: canvas.width,
      height: canvas.height,
      caption: ""
    };
  }

  async function addServiceAttachmentFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    event.target.value = "";
    if (!files.length) return;

    const available = MAX_SERVICE_ATTACHMENTS - serviceAttachments.length;
    if (available <= 0) {
      setMessage(`Limite de ${MAX_SERVICE_ATTACHMENTS} imagens por relatório atingido.`);
      return;
    }

    try {
      const nextAttachments = await Promise.all(files.slice(0, available).map(imageFileToAttachment));
      setServiceAttachments((current) => [...current, ...nextAttachments].slice(0, MAX_SERVICE_ATTACHMENTS));
      setMessage(files.length > available
        ? `Foram anexadas ${available} imagens. O limite por relatório é ${MAX_SERVICE_ATTACHMENTS}.`
        : `${nextAttachments.length} imagem(ns) anexada(s) ao relatório.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível anexar as imagens.");
    }
  }

  function updateServiceAttachmentCaption(id: string, caption: string) {
    setServiceAttachments((current) => current.map((attachment) => (
      attachment.id === id ? { ...attachment, caption } : attachment
    )));
  }

  function removeServiceAttachment(id: string) {
    setServiceAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  function startNewService() {
    if (!currentUserCanEmitReports) {
      setMessage("Seu perfil não tem permissão para emitir relatórios.");
      return;
    }

    setSignatureExpanded(false);
    setEditingServiceRecord(null);
    setEditingPreviewRecipients(null);
    setServiceMachineLookupInput("");
    setServiceMachineTouched(false);
    setSupportTechniciansInput("");
    setServiceRecipientsInput("");
    setServiceAttachments([]);
    setSelectedServiceRecord(null);
    updateServiceType("Acesso remoto");
    setView("service");
  }

  function closeServicePreview() {
    setServicePreview(null);
  }

  function editServiceFromPreview(record: ServiceRecord) {
    const recipients = servicePreview?.recipients ?? [];
    closeServicePreview();
    startServiceEdit(record, recipients);
  }

  function showFullHistory() {
    setHistoryFilter("");
    window.requestAnimationFrame(() => {
      document.getElementById("full-machine-history")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const filteredMachines = useMemo(() => {
    const term = machineFilter.trim().toLowerCase();
    return [...machines]
      .filter((machine) => {
        if (!term) return true;
        return [machine.code, machine.mechanical_list, machine.software_code, machine.ip_range, machine.vm, machine.model, machine.description, machine.client, machine.unit_city, machine.serial, machine.manufacture_month, machine.software_version, machine.remote_access, machine.access_method]
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => {
        const direction = machineSort.direction === "asc" ? 1 : -1;
        let result = 0;

        if (machineSort.key === "last_service") result = compareDate(lastServiceDate(a), lastServiceDate(b));
        if (machineSort.key === "code") result = compareText(a.code, b.code);
        if (machineSort.key === "model") result = compareText(a.model, b.model);
        if (machineSort.key === "client") result = compareText(a.client, b.client);
        if (machineSort.key === "unit_city") result = compareText(a.unit_city, b.unit_city);
        if (machineSort.key === "serial") result = compareText(a.serial, b.serial);
        if (machineSort.key === "software_version") result = compareText(a.software_version, b.software_version);
        if (machineSort.key === "manufacture_month") result = monthYearSortValue(a.manufacture_month) - monthYearSortValue(b.manufacture_month);
        if (machineSort.key === "vm") result = compareText(a.vm, b.vm);

        return result * direction;
      });
  }, [machineFilter, machineSort, machines]);

  const registryMachines = useMemo(() => {
    return [...machines].sort((a, b) => compareText(a.code, b.code));
  }, [machines]);

  const filteredHistory = useMemo(() => {
    const term = historyFilter.trim().toLowerCase();
    const records = finalizedServiceRecords(selectedMachine);
    return [...records]
      .filter((record) => {
        if (!term) return true;
        return [record.service_type, record.technician_name, record.equipment, record.issue_summary, record.request, record.diagnosis, record.service_done, record.observations, record.customer_name]
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => {
        const direction = historySort.direction === "asc" ? 1 : -1;
        let result = 0;

        if (historySort.key === "service_date") result = compareDate(a.service_date, b.service_date);
        if (historySort.key === "equipment") result = compareText(a.equipment, b.equipment);
        if (historySort.key === "technician_name") result = compareText(a.technician_name, b.technician_name);
        if (historySort.key === "issue_summary") result = compareText(a.issue_summary, b.issue_summary);

        return result * direction;
      });
  }, [historyFilter, historySort, selectedMachine]);

  const sortedUsers = useMemo(() => {
    return [...authorizedUsers].sort((a, b) => {
      const direction = userSort.direction === "asc" ? 1 : -1;
      const result = userSort.key === "name"
        ? compareText(a.name, b.name)
        : userSort.key === "email"
          ? compareText(a.email, b.email)
          : compareText(a.role, b.role);
      return result * direction;
    });
  }, [authorizedUsers, userSort]);

  const sortedChatContacts = useMemo(() => {
    return [...chatContacts].sort((a, b) => {
      const companyCompare = compareText(a.company || "", b.company || "");
      if (companyCompare) return companyCompare;
      const nameCompare = compareText(a.name || "", b.name || "");
      if (nameCompare) return nameCompare;
      return compareText(a.phone, b.phone);
    });
  }, [chatContacts]);

  const clientSuggestions = useMemo(() => {
    return Array.from(new Set(
      machines
        .map((machine) => machine.client?.trim())
        .filter((client): client is string => Boolean(client))
    )).sort((a, b) => compareText(a, b));
  }, [machines]);

  const travelCodeSuggestions = useMemo(() => {
    return Array.from(new Set(
      travelSchedules
        .map((item) => item.code?.trim().toUpperCase())
        .filter((code): code is string => Boolean(code))
    )).sort((a, b) => compareText(a, b));
  }, [travelSchedules]);

  function toggleMachineSort(key: MachineSortKey) {
    setMachineSort((current) => ({ key, direction: nextDirection(current.key === key, current.direction) }));
  }

  function toggleHistorySort(key: HistorySortKey) {
    setHistorySort((current) => ({ key, direction: nextDirection(current.key === key, current.direction) }));
  }

  function toggleUserSort(key: UserSortKey) {
    setUserSort((current) => ({ key, direction: nextDirection(current.key === key, current.direction) }));
  }

  function toggleTravelSort(key: TravelSortKey) {
    setTravelSort((current) => ({ key, direction: nextDirection(current.key === key, current.direction) }));
  }

  function toggleCompletedTravelSort(key: TravelSortKey) {
    setCompletedTravelSort((current) => ({ key, direction: nextDirection(current.key === key, current.direction) }));
  }

  function toggleActionMenu(id: string, event: ReactMouseEvent<HTMLButtonElement>) {
    event.stopPropagation();

    if (openActionMenu === id) {
      setOpenActionMenu("");
      setActionMenuPosition(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const right = Math.max(12, window.innerWidth - rect.right);
    const top = Math.min(rect.bottom + 6, window.innerHeight - 220);
    setActionMenuPosition({ top: Math.max(12, top), right });
    setOpenActionMenu(id);
  }

  function updateMachineForm<K extends keyof MachineFormState>(key: K, value: MachineFormState[K]) {
    setMachineForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "remote_access") {
        if (value === "Sem acesso remoto") {
          next.vnc_ip = "";
          next.vnc_user = "";
          next.vnc_password = "";
          next.vnc_vm_password = "";
          next.vnc_notes = "";
          next.sinema_url = "";
          next.sinema_user = "";
          next.sinema_password = "";
          next.sinema_notes = "";
        }

        if (value === "SINEMA") {
          next.vnc_ip = "";
          next.vnc_user = "";
          next.vnc_password = "";
          next.vnc_vm_password = "";
          next.vnc_notes = "";
        }

        if (value === "VNC") {
          next.sinema_url = "";
          next.sinema_user = "";
          next.sinema_password = "";
          next.sinema_notes = "";
        }
      }

      return next;
    });
  }

  async function saveMachine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUserCanEditMachine) {
      setMessage("Seu usuário não tem permissão para alterar cadastros de máquinas.");
      return;
    }

    const normalizedCode = machineForm.code.trim().toUpperCase();
    const normalizedSerial = machineForm.serial.trim().toUpperCase();
    const normalizedMechanicalList = machineForm.mechanical_list.trim().toUpperCase();
    const normalizedSoftwareCode = machineForm.software_code.trim().toUpperCase();
    const validationErrors = [
      validateCodePattern(normalizedCode, /^T665-\d{4}$/, "Código da máquina"),
      validateCodePattern(normalizedSoftwareCode, /^T665-\d{4}$/, "Código do software"),
      validateCodePattern(normalizedSerial, /^(500-\d{3}|500-\d{3}\/\d{2})$/, "Número de série"),
      validateCodePattern(normalizedMechanicalList, /^(500-\d{3}|T-0\d{3})$/, "Lista mecânica"),
      validateMonthYear(machineForm.manufacture_month, "Fabricação"),
      validateIpv4Like(machineForm.ip_range, "Faixa de IP", { allowWildcard: true }),
      validateIpv4Like(machineForm.vnc_ip, "IP de acesso VNC", { allowPort: true })
    ].filter(Boolean);

    const duplicate = machines.find((machine) => machine.id !== editingMachineId && (
      (normalizedCode && machine.code?.trim().toUpperCase() === normalizedCode)
      || (normalizedSerial && machine.serial?.trim().toUpperCase() === normalizedSerial)
      || (normalizedMechanicalList && machine.mechanical_list?.trim().toUpperCase() === normalizedMechanicalList)
      || (normalizedSoftwareCode && machine.software_code?.trim().toUpperCase() === normalizedSoftwareCode)
    ));

    if (duplicate) {
      setMessage(`Já existe uma máquina cadastrada com código, série, mecânica ou software informado: ${displayMachineCode(duplicate)}.`);
      return;
    }

    if (validationErrors.length) {
      setMessage(validationErrors[0]);
      return;
    }

    const payload = {
      code: normalizedCode || null,
      model: machineForm.model.trim() || null,
      client: machineForm.client.trim() || null,
      unit_city: machineForm.unit_city.trim() || null,
      serial: normalizedSerial || null,
      description: machineForm.description.trim().slice(0, 160) || null,
      manufacture_month: normalizeMonthYear(machineForm.manufacture_month),
      mechanical_list: normalizedMechanicalList || null,
      software_code: normalizedSoftwareCode || null,
      ip_range: machineForm.ip_range.trim() || null,
      vm: machineForm.vm.trim() || null,
      software_version: machineForm.software_version.trim() || null,
      access_method: null,
      remote_access: machineForm.remote_access
    };

    let data: Machine;
    try {
      const result = await appAction<Machine>("saveMachine", {
        id: editingMachineId || null,
        ...payload,
        vnc_ip: machineForm.vnc_ip,
        vnc_user: machineForm.vnc_user,
        vnc_password: machineForm.vnc_password,
        vnc_vm_password: machineForm.vnc_vm_password,
        vnc_notes: machineForm.vnc_notes,
        sinema_url: machineForm.sinema_url,
        sinema_user: machineForm.sinema_user,
        sinema_password: machineForm.sinema_password,
        sinema_notes: machineForm.sinema_notes
      });
      if (!result.data) throw new Error("Máquina não salva.");
      data = result.data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar a máquina.");
      return;
    }

    setEditingMachineId("");
    setSelectedMachineId(data.id);
    setMessage(`Máquina ${payload.code || "sem código"} salva com sucesso.`);
    setMachineForm(EMPTY_MACHINE_FORM);
    await loadData();
    setRegistryTab("machines");
    setView("registry");
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUserCanManageUsers) {
      setMessage("Seu usuário não tem permissão para cadastrar ou alterar usuários.");
      return;
    }

    const payload = {
      name: userForm.name.trim(),
      email: userForm.email.trim().toLowerCase(),
      role: userForm.role,
      phone: userForm.phone.replace(/\D/g, ""),
      remote_access_allowed: userForm.remote_access_allowed,
      credential_access_allowed: userForm.credential_access_allowed
    };

    if (!payload.name || !payload.email) {
      setMessage("Informe nome e e-mail do usuário.");
      return;
    }

    if (!isCorporateEmail(payload.email)) {
      setMessage("Cadastre apenas e-mails corporativos da Tomasoni.");
      return;
    }

    let savedUser: AuthorizedUser;
    try {
      const result = await appAction<AuthorizedUser>("saveUser", { id: editingUserId || null, ...payload });
      if (!result.data) throw new Error("Usuário não salvo.");
      savedUser = result.data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o usuário.");
      return;
    }
    setEditingUserId("");
    setAuthorizedUsers((current) => {
      const withoutSaved = current.filter((user) => user.id !== savedUser.id);
      return [...withoutSaved, savedUser].sort((a, b) => compareText(a.name, b.name));
    });
    setMessage("Usuário salvo com sucesso.");
    setUserForm(EMPTY_USER_FORM);
    event.currentTarget.reset();
    await loadData();
  }

  function editChatContact(contact: ChatContact) {
    if (!currentUserCanUseRemoteAccess) {
      setMessage("Seu usuário não tem permissão para editar clientes do Acesso Remoto.");
      return;
    }

    setEditingContact(contact);
    setContactForm({
      name: contact.name ?? "",
      company: contact.company ?? "",
      phone: contact.phone
    });
    setOpenActionMenu("");
  }

  async function saveChatContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUserCanUseRemoteAccess || !editingContact) {
      setMessage("Seu usuário não tem permissão para editar clientes do Acesso Remoto.");
      return;
    }

    const payload = {
      name: contactForm.name.trim() || null,
      company: contactForm.company.trim() || null,
      phone: contactForm.phone.replace(/\D/g, ""),
      updated_at: new Date().toISOString()
    };

    if (!payload.phone) {
      setMessage("Informe um telefone válido para o cliente.");
      return;
    }

    try {
      await appAction<ChatContact>("saveChatContact", { id: editingContact.id, ...payload });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar o cliente.");
      return;
    }

    setEditingContact(null);
    setContactForm(EMPTY_CHAT_CONTACT_FORM);
    setMessage("Cliente atualizado com sucesso.");
    await loadData();
  }

  async function saveTravelSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUserCanEditSchedule) {
      setMessage("Seu usuário tem acesso apenas para visualizar o cronograma.");
      return;
    }

    const validationErrors = [
      validateDayMonth(travelForm.start_date, "Data de início"),
      validateDayMonth(travelForm.end_date, "Data de fim"),
      validateCodePattern(travelForm.code, TRAVEL_CODE_PATTERN, "Código do cliente")
    ].filter(Boolean);

    if (validationErrors.length) {
      setMessage(validationErrors[0]);
      return;
    }

    const payload = {
      start_date: travelForm.start_date.trim(),
      end_date: travelForm.end_date.trim(),
      code: travelForm.code.trim().toUpperCase() || null,
      client: travelForm.client.trim() || null,
      technicians: travelForm.technicians.trim() || null,
      status: travelForm.status.trim() || null,
      reason: travelForm.reason.trim() || null
    };

    try {
      await appAction<TravelSchedule>("saveTravel", { id: editingTravelId || null, ...payload });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o cronograma.");
      return;
    }

    setEditingTravelId("");
    setTravelForm(EMPTY_TRAVEL_FORM);
    setMessage("Cronograma salvo com sucesso.");
    await loadData();
  }

  function editTravelSchedule(item: TravelSchedule) {
    setEditingTravelId(item.id);
    setTravelForm({
      start_date: item.start_date ?? "",
      end_date: item.end_date ?? "",
      code: item.code ?? "",
      client: item.client ?? "",
      technicians: item.technicians ?? "",
      status: item.status ?? "A definir",
      reason: item.reason ?? ""
    });
    setScheduleTab("travel");
  }

  function updateContractMachine(machineId: string) {
    const machine = machines.find((item) => item.id === machineId);
    setContractForm((current) => ({
      ...current,
      machine_id: machineId,
      code: machine?.code ?? current.code,
      client: machine?.client ?? current.client,
      serial: machine?.serial ?? current.serial
    }));
  }

  function updateContractSerial(serial: string) {
    const matchingMachine = machines.find((machine) => normalizeLookup(machine.serial) === normalizeLookup(serial));
    setContractForm((current) => ({
      ...current,
      serial,
      machine_id: matchingMachine?.id ?? "",
      code: matchingMachine?.code ?? current.code,
      client: matchingMachine?.client ?? current.client
    }));
  }

  async function saveSupportContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUserCanManageContracts) {
      setMessage("Seu usuário não tem permissão para cadastrar ou alterar contratos.");
      return;
    }

    setMessage("Salvando contrato...");
    const contractDateError = validateFullDate(contractForm.support_contract_until, "Final de vigência");
    if (contractDateError) {
      setMessage(contractDateError);
      return;
    }

    const payload = {
      machine_id: contractForm.machine_id || null,
      code: contractForm.code.trim().toUpperCase() || null,
      client: contractForm.client.trim() || null,
      serial: contractForm.serial.trim().toUpperCase() || null,
      contract_type: contractForm.contract_type.trim() || null,
      status: contractForm.status,
      active: contractForm.status === "Ativo",
      support_contract_until: normalizeFullDate(contractForm.support_contract_until) || null
    };

    try {
      await appAction<SupportContract>("saveContract", { id: editingContractId || null, ...payload });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o contrato.");
      return;
    }

    setEditingContractId("");
    setContractForm(EMPTY_CONTRACT_FORM);
    setMessage("Contrato salvo com sucesso.");
    await loadData();
  }

  function editSupportContract(contract: SupportContract) {
    setEditingContractId(contract.id);
    setContractForm({
      machine_id: contract.machine_id ?? "",
      code: contract.code ?? "",
      client: contract.client ?? "",
      serial: contract.serial ?? "",
      contract_type: contract.contract_type ?? "",
      support_contract_until: formatDate(contract.support_contract_until) === "-" ? "" : formatDate(contract.support_contract_until),
      status: contractStatus(contract)
    });
  }

  async function deleteSupportContract(id: string) {
    if (!currentUserCanManageContracts) {
      setMessage("Seu usuario nao tem permissao para excluir contratos.");
      return;
    }
    if (!confirm("Excluir este contrato?")) return;
    try {
      await appAction("delete", { table: "support_contracts", id });
      setMessage("Contrato excluido.");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir o contrato.");
    }
  }

  async function sendServiceEmail(machine: Machine, record: ServiceRecord, recipients: string[]) {
    if (!recipients.length) {
      return "Atendimento salvo e PDF gerado. Nenhum e-mail foi informado para envio.";
    }

    const pdfRecord = serviceRecordWithTechnicianRole(record, authorizedUsers);
    const pdfBase64 = await servicePdfBase64(machine, pdfRecord);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    const response = await fetch("/api/send-service-email", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: recipients,
        subject: "Relatório de atendimento - Máquina " + displayMachineCode(machine),
        filename: servicePdfFileName(machine, pdfRecord),
        machineCode: displayMachineCode(machine),
        pdfBase64
      }),
      signal: controller.signal
    }).finally(() => window.clearTimeout(timeout));

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      return "Atendimento salvo e PDF gerado, mas o e-mail nao foi enviado. Detalhe: " + (result?.error ?? "erro nao informado");
    }

    rememberServiceEmails(recipients);
    if (result?.sharePoint?.error) {
      return "Atendimento salvo e e-mail enviado para " + recipients.join("; ") + ", mas o PDF não foi salvo no SharePoint. Detalhe: " + result.sharePoint.error;
    }

    if (result?.sharePoint?.skipped) {
      return "Atendimento salvo e e-mail enviado para " + recipients.join("; ") + ". Backup do PDF no SharePoint não configurado.";
    }

    return "Atendimento salvo, PDF gerado, e-mail enviado para " + recipients.join("; ") + " e PDF salvo no SharePoint.";
  }

  function pdfReadyServiceRecord(record: ServiceRecord) {
    return serviceRecordWithTechnicianRole(record, authorizedUsers);
  }

  async function syncServiceReportSharePoint(
    mode: "upload" | "archive",
    machine: Machine,
    record: ServiceRecord,
    filename = servicePdfFileName(machine, record)
  ) {
    const payload: Record<string, unknown> = {
      mode,
      recordId: record.id,
      machineCode: displayMachineCode(machine),
      filename
    };

    if (mode === "upload") {
      payload.pdfBase64 = await servicePdfBase64(machine, serviceRecordWithTechnicianRole(record, authorizedUsers));
    }

    const result = await appAction<{
      skipped?: boolean;
      error?: string;
      message?: string;
    }>("syncServiceReportSharePoint", payload);

    if (result.data?.error) {
      throw new Error(result.data.error);
    }

    return result.data;
  }

  async function sendPreviewServiceEmail() {
    if (!servicePreview || !previewMachine || servicePreviewSending) return;

    setServicePreviewSending(true);
    setMessage(servicePreview.recipients.length ? "Enviando e-mail com o relatorio em anexo." : "Finalizando atendimento e salvando PDF.");
    try {
      let resultMessage = "";
      if (servicePreview.finalizeOnSend && !servicePreview.recipients.length) {
        try {
          await syncServiceReportSharePoint("upload", previewMachine, servicePreview.record);
          resultMessage = "Atendimento salvo, PDF gerado e salvo no SharePoint. Nenhum e-mail foi informado para envio.";
        } catch (error) {
          const detail = error instanceof Error ? error.message : "erro nao informado";
          resultMessage = "Atendimento salvo e PDF gerado, mas o PDF não foi salvo no SharePoint. Nenhum e-mail foi informado para envio. Detalhe: " + detail + ".";
        }
      } else {
        resultMessage = await sendServiceEmail(previewMachine, servicePreview.record, servicePreview.recipients);
      }
      if (servicePreview.finalizeOnSend) {
        if (resultMessage.includes("e-mail nao foi enviado")) {
          setMessage(resultMessage + " A prévia continua pendente para nova tentativa.");
          return;
        }
        await appAction<ServiceRecord>("finalizeService", { id: servicePreview.record.id });
        await loadData();
        setMessage(resultMessage + " Atendimento finalizado.");
      } else {
        setMessage(resultMessage);
      }
      closeServicePreview();
    } catch (error) {
      const detail = error instanceof DOMException && error.name === "AbortError"
        ? "tempo limite do envio atingido"
        : error instanceof Error
          ? error.message
          : "erro nao informado";
      setMessage("Atendimento salvo e PDF gerado, mas o e-mail nao foi confirmado. Detalhe: " + detail + ".");
    } finally {
      setServicePreviewSending(false);
    }
  }

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUserCanEmitReports) {
      setMessage("Seu perfil nao tem permissao para emitir relatorios.");
      return;
    }

    const isEditingService = Boolean(editingServiceRecord);
    const previousServiceRecord = editingServiceRecord;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const submitMode = submitter?.value === "draft" ? "draft" : submitter?.value === "finalize" ? "finalize" : "update";
    const isDraftSave = submitMode === "draft";
    const isFinalizeFlow = submitMode === "finalize";
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    const machineLookupValue = String(form.get("machine_lookup") ?? serviceMachineLookupInput);
    const machine = findMachineByLookup(machines, machineLookupValue);
    const serviceRecipients = parseEmails(serviceRecipientsInput || String(form.get("service_recipients") ?? ""));
    const supportTechnicians = parseServiceTechnicianInput(String(form.get("support_technicians") ?? supportTechniciansInput), authorizedUsers);
    const previewRecipients = isFinalizeFlow ? serviceRecipients : isEditingService ? editingPreviewRecipients : serviceRecipients;
    const shouldOpenPreview = isFinalizeFlow || editingPreviewRecipients !== null;

    if (!machine) {
      setServiceMachineTouched(true);
      setMessage("Máquina não cadastrada. Selecione uma opção válida das sugestões antes de salvar.");
      return;
    }

    if (editingServiceRecord && editingServiceRecord.created_by !== currentUserId) {
      setMessage("Este atendimento so pode ser alterado pelo usuario que lancou o registro.");
      return;
    }

    const selectedServiceType = normalizeServiceType(String(form.get("service_type") ?? serviceType));
    const serviceStart = String(form.get("service_start") ?? "").trim();
    const serviceEnd = String(form.get("service_end") ?? "").trim();
    const serviceDateErrors = [
      validateServiceDateTime(serviceStart, "Inicio de atendimento"),
      validateServiceDateTime(serviceEnd, "Fim de atendimento")
    ].filter(Boolean);

    if (serviceDateErrors.length) {
      setMessage(serviceDateErrors[0]);
      return;
    }

    const serviceDate = extractDateFromServiceDateTime(serviceStart)
      || editingServiceRecord?.service_date
      || new Date().toISOString().slice(0, 10);

    const payload = {
      id: editingServiceRecord?.id ?? null,
      machine_id: machine.id,
      support_technicians: supportTechnicians,
      service_type: selectedServiceType,
      service_date: serviceDate,
      service_start: serviceStart || null,
      service_end: serviceEnd || null,
      equipment: String(form.get("equipment") ?? "").trim() || null,
      issue_summary: String(form.get("issue_summary") ?? "").trim() || null,
      request: String(form.get("request") ?? "").trim(),
      diagnosis: String(form.get("diagnosis") ?? "").trim(),
      service_done: String(form.get("service_done") ?? "").trim(),
      observations: String(form.get("observations") ?? "").trim() || null,
      customer_name: selectedServiceType === "Visita técnica" ? String(form.get("customer_name") ?? "").trim() || null : null,
      customer_signature: selectedServiceType === "Visita técnica" ? customerSignature || null : null,
      attachments: serviceAttachments,
      report_status: isDraftSave ? "Rascunho" : isFinalizeFlow ? "Rascunho" : "Finalizado",
      report_recipients: serviceRecipients
    };

    let record: ServiceRecord;
    try {
      const result = await appAction<ServiceRecord>("saveService", payload);
      if (!result.data) throw new Error("Atendimento nao salvo.");
      record = result.data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o atendimento.");
      return;
    }

    let sharePointMessage = "";
    if (isEditingService && previousServiceRecord && !isServiceDraft(record)) {
      try {
        const previousFilename = servicePdfFileName(machine, previousServiceRecord);
        const currentFilename = servicePdfFileName(machine, record);
        await syncServiceReportSharePoint("upload", machine, record, currentFilename);
        if (previousFilename !== currentFilename) {
          await syncServiceReportSharePoint("archive", machine, previousServiceRecord, previousFilename);
        }
        sharePointMessage = " Espelho do SharePoint atualizado.";
      } catch (error) {
        const detail = error instanceof Error ? error.message : "erro nao informado";
        sharePointMessage = " O atendimento foi salvo, mas o espelho do SharePoint nao foi atualizado. Detalhe: " + detail + ".";
      }
    }

    setSelectedMachineId(machine.id);
    setMessage(isDraftSave
      ? "Prévia salva. Ela ficará disponível acima do histórico para revisão e finalização."
      : shouldOpenPreview
        ? "Atendimento salvo. Preparando previa do PDF."
        : "Atendimento atualizado com sucesso." + sharePointMessage);
    setSignatureExpanded(false);
    setEditingServiceRecord(null);
    setEditingPreviewRecipients(null);
    setSelectedServiceRecord(null);
    formElement.reset();
    setServiceMachineLookupInput("");
    setServiceMachineTouched(false);
    setSupportTechniciansInput("");
    setServiceRecipientsInput("");
    setServiceAttachments([]);
    updateServiceType("Acesso remoto");
    await loadData();
    setView("machineDetail");

    if (shouldOpenPreview) {
      try {
        const pdfUrl = await servicePdfPreviewUrl(machine, pdfReadyServiceRecord(record));
        setServicePreview({ machineId: machine.id, record, recipients: previewRecipients ?? [], pdfUrl, finalizeOnSend: isFinalizeFlow || isServiceDraft(record) });
        setMessage("Atendimento salvo. Revise a previa do PDF antes do envio.");
      } catch (error) {
        const detail = error instanceof Error ? error.message : "erro nao informado";
        setMessage("Atendimento salvo, mas a previa do PDF nao foi gerada. Detalhe: " + detail + ".");
      }
    }
  }

  function startServiceEdit(record: ServiceRecord, preservedRecipients: string[] | null = null) {
    if (!currentUserCanEmitReports) {
      setMessage("Seu perfil nao tem permissao para alterar relatorios.");
      return;
    }
    if (record.created_by !== currentUserId) {
      setMessage("Este atendimento so pode ser alterado pelo usuario que lancou o registro.");
      return;
    }

    setSelectedMachineId(record.machine_id);
    setSelectedServiceRecord(null);
    setEditingServiceRecord(record);
    setEditingPreviewRecipients(preservedRecipients);
    setServiceMachineLookupInput(serviceMachineLookupLabel(machines.find((machine) => machine.id === record.machine_id)));
    setServiceMachineTouched(false);
    setSupportTechniciansInput(formatServiceTechniciansInput(record.support_technicians));
    setServiceRecipientsInput(preservedRecipients?.join("; ") ?? (isServiceDraft(record) ? (record.report_recipients ?? []).join("; ") : ""));
    setView("service");
  }

  async function openServiceDraftPreview(record: ServiceRecord) {
    const machine = machines.find((item) => item.id === record.machine_id) ?? selectedMachine;
    if (!machine) {
      setMessage("Não foi possível localizar a máquina para gerar a prévia.");
      return;
    }

    try {
      setMessage("Preparando prévia do relatório.");
      const pdfUrl = await servicePdfPreviewUrl(machine, pdfReadyServiceRecord(record));
      setServicePreview({
        machineId: machine.id,
        record,
        recipients: record.report_recipients ?? [],
        pdfUrl,
        finalizeOnSend: true
      });
      setMessage("Revise a prévia. Ao finalizar, o PDF será gerado e enviado.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "erro nao informado";
      setMessage("A prévia do relatório não foi gerada. Detalhe: " + detail + ".");
    }
  }

  async function deleteByAction(table: string, id: string, successMessage: string) {
    try {
      await appAction("delete", { table, id });
      setMessage(successMessage);
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir o registro.");
    }
  }

  async function deleteMachine(id: string) {
    if (!confirm("Excluir esta maquina e todo o historico?")) return;
    await deleteByAction("machines", id, "Máquina excluída.");
  }

  async function deleteUser(id: string) {
    if (!currentUserCanManageUsers) {
      setMessage("Seu usuario nao tem permissao para excluir usuarios.");
      return;
    }
    if (!confirm("Excluir este tecnico?")) return;
    await deleteByAction("authorized_users", id, "Tecnico excluido.");
  }

  async function deleteChatContact(id: string) {
    if (!currentUserCanUseRemoteAccess) {
      setMessage("Seu usuario nao tem permissao para excluir clientes do Acesso Remoto.");
      return;
    }
    if (!confirm("Excluir este cliente do Acesso Remoto? As conversas permanecem no historico, mas perdem o vinculo com o cadastro do cliente.")) return;
    await deleteByAction("chat_contacts", id, "Cliente excluido.");
  }

  async function deleteTravelSchedule(id: string) {
    if (!currentUserCanEditSchedule) {
      setMessage("Seu usuario tem acesso apenas para visualizar o cronograma.");
      return;
    }
    if (!confirm("Excluir este item do cronograma?")) return;
    await deleteByAction("travel_schedules", id, "Item do cronograma excluido.");
  }

  async function deleteServiceRecord(record: ServiceRecord) {
    if (!currentUserHasFullAccess && (!currentUserCanEmitReports || record.created_by !== currentUserId)) {
      setMessage("Este atendimento so pode ser excluido pelo autor ou por usuario com acesso total.");
      return;
    }
    const deletingDraft = isServiceDraft(record);
    if (!confirm(deletingDraft ? "Excluir esta prévia não finalizada?" : "Excluir este atendimento?")) return;
    const machine = machines.find((item) => item.id === record.machine_id) ?? selectedMachine;
    const filename = machine ? servicePdfFileName(machine, record) : "";
    try {
      await appAction("delete", { table: "service_records", id: record.id });
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir o atendimento.");
      return;
    }
    if (deletingDraft) {
      setMessage("Prévia excluída.");
      setSelectedServiceRecord(null);
      return;
    }
    if (machine && filename) {
      try {
        await syncServiceReportSharePoint("archive", machine, record, filename);
        setMessage("Atendimento excluido. PDF movido para Relatórios excluídos no SharePoint.");
      } catch (error) {
        const detail = error instanceof Error ? error.message : "erro nao informado";
        setMessage("Atendimento excluido, mas o PDF não foi arquivado no SharePoint. Detalhe: " + detail + ".");
      }
    } else {
      setMessage("Atendimento excluido. Não foi possível localizar a máquina para arquivar o PDF no SharePoint.");
    }
    setSelectedServiceRecord(null);
  }

  async function assignChat(conversation: ChatConversation, userEmail = currentUserEmail) {
    const normalizedTargetEmail = userEmail.toLowerCase();
    const assigningToSelf = normalizedTargetEmail === currentUserEmail.toLowerCase();

    if (assigningToSelf && remoteAccessStatus !== "Online") {
      setMessage("Seu status precisa estar Online para assumir uma conversa sem atribuicao.");
      return;
    }

    if (!assigningToSelf && !availableTransferUsers.some((user) => user.email.toLowerCase() === normalizedTargetEmail)) {
      setMessage("Transferencia permitida somente para usuarios Online.");
      return;
    }

    const target = authorizedUsers.find((user) => user.email.toLowerCase() === userEmail.toLowerCase());
    const assignedName = target?.name || displayUserName(userEmail);
    try {
      await appAction("assignChat", { conversationId: conversation.id, userEmail: normalizedTargetEmail });
      setMessage("Conversa atribuida para " + assignedName + ".");
      setTransferDialogOpen(false);
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atribuir a conversa.");
    }
  }

  async function closeChat(conversation: ChatConversation) {
    if (!confirm("Encerrar esta conversa?")) return;
    try {
      await appAction("closeChat", { conversationId: conversation.id });
      setMessage("Conversa encerrada.");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível encerrar a conversa.");
    }
  }

  async function sendChatReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedChat) return;
    if (!canReplySelectedChat) {
      setMessage("Seu status atual nao permite responder esta conversa.");
      return;
    }
    const body = chatReply.trim();
    if (!body) return;

    const response = await fetch("/api/whatsapp/send-message", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: selectedChat.id, body })
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(result?.error ?? "Não foi possível enviar a mensagem.");
      return;
    }

    setChatReply("");
    setMessage(result?.deliveryMode === "whatsapp" ? "Mensagem enviada pelo WhatsApp." : "Mensagem salva em modo de validacao. Configure a API do WhatsApp para envio externo.");
    await loadData();
  }

  async function openChatMedia(message: ChatMessage) {
    if (!message.media_id) return;

    const response = await fetch("/api/whatsapp/media/" + encodeURIComponent(message.media_id), {
      credentials: "include"
    });

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      setMessage(result?.error ?? "Não foi possível abrir a mídia do WhatsApp.");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  if (!sessionReady) return <main className="centered">Carregando...</main>;

  if (biometricRequired) {
    return (
      <main className="login-page">
        <section className="login-card">
          <Image className="login-logo" src="/tomasoni-logo-transparent.png" alt="Tomasoni" width={300} height={80} priority />
          <h1>Confirmar acesso</h1>
          <p>Use a biometria deste dispositivo para abrir o app. A renovação de acesso por e-mail continua sendo solicitada a cada 7 dias.</p>
          <button className="button primary" type="button" onClick={() => void confirmBiometricAccess()}>Confirmar por biometria</button>
          <button className="link-button auth-secondary-action" type="button" onClick={() => void signOut()}>Entrar com código</button>
          {message !== DEFAULT_MESSAGE && <span className="form-message">{message}</span>}
        </section>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="login-page">
        <form className="login-card" onSubmit={signIn}>
          <Image className="login-logo" src="/tomasoni-logo-transparent.png" alt="Tomasoni" width={300} height={80} priority />
          <label>
            E-mail corporativo
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder={`nome@${ALLOWED_EMAIL_DOMAINS[0]}`} required disabled={otpSent} />
          </label>
          {otpSent && (
            <label>
              Código de acesso
              <input value={otpCode} onChange={(event) => setOtpCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="Digite o código recebido" required />
            </label>
          )}
          <button className="button primary" type="submit" disabled={authLoading}>{authLoading ? "Enviando..." : otpSent ? "Confirmar código" : "Enviar código de acesso"}</button>
          {otpSent && <button className="link-button auth-secondary-action" type="button" disabled={authLoading} onClick={() => { setOtpSent(false); setOtpCode(""); setMessage(DEFAULT_MESSAGE); }}>Alterar e-mail</button>}
          {message !== DEFAULT_MESSAGE && <span className="form-message">{message}</span>}
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><Image src="/tomasoni-logo-transparent.png" alt="Tomasoni" width={220} height={59} priority /></div>
        <nav className="side-nav">
          <button className={`nav-item ${view === "home" ? "active" : ""}`} onClick={() => setView("home")}>Tela inicial</button>
          <button className={`nav-item ${view === "overview" ? "active" : ""}`} onClick={() => setView("overview")}>Visão geral</button>
          {currentUserCanUseRemoteAccess && <button className={`nav-item ${view === "chat" ? "active" : ""}`} onClick={() => setView("chat")}>Acesso Remoto</button>}
          {currentUserCanEditSchedule && <button className={`nav-item ${view === "schedule" ? "active" : ""}`} onClick={() => setView("schedule")}>Cronograma</button>}
          {(currentUserCanEditMachine || currentUserCanManageUsers || currentUserCanUseRemoteAccess) && <button className={`nav-item ${view === "registry" ? "active" : ""}`} onClick={() => { setRegistryTab(currentUserCanEditMachine ? "machines" : currentUserCanUseRemoteAccess ? "clients" : "users"); setView("registry"); }}>Cadastro</button>}
          {currentUserCanViewAdmin && <button className={`nav-item ${view === "admin" ? "active" : ""}`} onClick={() => setView("admin")}>Administração</button>}
        </nav>
        <div className="user-menu">
          <button className="user-menu-trigger" type="button" onClick={() => setUserMenuOpen((open) => !open)} aria-expanded={userMenuOpen}>
            <span className="avatar">{initialsFromEmail(currentUserEmail)}</span>
            <span className="user-meta">
              <strong>{currentUserName || displayUserName(currentUserEmail)}</strong>
              <small>{currentUserRole || "Usuário autorizado"}</small>
              {currentUserCanUseRemoteAccess && (
                <span className="remote-status-line">
                  <span className={`remote-status-dot ${remoteAccessStatusClass(remoteAccessStatus)}`} />
                  {remoteAccessStatus}
                </span>
              )}
            </span>
            <MoreIcon />
          </button>
          {userMenuOpen && (
            <div className="user-menu-content">
              {currentUserCanUseRemoteAccess && (
                <>
                  <button type="button" onClick={() => updateRemoteAccessStatus("Online")}><span className="menu-status-dot online" /> Online</button>
                  <button type="button" onClick={() => updateRemoteAccessStatus("Ocupado")}><span className="menu-status-dot busy" /> Ocupado</button>
                  <button type="button" onClick={() => updateRemoteAccessStatus("Offline")}><span className="menu-status-dot offline" /> Offline</button>
                </>
              )}
              {canDownloadBackup && <button type="button" onClick={downloadMachinesBackup}><PdfDownloadIcon /> Backup SharePoint</button>}
              <button type="button" onClick={signOut}><LogOutIcon /> Sair</button>
            </div>
          )}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Núcleo de Assistência</h1>
          </div>
          <div className="topbar-actions">
            <button className="icon-button utility-action" type="button" title="Ajuda da tela" aria-label="Ajuda da tela" onClick={() => setHelpOpen(true)}><HelpIcon /></button>
            <button className="icon-button utility-action" type="button" title={theme === "dark" ? "Modo claro" : "Modo escuro"} aria-label={theme === "dark" ? "Modo claro" : "Modo escuro"} onClick={toggleTheme}>{theme === "dark" ? <SunIcon /> : <MoonIcon />}</button>
            {currentUserCanEmitReports && <button className="icon-button add-action" type="button" title="Novo atendimento" aria-label="Novo atendimento" onClick={startNewService}><PlusIcon /></button>}
          </div>
        </header>

        <section className="status-band">
          <strong>{screenLegend(view, registryTab, selectedMachine)}</strong>
          {message !== DEFAULT_MESSAGE && <span>{message}</span>}
        </section>

        {view === "chat" && currentUserCanUseRemoteAccess && (
          <section className="view active chat-page">
            <section className="chat-shell">
              <aside className="chat-list-panel">
                <div className="section-header">
                  <h2>Acesso Remoto</h2>
                  <span>{chatConversations.length} registros</span>
                </div>
                <div className="chat-conversation-list">
                  {chatConversations.map((conversation) => {
                    const lastMessage = [...(conversation.chat_messages ?? [])].sort((a, b) => compareDate(b.created_at, a.created_at))[0];
                    return (
                      <button key={conversation.id} className={selectedChat?.id === conversation.id ? "active" : ""} type="button" onClick={() => setSelectedChatId(conversation.id)}>
                        <strong>{conversation.customer_name || conversation.customer_phone}</strong>
                        <span>{lastMessage?.body || "Sem mensagens"}</span>
                        <small>{chatStatusLabel(conversation.status)} · {formatDateTime(conversation.last_message_at)}</small>
                      </button>
                    );
                  })}
                  {!chatConversations.length && <p className="empty-state">Nenhuma conversa recebida ainda.</p>}
                </div>
              </aside>

              <section className="chat-main-panel">
                {selectedChat ? (
                  <>
                    <div className="chat-header">
                      <div>
                        <span className="section-kicker">Cliente</span>
                        <h2>{selectedChat.customer_name || selectedChat.customer_phone}</h2>
                        <p>{selectedChat.customer_phone} · {chatStatusLabel(selectedChat.status)}</p>
                      </div>
                      <div className="chat-actions">
                        {canAssumeSelectedChat && <button className="button ghost" type="button" onClick={() => void assignChat(selectedChat)}>Assumir</button>}
                        {selectedChat.status !== "closed" && <button className="button ghost" type="button" onClick={() => setTransferDialogOpen(true)} disabled={!canTransferSelectedChat}>Transferir</button>}
                        {selectedChat.status !== "closed" && <button className="button danger-button" type="button" onClick={() => void closeChat(selectedChat)}>Encerrar</button>}
                      </div>
                    </div>

                    <div className="chat-meta-strip">
                      <span>Responsável: <strong>{selectedChat.assigned_to_name || "Sem responsável"}</strong></span>
                      <span>Última mensagem: <strong>{formatDateTime(selectedChat.last_message_at)}</strong></span>
                      <span>Empresa: <strong>{selectedChat.customer_company || "-"}</strong></span>
                      <span>Máquina: <strong>{selectedChat.machine_code || selectedChat.machine_serial || "-"}</strong></span>
                    </div>

                    <div className="chat-message-list">
                      {[...(selectedChat.chat_messages ?? [])].sort((a, b) => compareDate(a.created_at, b.created_at)).map((chatMessage) => (
                        <article key={chatMessage.id} className={`chat-message ${chatMessage.direction}`}>
                          <div>
                            <strong>{chatMessage.direction === "inbound" ? (chatMessage.sender_name || selectedChat.customer_name || "Cliente") : chatMessage.direction === "system" ? "Sistema" : (chatMessage.sender_name || "Técnico")}</strong>
                            <small>{formatDateTime(chatMessage.created_at)}</small>
                          </div>
                          <p>{chatMessage.body}</p>
                          {chatMessage.media_id && (
                            <button className="chat-media-button" type="button" onClick={() => void openChatMedia(chatMessage)}>
                              {chatMediaLabel(chatMessage)}
                            </button>
                          )}
                        </article>
                      ))}
                    </div>

                    <form className="chat-reply-form" onSubmit={sendChatReply}>
                      <textarea value={chatReply} onChange={(event) => setChatReply(event.target.value)} placeholder="Digite a resposta ao cliente..." disabled={!canReplySelectedChat} />
                      <button className="button primary" type="submit" disabled={!canReplySelectedChat || !chatReply.trim()}>Enviar resposta</button>
                    </form>
                  </>
                ) : (
                  <div className="chat-empty-panel">
                    <h2>Nenhuma conversa selecionada</h2>
                    <p>Quando o Webhook receber mensagens do WhatsApp, elas aparecerão na fila para validação.</p>
                  </div>
                )}
              </section>

            </section>
          </section>
        )}

        {view === "overview" && (
          <section className="overview-page view active">
            <section className="kpi-grid">
              <article className="kpi-card accent">
                <span>Base instalada</span>
                <strong>{overviewData.totalMachines}</strong>
                <small>{overviewData.totalServices} atendimentos registrados</small>
              </article>
              <article className="kpi-card">
                <span>Atendimentos no mês</span>
                <strong>{overviewData.servicesThisMonth}</strong>
                <small>{overviewData.totalServices ? `${percent(overviewData.servicesThisMonth, overviewData.totalServices)}% do histórico` : "Sem histórico"}</small>
              </article>
              <article className="kpi-card success">
                <span>Contratos ativos</span>
                <strong>{overviewData.activeContracts}</strong>
                <small>{percent(overviewData.activeContracts, overviewData.totalMachines)}% da base</small>
              </article>
              <article className="kpi-card warning">
                <span>Contratos a vencer</span>
                <strong>{overviewData.expiringContracts}</strong>
                <small>Próximos 90 dias</small>
              </article>
              <article className="kpi-card">
                <span>Cobertura remota</span>
                <strong>{overviewData.remoteCoverage}%</strong>
                <small>SINEMA ou VNC cadastrados</small>
              </article>
              <article className="kpi-card danger">
                <span>Atenção operacional</span>
                <strong>{overviewData.staleMachines}</strong>
                <small>Sem atendimento há mais de 180 dias ou sem histórico</small>
              </article>
            </section>

            <section className="overview-grid">
              <article className="dashboard-card chart-card wide-card">
                <div className="card-title"><DetailIcon type="history" /><h3>Tendência de atendimentos</h3></div>
                <div className="trend-chart">
                  {overviewData.serviceTrend.map((item) => {
                    const max = Math.max(...overviewData.serviceTrend.map((entry) => entry.value), 1);
                    return (
                      <div key={item.name} className="trend-bar">
                        <span>{item.value}</span>
                        <div style={{ height: `${Math.max(8, (item.value / max) * 100)}%` }} />
                        <small>{item.name}</small>
                      </div>
                    );
                  })}
                </div>
              </article>

              <article className="dashboard-card">
                <div className="card-title"><DetailIcon type="remote" /><h3>Acesso remoto</h3></div>
                <div className="bar-list">
                  {overviewData.byAccess.map((item) => (
                    <div key={item.name}>
                      <span>{item.name}</span><strong>{item.value}</strong>
                      <em><i style={{ width: `${percent(item.value, overviewData.totalMachines)}%` }} /></em>
                    </div>
                  ))}
                </div>
              </article>

              <article className="dashboard-card">
                <div className="card-title"><DetailIcon type="check" /><h3>Contratos</h3></div>
                <div className="contract-summary-list">
                  <div><span>Ativos</span><strong>{overviewData.activeContracts}</strong></div>
                  <div><span>Em negociação</span><strong>{overviewData.negotiatingContracts}</strong></div>
                  <div><span>A vencer em 90 dias</span><strong>{overviewData.expiringContracts}</strong></div>
                  <div><span>Vencidos</span><strong>{overviewData.expiredContracts}</strong></div>
                </div>
                <div className="bar-list compact">
                  {overviewData.byContractType.map((item) => (
                    <div key={item.name}>
                      <span>{item.name}</span><strong>{item.value}</strong>
                      <em><i style={{ width: `${percent(item.value, overviewData.activeContracts)}%` }} /></em>
                    </div>
                  ))}
                </div>
              </article>

              <article className="dashboard-card">
                <div className="card-title"><DetailIcon type="software" /><h3>Modelos</h3></div>
                <div className="bar-list">
                  {overviewData.byModel.map((item) => (
                    <div key={item.name}>
                      <span>{item.name}</span><strong>{item.value}</strong>
                      <em><i style={{ width: `${percent(item.value, overviewData.totalMachines)}%` }} /></em>
                    </div>
                  ))}
                </div>
              </article>

              <article className="dashboard-card">
                <div className="card-title"><DetailIcon type="software" /><h3>Softwares por VM</h3></div>
                <div className="bar-list">
                  {overviewData.byVmSoftware.length ? overviewData.byVmSoftware.map((item) => (
                    <div key={item.name}>
                      <span>{item.name}</span><strong>{item.value}</strong>
                      <em><i style={{ width: `${percent(item.value, Math.max(...overviewData.byVmSoftware.map((entry) => entry.value), 1))}%` }} /></em>
                    </div>
                  )) : <p className="empty-card-note">Nenhum código de software com VM cadastrada.</p>}
                </div>
              </article>

              <article className="dashboard-card geo-card">
                <div className="card-title"><DetailIcon type="location" /><h3>Geolocalização</h3><span className="soft-pill">Estados / cidades</span></div>
                <div className="geo-panel">
                  <div className={`real-map ${mapMode === "fallback" ? "fallback-map" : ""}`} ref={overviewMapRef} aria-label="Mapa de máquinas por estado e cidade">
                    {mapMode !== "leaflet" && (
                      <div className="map-fallback">
                        <span className="map-label north">Brasil</span>
                        <span className="map-label south">Sul / Sudeste</span>
                        {overviewData.geoStates.map((item) => {
                          const center = STATE_CENTERS[item.state];
                          if (!center) return null;
                          return (
                            <button
                              key={item.state}
                              className={`map-fallback-marker ${focusedMapState === item.state ? "active" : ""}`}
                              style={mapPointPosition(center)}
                              type="button"
                              title={`${item.state}: ${item.value} máquina${item.value === 1 ? "" : "s"}`}
                              onClick={() => focusOverviewMapState(item.state)}
                            >
                              <span>{item.state}</span>
                              <strong>{item.value}</strong>
                            </button>
                          );
                        })}
                        {mapMode === "loading" && <em>Carregando mapa...</em>}
                      </div>
                    )}
                  </div>
                  <div className="state-map-list">
                    {overviewData.byState.map((item) => (
                      <button
                        key={item.name}
                        className={focusedMapState === item.name ? "active" : ""}
                        type="button"
                        onClick={() => focusOverviewMapState(item.name)}
                      >
                        <span>{item.name}</span>
                        <strong>{item.value}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              </article>

              <article className="dashboard-card">
                <div className="card-title"><DetailIcon type="client" /><h3>Clientes com mais máquinas</h3></div>
                <div className="bar-list">
                  {overviewData.byClient.map((item) => (
                    <div key={item.name}>
                      <span>{item.name}</span><strong>{item.value}</strong>
                      <em><i style={{ width: `${percent(item.value, overviewData.totalMachines)}%` }} /></em>
                    </div>
                  ))}
                </div>
              </article>

              <article className="dashboard-card">
                <div className="card-title"><DetailIcon type="history" /><h3>Clientes mais atendidos</h3></div>
                <div className="bar-list">
                  {overviewData.byClientServices.map((item) => (
                    <div key={item.name}>
                      <span>{item.name}</span><strong>{item.value}</strong>
                      <em><i style={{ width: `${percent(item.value, overviewData.totalServices)}%` }} /></em>
                    </div>
                  ))}
                </div>
              </article>

              <article className="dashboard-card service-type-card">
                <div className="card-title"><DetailIcon type="info" /><h3>Tipo de atendimento</h3></div>
                <div className="donut-panel">
                  <div className="donut" style={{ ["--value" as string]: `${percent(overviewData.byServiceType.find((item) => item.name === "Acesso remoto")?.value ?? 0, overviewData.totalServices)}%` }}>
                    <strong>{percent(overviewData.byServiceType.find((item) => item.name === "Acesso remoto")?.value ?? 0, overviewData.totalServices)}%</strong>
                    <span>Remoto</span>
                  </div>
                  <div className="mini-list">
                    {overviewData.byServiceType.map((item) => <div key={item.name}><span>{item.name}</span><strong>{item.value}</strong></div>)}
                  </div>
                </div>
              </article>

              <article className="dashboard-card overview-table-card service-rank-card">
                <div className="card-title"><DetailIcon type="history" /><h3>Máquinas com mais atendimentos</h3></div>
                <div className="overview-table">
                  {overviewData.topMachinesByService.map(({ machine, value }) => (
                    <button key={machine.id} type="button" onClick={() => { setSelectedMachineId(machine.id); setHistoryFilter(""); setView("machineDetail"); }}>
                      <span>{displayMachineCode(machine)}</span>
                      <em>{machine.client || "-"}</em>
                      <strong>{value}</strong>
                    </button>
                  ))}
                </div>
              </article>

              <article className="dashboard-card overview-table-card attention-rank-card">
                <div className="card-title"><DetailIcon type="alert" /><h3>Máquinas para atenção</h3></div>
                <div className="overview-table">
                  {overviewData.machineAttention.map(({ machine, lastDate, days }) => (
                    <button key={machine.id} type="button" onClick={() => { setSelectedMachineId(machine.id); setHistoryFilter(""); setView("machineDetail"); }}>
                      <span>{displayMachineCode(machine)}</span>
                      <em>{lastDate ? `Último: ${formatDate(lastDate)}` : "Sem histórico"}</em>
                      <strong>{days === null ? "-" : `${days}d`}</strong>
                    </button>
                  ))}
                </div>
              </article>

              <article className="dashboard-card overview-table-card recent-rank-card">
                <div className="card-title"><DetailIcon type="detail" /><h3>Últimos atendimentos</h3></div>
                <div className="overview-table">
                  {overviewData.recentServices.map(({ machine, record }) => (
                    <button key={record.id} type="button" onClick={() => { setSelectedMachineId(machine.id); setSelectedServiceRecord(record); }}>
                      <span>{record.issue_summary || record.equipment || "Atendimento"}</span>
                      <em>{displayMachineCode(machine)} - {formatDate(record.service_date)}</em>
                      <strong>{normalizeServiceType(record.service_type).replace("Acesso remoto", "Remoto").replace("Visita técnica", "Visita")}</strong>
                    </button>
                  ))}
                </div>
              </article>
            </section>
          </section>
        )}

        {view === "admin" && currentUserCanViewAdmin && (
          <section className="admin-page view active">
            <section className="kpi-grid">
              <article className="kpi-card accent">
                <span>Usuários autorizados</span>
                <strong>{authorizedUsers.length}</strong>
                <small>{authorizedUsers.filter((user) => hasFullAccess(user.role)).length} com acesso total</small>
              </article>
              <article className="kpi-card">
                <span>Máquinas cadastradas</span>
                <strong>{machines.length}</strong>
                <small>{machines.filter((machine) => machine.updated_at).length} registros monitorados</small>
              </article>
              <article className="kpi-card">
                <span>Relatórios</span>
                <strong>{overviewData.totalServices}</strong>
                <small>{overviewData.servicesThisMonth} no mês atual</small>
              </article>
              <article className="kpi-card success">
                <span>Contratos</span>
                <strong>{supportContracts.length}</strong>
                <small>{overviewData.activeContracts} ativos</small>
              </article>
              <article className="kpi-card warning">
                <span>Migrations locais</span>
                <strong>{adminMigrations.length}</strong>
                <small>Últimas versionadas</small>
              </article>
              <article className="kpi-card">
                <span>Eventos auditados</span>
                <strong>{adminAuditLogs.length}</strong>
                <small>Últimos registros carregados</small>
              </article>
            </section>

            <section className="admin-grid">
              <article className="dashboard-card admin-info-card">
                <div className="card-title"><DetailIcon type="software" /><h3>Deploy e ambiente</h3></div>
                <div className="admin-info-list">
                  <div><span>Ambiente</span><strong>{adminDeployment?.environment || "-"}</strong></div>
                  <div><span>URL</span><strong>{adminDeployment?.url || "-"}</strong></div>
                  <div><span>Commit</span><strong>{shortCommit(adminDeployment?.commit_sha)}</strong></div>
                  <div><span>Mensagem</span><strong title={adminDeployment?.commit_message || ""}>{adminDeployment?.commit_message || "-"}</strong></div>
                  <div><span>Autor</span><strong>{adminDeployment?.commit_author || "-"}</strong></div>
                  <div><span>Região</span><strong>{adminDeployment?.region || "-"}</strong></div>
                  <div><span>Runtime</span><strong>{adminDeployment?.node_env || "-"}</strong></div>
                  <div><span>Leitura</span><strong>{formatLongDateTime(adminDeployment?.generated_at)}</strong></div>
                </div>
              </article>

              <article className="dashboard-card admin-info-card">
                <div className="card-title"><DetailIcon type="history" /><h3>Migrations recentes</h3></div>
                <div className="admin-migration-list">
                  {adminMigrations.length ? adminMigrations.slice(0, 8).map((migration) => (
                    <div key={migration.file}>
                      <span>{migration.version}</span>
                      <strong title={migration.file}>{migration.name || migration.file}</strong>
                      <small>{formatLongDateTime(migration.updated_at)}</small>
                    </div>
                  )) : <p className="empty-card-note">Nenhuma migration local encontrada.</p>}
                </div>
              </article>

              <article className="dashboard-card admin-info-card">
                <div className="card-title"><DetailIcon type="check" /><h3>Permissões e módulos</h3></div>
                <div className="admin-info-list">
                  <div><span>Admin</span><strong>{authorizedUsers.filter((user) => user.role === "Admin").length}</strong></div>
                  <div><span>Diretoria</span><strong>{authorizedUsers.filter((user) => user.role === "Diretoria").length}</strong></div>
                  <div><span>Montagens</span><strong>{authorizedUsers.filter((user) => isAssemblyRole(user.role)).length}</strong></div>
                  <div><span>Controladoria</span><strong>{authorizedUsers.filter((user) => user.role === "Controladoria").length}</strong></div>
                  <div><span>Acesso Remoto</span><strong>{authorizedUsers.filter((user) => user.remote_access_allowed).length}</strong></div>
                  <div><span>Acesso a senhas</span><strong>{authorizedUsers.filter((user) => user.credential_access_allowed).length}</strong></div>
                  <div><span>Conversas</span><strong>{chatConversations.length}</strong></div>
                  <div><span>Clientes do chat</span><strong>{chatContacts.length}</strong></div>
                </div>
              </article>

              <article className="dashboard-card admin-audit-card admin-wide-card">
                <div className="card-title"><DetailIcon type="detail" /><h3>Últimas ações dos usuários</h3></div>
                <div className="admin-audit-list">
                  {adminAuditLogs.length ? adminAuditLogs.map((log) => (
                    <article key={log.id} className="admin-audit-item">
                      <time>{formatLongDateTime(log.created_at)}</time>
                      <div>
                        <strong>{auditActionLabel(log.action)}</strong>
                        <span>{auditEntityLabel(log.entity)} · {log.entity_label || auditDetailsSummary(log)}</span>
                        <p>{auditDetailsSummary(log)}</p>
                      </div>
                      <small>{log.user_name || displayUserName(log.user_email || "")}<br />{log.user_role || "-"}</small>
                    </article>
                  )) : (
                    <p className="empty-card-note">
                      Nenhuma ação auditada ainda. Aplique a migration 035_admin_audit_logs.sql para iniciar o registro das próximas operações.
                    </p>
                  )}
                </div>
              </article>
            </section>
          </section>
        )}

        {view === "home" && (
          <section className="view active">
            <div className="search-panel">
              <label>Filtrar máquinas<input value={machineFilter} onChange={(event) => setMachineFilter(event.target.value)} placeholder="Código, modelo, cliente..." /></label>
            </div>
            <section className="table-panel">
              <div className="section-header"><h2>Máquinas cadastradas</h2><span>{filteredMachines.length} registros</span></div>
              <div className="table-wrap">
                <table className="home-table">
                  <thead><tr>
                    <th><button className="sort-header" type="button" onClick={() => toggleMachineSort("code")}>Código <span>{sortMark(machineSort.key === "code", machineSort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleMachineSort("model")}>Modelo <span>{sortMark(machineSort.key === "model", machineSort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleMachineSort("client")}>Cliente <span>{sortMark(machineSort.key === "client", machineSort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleMachineSort("unit_city")}>Unidade / Cidade <span>{sortMark(machineSort.key === "unit_city", machineSort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleMachineSort("manufacture_month")}>Fabricação <span>{sortMark(machineSort.key === "manufacture_month", machineSort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleMachineSort("vm")}>VM <span>{sortMark(machineSort.key === "vm", machineSort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleMachineSort("last_service")}>Último atendimento <span>{sortMark(machineSort.key === "last_service", machineSort.direction)}</span></button></th>
                  </tr></thead>
                  <tbody>
                    {filteredMachines.map((machine) => (
                      <tr key={machine.id}>
                        <td><button className="link-button" onClick={() => { setSelectedMachineId(machine.id); setHistoryFilter(""); setView("machineDetail"); }}>{displayMachineCode(machine)}</button></td>
                        <td>{machine.model || "-"}</td>
                        <td>{machine.client || "-"}</td>
                        <td>{machine.unit_city || "-"}</td>
                        <td>{formatMonthYear(machine.manufacture_month)}</td>
                        <td>{machine.vm || "-"}</td>
                        <td>{formatDate(lastServiceDate(machine))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        )}

        {view === "schedule" && currentUserCanEditSchedule && (
          <section className="view active schedule-page">
            {currentUserCanManageContracts && (
              <section className="table-panel">
                <div className="section-header">
                  <h2>Cronograma</h2>
                  <div className="segmented-control" aria-label="Tipo de registro">
                    <button className={scheduleTab === "travel" ? "active" : ""} type="button" onClick={() => setScheduleTab("travel")}>Registro de viagens</button>
                    <button className={scheduleTab === "contracts" ? "active" : ""} type="button" onClick={() => setScheduleTab("contracts")}>Contratos</button>
                  </div>
                </div>
              </section>
            )}

            {scheduleTab === "travel" && currentUserCanEditSchedule && (
              <form className="form-panel" onSubmit={saveTravelSchedule}>
                <div className="section-header">
                  <h2>{editingTravelId ? "Alterar viagem" : "Registrar viagem"}</h2>
                  <div className="actions-row">
                    {editingTravelId && <button className="button ghost" type="button" onClick={() => { setEditingTravelId(""); setTravelForm(EMPTY_TRAVEL_FORM); }}>Cancelar</button>}
                    <button className="icon-button save-action" title="Salvar cronograma" aria-label="Salvar cronograma"><SaveIcon /></button>
                  </div>
                </div>
                <div className="fields-grid">
                  <label>Data de início<input value={travelForm.start_date} onChange={(event) => setTravelForm((current) => ({ ...current, start_date: /^a/i.test(event.target.value) ? event.target.value : formatDayMonthInput(event.target.value) }))} placeholder="dd/mm ou A definir" maxLength={10} /></label>
                  <label>Data de fim<input value={travelForm.end_date} onChange={(event) => setTravelForm((current) => ({ ...current, end_date: /^a/i.test(event.target.value) ? event.target.value : formatDayMonthInput(event.target.value) }))} placeholder="dd/mm ou A definir" maxLength={10} /></label>
                  <label>Código do cliente<input list="travel-code-suggestions" value={travelForm.code} onChange={(event) => setTravelForm((current) => ({ ...current, code: formatTravelClientCodeInput(event.target.value) }))} placeholder="Cxxx" maxLength={4} /></label>
                  <datalist id="travel-code-suggestions">{travelCodeSuggestions.map((code) => <option key={code} value={code} />)}</datalist>
                  <label>Cliente<input list="client-suggestions" value={travelForm.client} onChange={(event) => setTravelForm((current) => ({ ...current, client: event.target.value }))} /></label>
                  <label>Técnicos<input value={travelForm.technicians} onChange={(event) => setTravelForm((current) => ({ ...current, technicians: event.target.value }))} placeholder="Nomes separados por vírgula" /></label>
                  <label>Status<input list="travel-status-suggestions" value={travelForm.status} onChange={(event) => setTravelForm((current) => ({ ...current, status: event.target.value }))} placeholder="Digite ou selecione" /></label>
                  <datalist id="travel-status-suggestions">
                    {TRAVEL_STATUS_OPTIONS.map((option) => <option key={option} value={option} />)}
                  </datalist>
                  <label className="wide">Motivo<textarea rows={3} value={travelForm.reason} onChange={(event) => setTravelForm((current) => ({ ...current, reason: event.target.value }))} /></label>
                </div>
              </form>
            )}

            {scheduleTab === "contracts" && currentUserCanManageContracts && (
              <>
                <form className="form-panel" onSubmit={saveSupportContract}>
                  <div className="section-header">
                    <h2>{editingContractId ? "Alterar contrato" : "Registrar contrato"}</h2>
                    <div className="actions-row">
                      {editingContractId && <button className="button ghost" type="button" onClick={() => { setEditingContractId(""); setContractForm(EMPTY_CONTRACT_FORM); }}>Cancelar</button>}
                      <button className="icon-button save-action" title="Salvar contrato" aria-label="Salvar contrato"><SaveIcon /></button>
                    </div>
                  </div>
                  <div className="fields-grid">
                    <label>Número de série<input list="contract-serial-suggestions" value={contractForm.serial} onChange={(event) => updateContractSerial(event.target.value)} placeholder="500-xxx ou 500-697/22" maxLength={12} /></label>
                    <datalist id="contract-serial-suggestions">
                      {machines.filter((machine) => machine.serial?.trim()).map((machine) => <option key={machine.id} value={machine.serial ?? ""}>{displayMachineCode(machine)} - {machine.client || "Cliente não informado"}</option>)}
                    </datalist>
                    <label>Máquina vinculada<select value={contractForm.machine_id} onChange={(event) => updateContractMachine(event.target.value)}>
                      <option value="">Selecionar manualmente, se necessário</option>
                      {machines.map((machine) => <option key={machine.id} value={machine.id}>{displayMachineCode(machine)} - {machine.client || "Cliente não informado"}</option>)}
                    </select></label>
                    <label>Código<input value={contractForm.code} onChange={(event) => setContractForm((current) => ({ ...current, code: event.target.value }))} placeholder="T665-xxx" maxLength={10} /></label>
                    <label>Cliente<input list="client-suggestions" value={contractForm.client} onChange={(event) => setContractForm((current) => ({ ...current, client: event.target.value }))} /></label>
                    <label>Status do contrato<select value={contractForm.status} onChange={(event) => setContractForm((current) => ({ ...current, status: event.target.value as ContractStatus }))}>
                      {CONTRACT_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select></label>
                    <label>Tipo de contrato<select value={contractForm.contract_type} onChange={(event) => setContractForm((current) => ({ ...current, contract_type: event.target.value }))}>
                      <option value="">Selecione</option>
                      {CONTRACT_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select></label>
                    <label>Final de vigência<input value={contractForm.support_contract_until} onChange={(event) => setContractForm((current) => ({ ...current, support_contract_until: formatFullDateInput(event.target.value) }))} placeholder="dd/mm/aaaa" maxLength={10} /></label>
                  </div>
                </form>

                <section className="table-panel">
                  <div className="section-header"><h2>Contratos cadastrados</h2><span>{supportContracts.length} registros</span></div>
                  <div className="table-wrap">
                    <table className="compact-table schedule-table">
                      <thead><tr><th>Código</th><th>Cliente</th><th>Número de série</th><th>Tipo</th><th>Status</th><th>Fim da vigência</th><th>Prazo</th><th>Ações</th></tr></thead>
                      <tbody>{supportContracts.map((contract) => {
                        const remainingDays = daysUntil(contract.support_contract_until);
                        const status = contractStatus(contract);
                        return (
                          <tr key={contract.id}>
                            <td>{contract.code || "-"}</td>
                            <td>{contract.client || "-"}</td>
                            <td>{contract.serial || "-"}</td>
                            <td>{contract.contract_type || "-"}</td>
                            <td><span className={`soft-pill ${status === "Inativo" ? "danger-pill" : status === "Em negociação" ? "warning-pill" : ""}`}>{status}</span></td>
                            <td>{formatDate(contract.support_contract_until)}</td>
                            <td>{remainingDays === null ? "-" : remainingDays >= 0 ? `${remainingDays} dias` : `Vencido há ${Math.abs(remainingDays)} dias`}</td>
                            <td>
                              <div className="row-actions">
                                <button className="icon-button menu-trigger" type="button" title="Ações" aria-label={`Ações do contrato ${contract.code || contract.serial || contract.id}`} onClick={(event) => toggleActionMenu(`contract-${contract.id}`, event)}><MoreIcon /></button>
                                {openActionMenu === `contract-${contract.id}` && (
                                  <div className="row-menu floating-row-menu" style={actionMenuPosition ?? undefined}>
                                    <button type="button" onClick={() => { editSupportContract(contract); setOpenActionMenu(""); }}><EditIcon /> Alterar contrato</button>
                                    <button className="danger" type="button" onClick={() => { void deleteSupportContract(contract.id); setOpenActionMenu(""); }}><TrashIcon /> Excluir</button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            {scheduleTab === "travel" && (
            <section className="table-panel">
              <div className="section-header"><h2>Cronograma de viagens</h2><span>{openTravelSchedules.length} registros</span></div>
              <div className="table-wrap">
                <table className="compact-table schedule-table">
                  <thead>
                    <tr>
                      <th><button className="sort-header" type="button" onClick={() => toggleTravelSort("start_date")}>Início <span>{sortMark(travelSort.key === "start_date", travelSort.direction)}</span></button></th>
                      <th><button className="sort-header" type="button" onClick={() => toggleTravelSort("end_date")}>Fim <span>{sortMark(travelSort.key === "end_date", travelSort.direction)}</span></button></th>
                      <th><button className="sort-header" type="button" onClick={() => toggleTravelSort("code")}>Código <span>{sortMark(travelSort.key === "code", travelSort.direction)}</span></button></th>
                      <th><button className="sort-header" type="button" onClick={() => toggleTravelSort("client")}>Cliente <span>{sortMark(travelSort.key === "client", travelSort.direction)}</span></button></th>
                      <th><button className="sort-header" type="button" onClick={() => toggleTravelSort("technicians")}>Técnicos <span>{sortMark(travelSort.key === "technicians", travelSort.direction)}</span></button></th>
                      <th><button className="sort-header" type="button" onClick={() => toggleTravelSort("status")}>Status <span>{sortMark(travelSort.key === "status", travelSort.direction)}</span></button></th>
                      <th><button className="sort-header" type="button" onClick={() => toggleTravelSort("reason")}>Motivo <span>{sortMark(travelSort.key === "reason", travelSort.direction)}</span></button></th>
                      {currentUserCanEditSchedule && <th>Ações</th>}
                    </tr>
                  </thead>
                  <tbody>{openTravelSchedules.map((item) => (
                    <tr key={item.id}>
                      <td>{item.start_date || "-"}</td>
                      <td>{item.end_date || "-"}</td>
                      <td>{item.code || "-"}</td>
                      <td>{item.client || "-"}</td>
                      <td>{item.technicians || "-"}</td>
                      <td><span className="soft-pill">{item.status || "-"}</span></td>
                      <td>{item.reason || "-"}</td>
                      {currentUserCanEditSchedule && (
                        <td>
                          <div className="row-actions">
                            <button className="icon-button menu-trigger" type="button" title="Ações" aria-label={`Ações da viagem ${item.code || item.client || item.id}`} onClick={(event) => toggleActionMenu(`travel-${item.id}`, event)}><MoreIcon /></button>
                            {openActionMenu === `travel-${item.id}` && (
                              <div className="row-menu floating-row-menu" style={actionMenuPosition ?? undefined}>
                                <button type="button" onClick={() => { editTravelSchedule(item); setOpenActionMenu(""); }}><EditIcon /> Alterar viagem</button>
                                <button className="danger" type="button" onClick={() => { void deleteTravelSchedule(item.id); setOpenActionMenu(""); }}><TrashIcon /> Excluir</button>
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
            )}

            {scheduleTab === "travel" && (
            <section className="table-panel">
              <div className="section-header"><h2>Viagens concluídas</h2><span>{completedTravelSchedules.length} registros</span></div>
              <div className="table-wrap">
                <table className="compact-table schedule-table">
                  <thead>
                    <tr>
                      <th><button className="sort-header" type="button" onClick={() => toggleCompletedTravelSort("start_date")}>Início <span>{sortMark(completedTravelSort.key === "start_date", completedTravelSort.direction)}</span></button></th>
                      <th><button className="sort-header" type="button" onClick={() => toggleCompletedTravelSort("end_date")}>Fim <span>{sortMark(completedTravelSort.key === "end_date", completedTravelSort.direction)}</span></button></th>
                      <th><button className="sort-header" type="button" onClick={() => toggleCompletedTravelSort("code")}>Código <span>{sortMark(completedTravelSort.key === "code", completedTravelSort.direction)}</span></button></th>
                      <th><button className="sort-header" type="button" onClick={() => toggleCompletedTravelSort("client")}>Cliente <span>{sortMark(completedTravelSort.key === "client", completedTravelSort.direction)}</span></button></th>
                      <th><button className="sort-header" type="button" onClick={() => toggleCompletedTravelSort("technicians")}>Técnicos <span>{sortMark(completedTravelSort.key === "technicians", completedTravelSort.direction)}</span></button></th>
                      <th><button className="sort-header" type="button" onClick={() => toggleCompletedTravelSort("status")}>Status <span>{sortMark(completedTravelSort.key === "status", completedTravelSort.direction)}</span></button></th>
                      <th><button className="sort-header" type="button" onClick={() => toggleCompletedTravelSort("reason")}>Motivo <span>{sortMark(completedTravelSort.key === "reason", completedTravelSort.direction)}</span></button></th>
                      {currentUserCanEditSchedule && <th>Ações</th>}
                    </tr>
                  </thead>
                  <tbody>{completedTravelSchedules.map((item) => (
                    <tr key={item.id}>
                      <td>{item.start_date || "-"}</td>
                      <td>{item.end_date || "-"}</td>
                      <td>{item.code || "-"}</td>
                      <td>{item.client || "-"}</td>
                      <td>{item.technicians || "-"}</td>
                      <td><span className="soft-pill">{item.status || "-"}</span></td>
                      <td>{item.reason || "-"}</td>
                      {currentUserCanEditSchedule && (
                        <td>
                          <div className="row-actions">
                            <button className="icon-button menu-trigger" type="button" title="Ações" aria-label={`Ações da viagem concluída ${item.code || item.client || item.id}`} onClick={(event) => toggleActionMenu(`travel-done-${item.id}`, event)}><MoreIcon /></button>
                            {openActionMenu === `travel-done-${item.id}` && (
                              <div className="row-menu floating-row-menu" style={actionMenuPosition ?? undefined}>
                                <button type="button" onClick={() => { editTravelSchedule(item); setOpenActionMenu(""); }}><EditIcon /> Alterar viagem</button>
                                <button className="danger" type="button" onClick={() => { void deleteTravelSchedule(item.id); setOpenActionMenu(""); }}><TrashIcon /> Excluir</button>
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
            )}
          </section>
        )}

        {view === "machineDetail" && selectedMachine && (
          <section className="machine-dashboard view active">
            <section className="machine-hero">
              <div className="machine-hero-main">
                <div className="machine-title-row">
                  <h2>{selectedMachine.model || "Máquina"}</h2>
                  <span className="code-pill">{displayMachineCode(selectedMachine)}</span>
                </div>
                <div className="machine-metrics">
                  <div><DetailIcon type="client" /><p><span>Cliente</span><strong>{selectedMachine.client || "-"}</strong></p></div>
                  <div><DetailIcon type="serial" /><p><span>Número de série</span><strong>{selectedMachine.serial || "-"}</strong></p></div>
                  <div><DetailIcon type="calendar" /><p><span>Fabricação</span><strong>{formatMonthYear(selectedMachine.manufacture_month)}</strong></p></div>
                  <div><DetailIcon type="location" /><p><span>Localização</span><strong>{selectedMachine.unit_city || "-"}</strong></p></div>
                  <div><DetailIcon type="mechanical" /><p><span>Lista Mecânica</span><strong>{selectedMachine.mechanical_list || "-"}</strong></p></div>
                  <div className="metric-wide"><DetailIcon type="detail" /><p><span>Descrição</span><strong>{selectedMachine.description || "-"}</strong></p></div>
                </div>
              </div>
              <aside className={`contract-card ${selectedMachineContractStatus === "Ativo" ? "active" : selectedMachineContractStatus === "Em negociação" ? "negotiating" : "inactive"}`}>
                <DetailIcon type={selectedMachineContractStatus === "Ativo" ? "check" : selectedMachineContractStatus === "Em negociação" ? "history" : "alert"} />
                <strong>{selectedMachineContractStatus === "Ativo" ? "Contrato Ativo" : selectedMachineContractStatus === "Em negociação" ? "Em negociação" : "Sem contrato ativo"}</strong>
                {selectedMachineHasContractInfo && selectedMachineContract && (
                  <>
                    <span>Tipo de contrato</span>
                    <b>{selectedMachineContract.contract_type || "-"}</b>
                    <span>Fim da vigência</span>
                    <em>{formatDate(selectedMachineContract.support_contract_until)}</em>
                    {selectedMachineContractDays !== null && <small>{selectedMachineContractDays >= 0 ? `Faltam ${selectedMachineContractDays} dias` : `Vencido há ${Math.abs(selectedMachineContractDays)} dias`}</small>}
                  </>
                )}
              </aside>
            </section>

            <section className="dashboard-grid">
              <article className="dashboard-card">
                <div className="card-title"><DetailIcon type="software" /><h3>Software</h3></div>
                <dl className="spec-list">
                  <div><dt>Software</dt><dd><span className="soft-pill">{selectedMachine.software_version || "-"}</span></dd></div>
                  <div><dt>Código do software</dt><dd>{selectedMachine.software_code || "-"}</dd></div>
                  <div><dt>VM</dt><dd>{selectedMachine.vm || "-"}</dd></div>
                  <div><dt>Faixa de IP</dt><dd>{selectedMachine.ip_range || "-"}</dd></div>
                  <div><dt>Último atendimento</dt><dd>{formatDate(lastServiceDate(selectedMachine))}</dd></div>
                </dl>
              </article>

              <article className="dashboard-card remote-access-card">
                <div className="card-title"><DetailIcon type="remote" /><h3>Acesso Remoto</h3><span className="soft-pill">{selectedMachineAccess}</span></div>
                <dl className="spec-list">
                  {selectedMachineAccess === "VNC" && (
                    <>
                      <div><dt>IP de acesso</dt><dd>{selectedMachine.vnc_ip || "-"}</dd></div>
                      <div><dt>Usuário VM</dt><dd>{selectedMachine.vnc_user || "-"}</dd></div>
                      <div><dt>Senha</dt><dd>{currentUserCanAccessCredentials ? selectedMachine.vnc_password || "-" : "Protegida"}</dd></div>
                      <div><dt>Senha VM</dt><dd>{currentUserCanAccessCredentials ? selectedMachine.vnc_vm_password || "-" : "Protegida"}</dd></div>
                      <div><dt>Observações</dt><dd>{selectedMachine.vnc_notes || "-"}</dd></div>
                    </>
                  )}
                  {selectedMachineAccess === "SINEMA" && (
                    <>
                      <div><dt>Device Name</dt><dd>{selectedMachine.sinema_url || "-"}</dd></div>
                      <div><dt>Subnet Name</dt><dd>{selectedMachine.sinema_user || "-"}</dd></div>
                      <div><dt>Observações</dt><dd>{selectedMachine.sinema_notes || "-"}</dd></div>
                    </>
                  )}
                  {selectedMachineAccess === "Sem acesso remoto" && <div><dt>Status</dt><dd>Sem acesso remoto cadastrado</dd></div>}
                </dl>
              </article>

              <article className="dashboard-card history-card">
                <div className="card-title"><DetailIcon type="history" /><h3>Histórico de Atendimentos</h3><button className="button ghost" type="button" onClick={showFullHistory}>Ver todos</button></div>
                <div className="history-list">
                  {selectedMachineRecentHistory.length ? selectedMachineRecentHistory.map((record) => (
                    <button key={record.id} type="button" onClick={() => setSelectedServiceRecord(record)}>
                      <span>{formatDate(record.service_date)}</span>
                      <strong>{record.issue_summary || record.equipment || "Atendimento"}</strong>
                      <em>{normalizeServiceType(record.service_type)}</em>
                    </button>
                  )) : <p>Nenhum atendimento registrado.</p>}
                </div>
              </article>
            </section>

            <section className="dashboard-card quick-actions-card">
              <div className="card-title"><DetailIcon type="mechanical" /><h3>Ações rápidas</h3></div>
              <div className="quick-action-grid">
                {currentUserCanEmitReports && <button type="button" onClick={startNewService}><PlusIcon /><span>Novo atendimento</span></button>}
                {currentUserCanEditMachine && <button type="button" onClick={() => { setEditingMachineId(selectedMachine.id); setRegistryTab("machines"); setView("registry"); }}><EditIcon /><span>Alterar cadastro</span></button>}
                <button type="button" onClick={() => selectedMachineRecentHistory[0] && downloadServicePdf(selectedMachine, pdfReadyServiceRecord(selectedMachineRecentHistory[0]))} disabled={!selectedMachineRecentHistory.length}><PdfDownloadIcon /><span>Baixar último PDF</span></button>
              </div>
            </section>

            {selectedMachineDraftReports.length > 0 && (
              <section className="dashboard-card draft-history-card">
                <div className="section-header">
                  <div>
                    <h2>Prévias não finalizadas</h2>
                    <p>Relatórios salvos para revisão, assinatura ou envio posterior.</p>
                  </div>
                  <span>{selectedMachineDraftReports.length} pendente{selectedMachineDraftReports.length === 1 ? "" : "s"}</span>
                </div>
                <div className="table-wrap">
                  <table className="history-table">
                    <thead><tr>
                      <th>Data</th>
                      <th>Equipamento</th>
                      <th>Técnico</th>
                      <th>Motivo breve</th>
                      <th>Ações</th>
                    </tr></thead>
                    <tbody>
                      {selectedMachineDraftReports.map((record) => (
                        <tr key={record.id}>
                          <td>{formatDate(record.service_date)}</td>
                          <td>{record.equipment || "-"}</td>
                          <td>{record.technician_name}</td>
                          <td>{record.issue_summary || "-"}</td>
                          <td>
                            <div className="row-actions">
                              <button className="icon-button menu-trigger" type="button" title="Ações" aria-label="Ações da prévia" onClick={(event) => toggleActionMenu(`draft-service-${record.id}`, event)}><MoreIcon /></button>
                              {openActionMenu === `draft-service-${record.id}` && (
                                <div className="row-menu floating-row-menu" style={actionMenuPosition ?? undefined}>
                                  <button type="button" onClick={() => { void openServiceDraftPreview(record); setOpenActionMenu(""); }}><PdfDownloadIcon /> Abrir prévia</button>
                                  {currentUserCanEmitReports && record.created_by === currentUserId && <button type="button" onClick={() => { startServiceEdit(record); setOpenActionMenu(""); }}><EditIcon /> Editar</button>}
                                  {currentUserCanEmitReports && record.created_by === currentUserId && <button type="button" onClick={() => { void openServiceDraftPreview(record); setOpenActionMenu(""); }}><DetailIcon type="mail" /> Finalizar</button>}
                                  {(currentUserHasFullAccess || (currentUserCanEmitReports && record.created_by === currentUserId)) && <button className="danger" type="button" onClick={() => { void deleteServiceRecord(record); setOpenActionMenu(""); }}><TrashIcon /> Excluir</button>}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="dashboard-card full-history-card" id="full-machine-history">
              <div className="section-header"><h2>Histórico completo de {displayMachineCode(selectedMachine)}</h2><span>{filteredHistory.length} registros</span></div>
              <label>Filtrar histórico<input value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)} /></label>
              <div className="table-wrap">
                <table className="history-table">
                  <thead><tr>
                    <th><button className="sort-header" type="button" onClick={() => toggleHistorySort("service_date")}>Data <span>{sortMark(historySort.key === "service_date", historySort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleHistorySort("equipment")}>Equipamento <span>{sortMark(historySort.key === "equipment", historySort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleHistorySort("technician_name")}>Técnico <span>{sortMark(historySort.key === "technician_name", historySort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleHistorySort("issue_summary")}>Motivo breve <span>{sortMark(historySort.key === "issue_summary", historySort.direction)}</span></button></th>
                    <th>Ações</th>
                  </tr></thead>
                  <tbody>
                    {filteredHistory.map((record) => (
                      <tr key={record.id} className="clickable-row" onClick={() => setSelectedServiceRecord(record)}>
                        <td>{formatDate(record.service_date)}</td>
                        <td>{record.equipment || "-"}</td>
                        <td>{record.technician_name}</td>
                        <td>{record.issue_summary || "-"}</td>
                        <td>
                          <div className="row-actions" onClick={(event) => event.stopPropagation()}>
                            <button className="icon-button menu-trigger" type="button" title="Ações" aria-label="Ações do atendimento" onClick={(event) => toggleActionMenu(`service-${record.id}`, event)}><MoreIcon /></button>
                            {openActionMenu === `service-${record.id}` && (
                              <div className="row-menu floating-row-menu" style={actionMenuPosition ?? undefined}>
                                <button type="button" onClick={() => { downloadServicePdf(selectedMachine, pdfReadyServiceRecord(record)); setOpenActionMenu(""); }}><PdfDownloadIcon /> Baixar PDF</button>
                                {currentUserCanEmitReports && record.created_by === currentUserId && <button type="button" onClick={() => { startServiceEdit(record); setOpenActionMenu(""); }}><EditIcon /> Editar</button>}
                                {(currentUserHasFullAccess || (currentUserCanEmitReports && record.created_by === currentUserId)) && <button className="danger" type="button" onClick={() => { void deleteServiceRecord(record); setOpenActionMenu(""); }}><TrashIcon /> Excluir</button>}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        )}

        {view === "service" && (
          <form id="service-record-form" className="form-panel" onSubmit={saveService}>
            <div className="section-header">
              <h2>{editingServiceRecord ? "Editar atendimento" : "Registrar atendimento"}</h2>
            </div>
            <div className="fields-grid">
              <label className={serviceMachineLookupInvalid ? "field-invalid" : ""}>
                Máquina
                <input
                  name="machine_lookup"
                  list="service-machine-suggestions"
                  required
                  placeholder="Código, cliente ou modelo"
                  value={serviceMachineLookupInput}
                  onChange={(event) => {
                    setServiceMachineLookupInput(event.target.value);
                    setServiceMachineTouched(Boolean(event.target.value.trim()));
                  }}
                  onBlur={() => setServiceMachineTouched(true)}
                  aria-invalid={serviceMachineLookupInvalid}
                  aria-describedby={serviceMachineLookupInvalid ? "service-machine-error" : undefined}
                />
                {serviceMachineLookupInvalid && <span id="service-machine-error" className="field-error">Máquina não cadastrada. Selecione uma opção válida das sugestões.</span>}
              </label>
              <datalist id="service-machine-suggestions">{machines.map((machine) => <option key={machine.id} value={serviceMachineLookupLabel(machine)} />)}</datalist>
              <label>Equipamento<input name="equipment" placeholder="CLP, IHM, servo, inversor" defaultValue={editingServiceRecord?.equipment ?? ""} /></label>
              <label>Técnico responsável<input value={currentUserName || displayUserName(currentUserEmail)} readOnly /></label>
              <label>
                Demais técnicos
                <input
                  name="support_technicians"
                  list="service-technician-suggestions"
                  placeholder="Nome; outro nome"
                  value={supportTechniciansInput}
                  onChange={(event) => setSupportTechniciansInput(event.target.value)}
                />
              </label>
              <datalist id="service-technician-suggestions">{authorizedUsers.map((user) => <option key={user.id} value={serviceTechnicianLookupLabel(user)} />)}</datalist>
              <label>Início do atendimento<input name="service_start" placeholder="dd/mm/aa ou dd/mm/aa - hh:mm" maxLength={16} defaultValue={editingServiceRecord?.service_start ?? ""} onChange={(event) => { event.currentTarget.value = formatServiceDateTimeInput(event.currentTarget.value); }} /></label>
              <label>Fim do atendimento<input name="service_end" placeholder="dd/mm/aa ou dd/mm/aa - hh:mm" maxLength={16} defaultValue={editingServiceRecord?.service_end ?? ""} onChange={(event) => { event.currentTarget.value = formatServiceDateTimeInput(event.currentTarget.value); }} /></label>
              <label>Tipo de atendimento<select name="service_type" value={serviceType} onChange={(event) => updateServiceType(event.target.value as ServiceType)}>
                {SERVICE_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select></label>
              {(!editingServiceRecord || isServiceDraft(editingServiceRecord)) && (
                <label className="wide email-suggestion-field">
                  E-mails para envio
                  <textarea
                    name="service_recipients"
                    rows={2}
                    placeholder="um@email.com; outro@email.com"
                    value={serviceRecipientsInput}
                    onChange={(event) => {
                      setServiceRecipientsInput(event.target.value);
                      setServiceRecipientSuggestionsOpen(true);
                    }}
                    onFocus={() => setServiceRecipientSuggestionsOpen(true)}
                    onBlur={() => window.setTimeout(() => setServiceRecipientSuggestionsOpen(false), 120)}
                  />
                  {serviceRecipientSuggestionsOpen && serviceEmailSuggestions.length > 0 && (
                    <div className="email-suggestions" role="listbox" aria-label="Sugestões de e-mail">
                      {serviceEmailSuggestions.map((email) => (
                        <button key={email} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectServiceEmailSuggestion(email)}>
                          {email}
                        </button>
                      ))}
                    </div>
                  )}
                </label>
              )}
              {serviceType === "Visita técnica" && (
                <label>Cliente / representante<input name="customer_name" placeholder="Nome de quem assinou" defaultValue={editingServiceRecord?.customer_name ?? ""} /></label>
              )}
              <label className="wide">Motivo breve<input name="issue_summary" placeholder="Ex.: Falha no acionamento X" defaultValue={editingServiceRecord?.issue_summary ?? ""} /></label>
              <label className="wide">Solicitação do cliente / problema relatado<textarea name="request" rows={3} required defaultValue={editingServiceRecord?.request ?? ""} /></label>
              <label className="wide">Diagnóstico<textarea name="diagnosis" rows={3} required defaultValue={editingServiceRecord?.diagnosis ?? ""} /></label>
              <label className="wide">Serviço realizado<textarea name="service_done" rows={3} required defaultValue={editingServiceRecord?.service_done ?? ""} /></label>
              <label className="wide">Observações<textarea name="observations" rows={3} defaultValue={editingServiceRecord?.observations ?? ""} /></label>
              <section className="attachment-panel wide">
                <div className="section-header">
                  <div>
                    <h3>Imagens do relatório</h3>
                    <p>Anexe fotos de evidência, componentes, alarmes ou medições. Elas serão incluídas no PDF.</p>
                  </div>
                  <label className="button ghost attachment-upload-button">
                    Anexar imagens
                    <input type="file" accept="image/*" multiple onChange={addServiceAttachmentFiles} />
                  </label>
                </div>
                {serviceAttachments.length > 0 ? (
                  <div className="attachment-grid">
                    {serviceAttachments.map((attachment, index) => (
                      <article className="attachment-card" key={attachment.id}>
                        <img src={attachment.dataUrl} alt={`Imagem ${index + 1} do relatório`} />
                        <input
                          value={attachment.caption ?? ""}
                          onChange={(event) => updateServiceAttachmentCaption(attachment.id, event.target.value)}
                          placeholder={`Legenda da imagem ${index + 1}`}
                          maxLength={120}
                        />
                        <button className="button ghost" type="button" onClick={() => removeServiceAttachment(attachment.id)}>Remover</button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">Nenhuma imagem anexada.</p>
                )}
              </section>
              {serviceType === "Visita técnica" && (
                <section className={`signature-panel wide ${signatureExpanded ? "signature-expanded" : ""}`}>
                  <div className="section-header">
                    <div>
                      <h3>Assinatura do cliente</h3>
                      <p>{signatureExpanded ? "Use a tela horizontal para assinar com mais espaço." : "Assine com mouse, touchpad ou tela touch."}</p>
                    </div>
                    <div className="signature-actions">
                      {!signatureExpanded && <button className="button ghost signature-expand-button" type="button" onClick={() => void openSignaturePad()}>Ampliar assinatura</button>}
                      {signatureExpanded && <button className="button primary" type="button" onClick={() => void closeSignaturePad()}>Concluir</button>}
                      <button className="button ghost" type="button" onClick={clearSignature}>Limpar assinatura</button>
                    </div>
                  </div>
                  <div className="signature-canvas-wrap">
                    <canvas
                      ref={signatureCanvasRef}
                      className="signature-canvas"
                      width={900}
                      height={220}
                      aria-label="Campo para assinatura do cliente"
                      onPointerDown={startSignature}
                      onPointerMove={drawSignature}
                      onPointerUp={finishSignature}
                      onPointerCancel={finishSignature}
                    />
                    <div className="signature-guide" aria-hidden="true">
                      <span>Assine sobre a linha</span>
                    </div>
                  </div>
                </section>
              )}
            </div>
            <div className="service-form-actions">
              {editingServiceRecord && <button className="button ghost" type="button" onClick={startNewService}>Cancelar edição</button>}
              {(!editingServiceRecord || isServiceDraft(editingServiceRecord)) ? (
                <>
                  <button className="button ghost" type="submit" name="report_action" value="draft">Salvar prévia</button>
                  <button className="button primary" type="submit" name="report_action" value="finalize">Finalizar atendimento</button>
                </>
              ) : (
                <button className="icon-button save-action" type="submit" name="report_action" value="update" title="Salvar alterações" aria-label="Salvar alterações"><SaveIcon /></button>
              )}
            </div>
          </form>
        )}

        {view === "registry" && (
          <section className="view active">
            <section className="table-panel">
              <div className="section-header">
                <h2>Cadastro</h2>
                <div className="segmented-control" aria-label="Tipo de cadastro">
                  {currentUserCanEditMachine && <button className={registryTab === "machines" ? "active" : ""} type="button" onClick={() => setRegistryTab("machines")}><DetailIcon type="software" /> Máquinas</button>}
                  {currentUserCanUseRemoteAccess && <button className={registryTab === "clients" ? "active" : ""} type="button" onClick={() => setRegistryTab("clients")}><DetailIcon type="client" /> Clientes</button>}
                  {currentUserCanManageUsers && <button className={registryTab === "users" ? "active" : ""} type="button" onClick={() => setRegistryTab("users")}><DetailIcon type="client" /> Usuários</button>}
                </div>
              </div>
            </section>

            {registryTab === "machines" && (
              <>
                {currentUserCanEditMachine && (
                <form className="machine-form" onSubmit={saveMachine}>
                  <div className="section-header">
                    <h2>{editingMachineId ? "Alterar máquina" : "Cadastrar máquina"}</h2>
                    <div className="actions-row">
                      {editingMachineId && <button className="button ghost" type="button" onClick={() => setEditingMachineId("")}>Cancelar</button>}
                      <button className="icon-button save-action" title="Salvar máquina" aria-label="Salvar máquina"><SaveIcon /></button>
                    </div>
                  </div>
                  <section className="form-card">
                    <h3>Dados da máquina</h3>
                    <div className="fields-grid">
                      <label>Código<input disabled={machineMainFieldsDisabled} value={machineForm.code} onChange={(event) => updateMachineForm("code", event.target.value)} placeholder="T665-xxxx" maxLength={9} /></label>
                      <label>Modelo<input disabled={machineMainFieldsDisabled} value={machineForm.model} onChange={(event) => updateMachineForm("model", event.target.value)} placeholder="Onduladeira, Dryend, ICV..." maxLength={120} /></label>
                      <label className="wide">Descrição<input disabled={machineMainFieldsDisabled} value={machineForm.description} onChange={(event) => updateMachineForm("description", event.target.value)} placeholder="Descrição curta do modelo da máquina" maxLength={160} /></label>
                      <label>Cliente<input disabled={machineMainFieldsDisabled} list="client-suggestions" value={machineForm.client} onChange={(event) => updateMachineForm("client", event.target.value)} placeholder="Nome da empresa" maxLength={160} /></label>
                      <datalist id="client-suggestions">{clientSuggestions.map((client) => <option key={client} value={client} />)}</datalist>
                      <label>Localização<input disabled={machineMainFieldsDisabled} list="city-suggestions" value={machineForm.unit_city} onChange={(event) => updateMachineForm("unit_city", event.target.value)} placeholder="Cidade - UF ou Cidade - PAIS" maxLength={160} /></label>
                      <datalist id="city-suggestions">{citySuggestions.map((city) => <option key={city} value={city} />)}</datalist>
                      <label>Mecânica<input disabled={machineMainFieldsDisabled} value={machineForm.mechanical_list} onChange={(event) => updateMachineForm("mechanical_list", event.target.value)} placeholder="500-xxx ou T-0xxx" maxLength={10} /></label>
                      <label>Código do software<input disabled={machineMainFieldsDisabled} value={machineForm.software_code} onChange={(event) => updateMachineForm("software_code", event.target.value)} placeholder="T665-xxxx" maxLength={9} /></label>
                      <label>VM<select disabled={machineMainFieldsDisabled} value={machineForm.vm} onChange={(event) => updateMachineForm("vm", event.target.value)}>
                        <option value="">Selecione</option>
                        {machineForm.vm && !VM_OPTIONS.includes(machineForm.vm) && <option value={machineForm.vm}>{machineForm.vm}</option>}
                        {VM_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select></label>
                      <label>Faixa de IP<input disabled={machineMainFieldsDisabled} value={machineForm.ip_range} onChange={(event) => updateMachineForm("ip_range", event.target.value)} placeholder="Ex.: 189.1.87.xxx" maxLength={15} /></label>
                      <label>Número de série<input disabled={machineMainFieldsDisabled} value={machineForm.serial} onChange={(event) => updateMachineForm("serial", event.target.value)} placeholder="500-xxx ou 500-697/22" maxLength={12} /></label>
                      <label>Fabricação<input disabled={machineMainFieldsDisabled} value={machineForm.manufacture_month} onChange={(event) => updateMachineForm("manufacture_month", formatMonthYearInput(event.target.value))} placeholder="mm/aaaa" pattern="\d{2}/\d{4}" maxLength={7} /></label>
                      <label>Software<select disabled={machineMainFieldsDisabled} value={machineForm.software_version} onChange={(event) => updateMachineForm("software_version", event.target.value)}>
                        <option value="">Selecione</option>
                        {machineForm.software_version && !SOFTWARE_OPTIONS.includes(machineForm.software_version) && <option value={machineForm.software_version}>{machineForm.software_version}</option>}
                        {SOFTWARE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select></label>
                    </div>
                  </section>

                  <section className="form-card">
                    <h3>Informações de Acesso</h3>
                    <div className="fields-grid">
                      <label>Acesso remoto<select disabled={machineMainFieldsDisabled} value={machineForm.remote_access} onChange={(event) => updateMachineForm("remote_access", event.target.value as RemoteAccess)}>
                        {REMOTE_ACCESS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select></label>
                    </div>

                  {showRemoteAccess && !currentUserCanAccessCredentials && (
                    <p className="empty-state">Seu usuário não tem permissão para visualizar ou alterar credenciais de acesso remoto.</p>
                  )}

                  {showRemoteAccess && currentUserCanAccessCredentials && (
                    <>
                      {machineForm.remote_access === "VNC" && (
                        <div className="fields-grid">
                          <label>IP de acesso<input disabled={machineMainFieldsDisabled} value={machineForm.vnc_ip} onChange={(event) => updateMachineForm("vnc_ip", event.target.value)} placeholder="Ex.: 189.1.87.200/5906" maxLength={21} /></label>
                          <label>Senha<input disabled={machineMainFieldsDisabled} type="text" value={machineForm.vnc_password} onChange={(event) => updateMachineForm("vnc_password", event.target.value)} /></label>
                          <label>Usuário VM<input disabled={machineMainFieldsDisabled} value={machineForm.vnc_user} onChange={(event) => updateMachineForm("vnc_user", event.target.value)} /></label>
                          <label>Senha VM<input disabled={machineMainFieldsDisabled} type="text" value={machineForm.vnc_vm_password} onChange={(event) => updateMachineForm("vnc_vm_password", event.target.value)} /></label>
                          <label className="wide">Observações de acesso<textarea disabled={machineMainFieldsDisabled} rows={3} value={machineForm.vnc_notes} onChange={(event) => updateMachineForm("vnc_notes", event.target.value)} /></label>
                        </div>
                      )}
                      {machineForm.remote_access === "SINEMA" && (
                        <div className="fields-grid">
                          <label>Device Name<input disabled={machineMainFieldsDisabled} value={machineForm.sinema_url} onChange={(event) => updateMachineForm("sinema_url", event.target.value)} /></label>
                          <label>Subnet Name<input disabled={machineMainFieldsDisabled} value={machineForm.sinema_user} onChange={(event) => updateMachineForm("sinema_user", event.target.value)} /></label>
                          <label className="wide">Observações<textarea disabled={machineMainFieldsDisabled} rows={3} value={machineForm.sinema_notes} onChange={(event) => updateMachineForm("sinema_notes", event.target.value)} /></label>
                        </div>
                      )}
                    </>
                  )}
                  </section>
                </form>
                )}

                <section className="table-panel">
                  <div className="section-header"><h2>Máquinas cadastradas</h2><span>{registryMachines.length} registros</span></div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Código</th><th>Modelo</th><th>Cliente</th><th>Localização</th><th>VM</th><th>Fabricação</th><th>Acesso</th><th>Ações</th></tr></thead>
                      <tbody>{registryMachines.map((machine) => (
                        <tr key={machine.id}>
                          <td>{displayMachineCode(machine)}</td>
                          <td>{machine.model || "-"}</td>
                          <td>{machine.client || "-"}</td>
                          <td>{machine.unit_city || "-"}</td>
                          <td>{machine.vm || "-"}</td>
                          <td>{formatMonthYear(machine.manufacture_month)}</td>
                          <td>{machine.remote_access || machine.access_method || "Sem acesso remoto"}</td>
                          <td>
                            {currentUserCanEditMachine ? <div className="row-actions">
                              <button className="icon-button menu-trigger" type="button" title="Ações" aria-label={`Ações da máquina ${displayMachineCode(machine)}`} onClick={(event) => toggleActionMenu(`machine-${machine.id}`, event)}><MoreIcon /></button>
                              {openActionMenu === `machine-${machine.id}` && (
                                <div className="row-menu floating-row-menu" style={actionMenuPosition ?? undefined}>
                                  <button type="button" onClick={() => { setEditingMachineId(machine.id); setRegistryTab("machines"); setOpenActionMenu(""); }}><EditIcon /> Alterar cadastro</button>
                                  <button className="danger" type="button" onClick={() => { void deleteMachine(machine.id); setOpenActionMenu(""); }}><TrashIcon /> Excluir</button>
                                </div>
                              )}
                            </div> : "-"}
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            {registryTab === "clients" && currentUserCanUseRemoteAccess && (
              <section className="table-panel">
                <div className="section-header"><h2>Clientes do Acesso Remoto</h2><span>{sortedChatContacts.length} registros</span></div>
                <div className="table-wrap">
                  <table className="compact-table">
                    <thead><tr><th>Cliente</th><th>Empresa</th><th>Telefone</th><th>Última atualização</th><th>Ações</th></tr></thead>
                    <tbody>{sortedChatContacts.map((contact) => (
                      <tr key={contact.id}>
                        <td>{contact.name || "-"}</td>
                        <td>{contact.company || "-"}</td>
                        <td>{contact.phone}</td>
                        <td>{formatDateTime(contact.updated_at)}</td>
                        <td>
                          <div className="row-actions">
                            <button className="icon-button menu-trigger" type="button" title="Ações" aria-label={`Ações do cliente ${contact.name || contact.phone}`} onClick={(event) => toggleActionMenu(`contact-${contact.id}`, event)}><MoreIcon /></button>
                            {openActionMenu === `contact-${contact.id}` && (
                              <div className="row-menu floating-row-menu" style={actionMenuPosition ?? undefined}>
                                <button type="button" onClick={() => editChatContact(contact)}><EditIcon /> Alterar</button>
                                <button className="danger" type="button" onClick={() => { void deleteChatContact(contact.id); setOpenActionMenu(""); }}><TrashIcon /> Excluir</button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                  {!sortedChatContacts.length && <p className="empty-state">Nenhum cliente identificado pelo Acesso Remoto ainda.</p>}
                </div>
              </section>
            )}

            {registryTab === "users" && currentUserCanManageUsers && (
              <>
                <form className="form-panel" onSubmit={saveUser}>
                  <div className="section-header">
                    <h2>{editingUserId ? "Alterar usuário" : "Cadastrar usuário"}</h2>
                    <div className="actions-row">
                      {editingUserId && <button className="button ghost" type="button" onClick={() => { setEditingUserId(""); setUserForm(EMPTY_USER_FORM); }}>Cancelar</button>}
                      <button className="icon-button save-action" title="Salvar usuário" aria-label="Salvar usuário"><SaveIcon /></button>
                    </div>
                  </div>
                  <div className="fields-grid">
                    <label>Usuário<input value={userForm.name} onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))} /></label>
                    <label>E-mail<input value={userForm.email} onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))} type="email" /></label>
                    <label>Telefone<input value={formatPhone(userForm.phone)} onChange={(event) => setUserForm((current) => ({ ...current, phone: formatPhone(event.target.value) }))} placeholder="(45) 99952-6775" inputMode="tel" maxLength={15} /></label>
                    <label>Perfil / Setor<select value={userForm.role} onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value as UserRole }))}>
                      {userForm.role === "Montagem" && <option value="Montagem">Montagem (legado)</option>}
                      {USER_ROLE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select></label>
                    <label className="checkbox-field"><input type="checkbox" checked={userForm.remote_access_allowed} onChange={(event) => setUserForm((current) => ({ ...current, remote_access_allowed: event.target.checked }))} /> Permitir Acesso Remoto</label>
                    <label className="checkbox-field"><input type="checkbox" checked={userForm.credential_access_allowed} onChange={(event) => setUserForm((current) => ({ ...current, credential_access_allowed: event.target.checked }))} /> Permitir acesso às senhas</label>
                  </div>
                </form>
                <section className="table-panel">
                  <div className="table-wrap">
                    <table className="compact-table">
                      <thead><tr>
                        <th><button className="sort-header" type="button" onClick={() => toggleUserSort("name")}>Usuário <span>{sortMark(userSort.key === "name", userSort.direction)}</span></button></th>
                        <th><button className="sort-header" type="button" onClick={() => toggleUserSort("email")}>E-mail <span>{sortMark(userSort.key === "email", userSort.direction)}</span></button></th>
                        <th>Telefone</th>
                        <th><button className="sort-header" type="button" onClick={() => toggleUserSort("role")}>Perfil / Setor <span>{sortMark(userSort.key === "role", userSort.direction)}</span></button></th>
                        <th>Acesso remoto</th>
                        <th>Senhas</th>
                        <th>Ações</th>
                      </tr></thead>
                      <tbody>{sortedUsers.map((user) => (
                        <tr key={user.id}>
                          <td>{user.name}</td>
                          <td>{user.email}</td>
                          <td>{formatPhone(user.phone) || "-"}</td>
                          <td>{user.role}</td>
                          <td>{user.remote_access_allowed ? "Sim" : "Não"}</td>
                          <td>{user.credential_access_allowed ? "Sim" : "Não"}</td>
                          <td>
                            <div className="row-actions">
                              <button className="icon-button menu-trigger" type="button" title="Ações" aria-label={`Ações do usuário ${user.name}`} onClick={(event) => toggleActionMenu(`user-${user.id}`, event)}><MoreIcon /></button>
                              {openActionMenu === `user-${user.id}` && (
                                <div className="row-menu floating-row-menu" style={actionMenuPosition ?? undefined}>
                                  <button type="button" onClick={() => { setEditingUserId(user.id); setUserForm({ name: user.name, email: user.email, role: user.role, phone: formatPhone(user.phone), remote_access_allowed: Boolean(user.remote_access_allowed), credential_access_allowed: Boolean(user.credential_access_allowed) }); setOpenActionMenu(""); }}><EditIcon /> Alterar</button>
                                  <button className="danger" type="button" onClick={() => { void deleteUser(user.id); setOpenActionMenu(""); }}><TrashIcon /> Excluir</button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </section>
        )}

        {transferDialogOpen && selectedChat && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="transfer-modal-title" onClick={() => setTransferDialogOpen(false)}>
            <section className="modal-card transfer-card" onClick={(event) => event.stopPropagation()}>
              <div className="section-header">
                <div>
                  <p className="eyebrow">Acesso Remoto</p>
                  <h2 id="transfer-modal-title">Transferir conversa</h2>
                </div>
                <button className="button ghost" type="button" onClick={() => setTransferDialogOpen(false)}>Fechar</button>
              </div>
              <div className="transfer-list">
                {availableTransferUsers.map((user) => (
                  <button key={user.email} type="button" onClick={() => void assignChat(selectedChat, user.email)}>
                    <span className="presence-dot" />
                    <strong>{user.name}</strong>
                    <small>{user.role || "Usuário"}</small>
                  </button>
                ))}
                {!availableTransferUsers.length && <p className="empty-state">Nenhum usuário Online disponível para receber transferência.</p>}
              </div>
            </section>
          </div>
        )}

        {editingContact && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="contact-modal-title" onClick={() => setEditingContact(null)}>
            <form className="modal-card profile-card" onSubmit={saveChatContact} onClick={(event) => event.stopPropagation()}>
              <div className="section-header">
                <div>
                  <p className="eyebrow">Acesso Remoto</p>
                  <h2 id="contact-modal-title">Editar cliente</h2>
                </div>
                <button className="button ghost" type="button" onClick={() => setEditingContact(null)}>Fechar</button>
              </div>
              <div className="fields-grid">
                <label>Cliente<input value={contactForm.name} onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome do contato" /></label>
                <label>Empresa<input value={contactForm.company} onChange={(event) => setContactForm((current) => ({ ...current, company: event.target.value }))} placeholder="Empresa do cliente" /></label>
                <label className="wide">Telefone<input value={contactForm.phone} onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))} placeholder="5511999999999" /></label>
              </div>
              <div className="modal-actions">
                <button className="button ghost" type="button" onClick={() => setEditingContact(null)}>Cancelar</button>
                <button className="button primary" type="submit">Salvar cliente</button>
              </div>
            </form>
          </div>
        )}

        {servicePreview && previewMachine && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pdf-preview-title" onClick={closeServicePreview}>
            <section className="modal-card pdf-preview-card" onClick={(event) => event.stopPropagation()}>
              <div className="section-header">
                <div>
                  <p className="eyebrow">Pr&eacute;via do relat&oacute;rio</p>
                  <h2 id="pdf-preview-title">Revise antes do envio</h2>
                </div>
                <button className="button ghost" type="button" onClick={closeServicePreview}>Fechar</button>
              </div>
              <div className="pdf-preview-meta">
                <span><strong>M&aacute;quina:</strong> {displayMachineCode(previewMachine)}</span>
                <span><strong>Arquivo:</strong> {servicePdfFileName(previewMachine, pdfReadyServiceRecord(servicePreview.record))}</span>
                <span><strong>Envio:</strong> {servicePreview.recipients.length ? servicePreview.recipients.join("; ") : "Nenhum e-mail informado"}</span>
              </div>
              <iframe className="pdf-preview-frame" src={`${servicePreview.pdfUrl}#toolbar=0&navpanes=0&scrollbar=1`} title="Pr&eacute;via do relat&oacute;rio em PDF" />
              <div className="pdf-mobile-preview">
                <strong>PDF pronto para revis&atilde;o</strong>
                <span>Em alguns celulares, a pr&eacute;via embutida do PDF n&atilde;o abre corretamente. Abra a pr&eacute;via em uma nova aba para revisar antes do envio.</span>
                <a className="button ghost" href={servicePreview.pdfUrl} target="_blank" rel="noreferrer">Abrir pr&eacute;via</a>
              </div>
              <div className="modal-actions">
                <button className="button ghost" type="button" onClick={() => editServiceFromPreview(servicePreview.record)}>Editar</button>
                <button className="button ghost" type="button" onClick={() => downloadServicePdf(previewMachine, pdfReadyServiceRecord(servicePreview.record))}>Baixar PDF</button>
                <button className="button primary" type="button" disabled={servicePreviewSending} onClick={() => void sendPreviewServiceEmail()}>{servicePreviewSending ? "Enviando..." : servicePreview.finalizeOnSend ? servicePreview.recipients.length ? "Finalizar e enviar e-mail" : "Finalizar atendimento" : "Enviar e-mail"}</button>
              </div>
            </section>
          </div>
        )}

        {selectedServiceRecord && selectedMachine && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="service-modal-title" onClick={() => setSelectedServiceRecord(null)}>
            <section className="modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="section-header">
                <div>
                  <p className="eyebrow">{formatDate(selectedServiceRecord.service_date)}</p>
                  <h2 id="service-modal-title">Atendimento - {displayMachineCode(selectedMachine)}</h2>
                </div>
                <button className="button ghost" type="button" onClick={() => setSelectedServiceRecord(null)}>Fechar</button>
              </div>
              <div className="record-details">
                <div><span>Tipo de atendimento</span><strong>{normalizeServiceType(selectedServiceRecord.service_type)}</strong></div>
                <div><span>Equipamento</span><strong>{selectedServiceRecord.equipment || "-"}</strong></div>
                <div><span>Início</span><strong>{selectedServiceRecord.service_start || formatDate(selectedServiceRecord.service_date)}</strong></div>
                <div><span>Fim</span><strong>{selectedServiceRecord.service_end || "-"}</strong></div>
                <div><span>Técnico</span><strong>{selectedServiceRecord.technician_name}</strong></div>
                <div><span>Motivo breve</span><strong>{selectedServiceRecord.issue_summary || "-"}</strong></div>
                {normalizeServiceType(selectedServiceRecord.service_type) === "Visita técnica" && (
                  <>
                    <div><span>Cliente / representante</span><strong>{selectedServiceRecord.customer_name || "-"}</strong></div>
                    <div className="signature-detail"><span>Assinatura do cliente</span>{selectedServiceRecord.customer_signature ? <img src={selectedServiceRecord.customer_signature} alt="Assinatura do cliente" /> : <strong>-</strong>}</div>
                  </>
                )}
                <div><span>Solicitação do cliente / problema relatado</span><p>{selectedServiceRecord.request}</p></div>
                <div><span>Diagnóstico</span><p>{selectedServiceRecord.diagnosis}</p></div>
                <div><span>Serviço realizado</span><p>{selectedServiceRecord.service_done}</p></div>
                <div><span>Observações</span><p>{selectedServiceRecord.observations || "-"}</p></div>
                {(selectedServiceRecord.attachments?.length ?? 0) > 0 && (
                  <div className="record-attachments">
                    <span>Imagens do relatório</span>
                    <div className="record-attachment-grid">
                      {selectedServiceRecord.attachments?.map((attachment, index) => (
                        <figure key={attachment.id || `${attachment.name}-${index}`}>
                          <img src={attachment.dataUrl} alt={`Imagem ${index + 1} do atendimento`} />
                          <figcaption>{attachment.caption || attachment.name || `Imagem ${index + 1}`}</figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-actions">
                <button className="icon-button download" type="button" title="Baixar PDF" aria-label="Baixar PDF" onClick={() => downloadServicePdf(selectedMachine, pdfReadyServiceRecord(selectedServiceRecord))}><PdfDownloadIcon /></button>
                {currentUserCanEmitReports && selectedServiceRecord.created_by === currentUserId && (
                  <button className="button primary" type="button" onClick={() => startServiceEdit(selectedServiceRecord)}>Editar atendimento</button>
                )}
                {(currentUserHasFullAccess || (currentUserCanEmitReports && selectedServiceRecord.created_by === currentUserId)) && (
                  <button className="button danger" type="button" onClick={() => void deleteServiceRecord(selectedServiceRecord)}>Excluir atendimento</button>
                )}
              </div>
            </section>
          </div>
        )}

        {profileModalOpen && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title" onClick={() => setProfileModalOpen(false)}>
            <form className="modal-card profile-card" onSubmit={saveUserProfile} onClick={(event) => event.stopPropagation()}>
              <div className="section-header">
                <div>
                  <p className="eyebrow">Usuário</p>
                  <h2 id="profile-modal-title">Editar Usuário</h2>
                </div>
                <button className="button ghost" type="button" onClick={() => setProfileModalOpen(false)}>Fechar</button>
              </div>
              <div className="fields-grid">
                <label className="wide">Nome exibido<input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder={displayUserName(currentUserEmail)} autoFocus /></label>
                <label className="wide">E-mail corporativo<input value={currentUserEmail} readOnly /></label>
              </div>
              <div className="modal-actions">
                <button className="button ghost" type="button" onClick={() => setProfileModalOpen(false)}>Cancelar</button>
                <button className="button primary" type="submit">Salvar</button>
              </div>
            </form>
          </div>
        )}

        {helpOpen && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="help-modal-title" onClick={() => setHelpOpen(false)}>
            <section className="modal-card help-card" onClick={(event) => event.stopPropagation()}>
              <div className="section-header">
                <div>
                  <p className="eyebrow">Ajuda</p>
                  <h2 id="help-modal-title">Como usar esta tela</h2>
                </div>
                <button className="button ghost" type="button" onClick={() => setHelpOpen(false)}>Fechar</button>
              </div>
              <p>{helpText(view, registryTab)}</p>
              <div className="help-topic-list">
                {helpSections(view, registryTab).map(([title, body]) => (
                  <article key={title}>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {biometricPromptOpen && isMobileAuthDeviceState && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="biometric-modal-title" onClick={() => setBiometricPromptOpen(false)}>
            <section className="modal-card profile-card" onClick={(event) => event.stopPropagation()}>
              <div className="section-header">
                <div>
                  <p className="eyebrow">Segurança do dispositivo</p>
                  <h2 id="biometric-modal-title">Habilitar biometria</h2>
                </div>
              </div>
              <p>Depois de habilitar, este dispositivo pedirá biometria sempre que o app for aberto. A confirmação por e-mail continuará sendo renovada a cada 7 dias.</p>
              <div className="modal-actions">
                <button className="button ghost" type="button" onClick={() => { window.localStorage.setItem(BIOMETRIC_PROMPT_DISMISSED_KEY, "1"); setBiometricPromptOpen(false); }}>Agora não</button>
                <button className="button primary" type="button" onClick={() => void enableBiometricAuth()}>Habilitar biometria</button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
