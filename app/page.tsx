"use client";

import { FormEvent, MouseEvent as ReactMouseEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { downloadServicePdf, servicePdfBase64, servicePdfFileName } from "@/lib/pdf";
import type { AuthorizedUser, Machine, Profile, ServiceRecord, SupportContract, TravelSchedule, UserRole } from "@/lib/types";

type View = "home" | "overview" | "machineDetail" | "service" | "registry" | "schedule";
type RegistryTab = "machines" | "users";
type ScheduleTab = "travel" | "contracts";
type SortDirection = "asc" | "desc";
type MachineSortKey = "code" | "model" | "client" | "unit_city" | "serial" | "software_version" | "vm" | "last_service";
type HistorySortKey = "service_date" | "equipment" | "technician_name" | "issue_summary";
type UserSortKey = "name" | "email" | "role";
type TravelSortKey = "start_date" | "end_date" | "code" | "client" | "technicians" | "status" | "reason" | "updated_at";
type RemoteAccess = "SINEMA" | "VNC" | "Sem acesso remoto";
type ServiceType = "Acesso remoto" | "Visita técnica";
type ThemeMode = "light" | "dark";
type ContractType = "Seg-Sex" | "Seg-Sab" | "Garantia";
type ActionMenuPosition = { top: number; right: number };
type LeafletLayerTarget = LeafletMap | LeafletLayerGroup;
type LeafletMap = {
  fitBounds: (bounds: [number, number][], options?: Record<string, unknown>) => LeafletMap;
  getZoom: () => number;
  hasLayer: (layer: LeafletLayerGroup) => boolean;
  addLayer: (layer: LeafletLayerGroup) => LeafletMap;
  removeLayer: (layer: LeafletLayerGroup) => LeafletMap;
  on: (event: string, handler: () => void) => LeafletMap;
  off: (event: string, handler: () => void) => LeafletMap;
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
type LeafletNamespace = {
  map: (element: HTMLElement, options?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, options?: Record<string, unknown>) => { addTo: (map: LeafletMap) => unknown };
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
  active: string;
};

const ALLOWED_EMAIL_DOMAINS = ["tomasoni.ind.br", "tomasoni.in.br"];
const BACKUP_ALLOWED_EMAIL = "lucas.lessa@tomasoni.ind.br";
const DEFAULT_MESSAGE = "Consulte uma máquina pelo código ou selecione uma linha da tabela.";
const AUTH_CONFIRMED_AT_KEY = "tomasoni-servicecore-auth-confirmed-at";
const AUTH_CONFIRMATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const BIOMETRIC_EMAIL_KEY = "tomasoni-servicecore-biometric-email";
const BIOMETRIC_CREDENTIAL_KEY = "tomasoni-servicecore-biometric-credential";
const BIOMETRIC_PROMPT_DISMISSED_KEY = "tomasoni-servicecore-biometric-dismissed";
const BIOMETRIC_SESSION_VERIFIED_KEY = "tomasoni-servicecore-biometric-session-verified";
const THEME_KEY = "tomasoni-servicecore-theme";
const REMOTE_ACCESS_OPTIONS: RemoteAccess[] = ["Sem acesso remoto", "SINEMA", "VNC"];
const SERVICE_TYPE_OPTIONS: ServiceType[] = ["Acesso remoto", "Visita técnica"];
const CONTRACT_TYPE_OPTIONS: ContractType[] = ["Seg-Sex", "Seg-Sab", "Garantia"];
const USER_ROLE_OPTIONS: UserRole[] = ["Admin", "Diretoria", "Engenharia", "Montagem", "Comercial"];
const TRAVEL_STATUS_OPTIONS = ["A definir", "Planejado", "Em andamento", "Concluido", "Cancelado"];
const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
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
  role: "Montagem"
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
  active: "Sim"
};
function formatDate(value?: string | null) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
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
  if (/^\d{2}\/\d{2}$/.test(value)) return value;
  if (!year || !month) return value;
  return `${month}/${year.slice(-2)}`;
}

function normalizeMonthYear(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{2})\/(\d{2})$/);
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

function contractMatchesMachine(contract: SupportContract, machine: Machine) {
  const contractSerial = normalizeLookup(contract.serial);
  const machineSerial = normalizeLookup(machine.serial);
  if (contractSerial && machineSerial && contractSerial === machineSerial) return true;
  if (contract.machine_id && contract.machine_id === machine.id) return true;
  const contractCode = normalizeLookup(contract.code);
  const machineCode = normalizeLookup(machine.code);
  return Boolean(contractCode && machineCode && contractCode === machineCode);
}

function sortContractsByRelevance(a: SupportContract, b: SupportContract) {
  const activeDiff = Number(Boolean(b.active)) - Number(Boolean(a.active));
  if (activeDiff) return activeDiff;
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
    description: machine.description ?? "",
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

function lastServiceDate(machine: Machine) {
  const dates = machine.service_records?.map((record) => record.service_date).filter(Boolean) ?? [];
  return dates.sort().at(-1) ?? "";
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function fileTimestamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
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
  return hasFullAccess(role);
}

function canEditMachine(role?: UserRole | null) {
  return hasFullAccess(role) || role === "Engenharia";
}

function canManageContracts(role?: UserRole | null) {
  return hasFullAccess(role) || role === "Comercial";
}

function canEmitReports(role?: UserRole | null) {
  return role !== "Comercial";
}

function canEditSchedule(role?: UserRole | null) {
  return hasFullAccess(role) || role === "Comercial";
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

function validateMonthYear(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) return "";
  const match = normalized.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return `${label} deve estar no formato mm/aa.`;
  const month = Number(match[1]);
  if (month < 1 || month > 12) return `${label} possui mês inválido.`;
  return "";
}

let leafletLoadPromise: Promise<LeafletNamespace> | null = null;

function loadLeaflet() {
  if (typeof window === "undefined") return Promise.reject(new Error("Mapa indisponível fora do navegador."));
  const existingLeaflet = (window as Window & { L?: LeafletNamespace }).L;
  if (existingLeaflet) return Promise.resolve(existingLeaflet);

  if (!document.querySelector(`link[href="${LEAFLET_CSS_URL}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = LEAFLET_CSS_URL;
    document.head.appendChild(link);
  }

  if (!leafletLoadPromise) {
    leafletLoadPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${LEAFLET_JS_URL}"]`);
      if (existingScript) {
        existingScript.addEventListener("load", () => {
          const loadedLeaflet = (window as Window & { L?: LeafletNamespace }).L;
          if (loadedLeaflet) resolve(loadedLeaflet);
          else reject(new Error("Leaflet não carregou corretamente."));
        }, { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Falha ao carregar o mapa.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = LEAFLET_JS_URL;
      script.async = true;
      script.onload = () => {
        const loadedLeaflet = (window as Window & { L?: LeafletNamespace }).L;
        if (loadedLeaflet) resolve(loadedLeaflet);
        else reject(new Error("Leaflet não carregou corretamente."));
      };
      script.onerror = () => reject(new Error("Falha ao carregar o mapa."));
      document.head.appendChild(script);
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
  if (normalized.includes("support_contracts") || normalized.includes("relation") || normalized.includes("schema cache")) return "Tabela de contratos não encontrada no Supabase. Aplique a migration 020_support_contracts_permissions.sql e tente novamente.";
  if (normalized.includes("duplicate") || normalized.includes("unique")) return "Já existe um cadastro com estes dados.";
  if (normalized.includes("permission") || normalized.includes("row-level security")) return "Seu usuário não tem permissão para executar esta ação.";
  if (normalized.includes("network") || normalized.includes("fetch")) return "Falha de conexão. Verifique a internet e tente novamente.";
  return "Não foi possível concluir a operação. Revise os dados e tente novamente.";
}

function screenLegend(view: View, registryTab: RegistryTab, selectedMachine?: Machine) {
  if (view === "home") return "Consulte uma máquina pelo código ou selecione uma linha da tabela.";
  if (view === "overview") return "Visão geral da base instalada, contratos, acessos e atendimentos registrados.";
  if (view === "machineDetail") return selectedMachine ? `Dados cadastrais e histórico da máquina ${displayMachineCode(selectedMachine)}.` : "Dados cadastrais e histórico da máquina.";
  if (view === "service") return "Registre um novo atendimento técnico e gere o relatório em PDF.";
  if (view === "schedule") return "Acompanhe o cronograma de viagens e atendimentos planejados.";
  if (registryTab === "machines") return "Cadastre, altere ou exclua máquinas e informações de acesso.";
  return "Cadastre e gerencie os usuários autorizados a acessar o sistema.";
}

function helpText(view: View, registryTab: RegistryTab) {
  if (view === "home") return "Use o filtro para localizar uma máquina por código, modelo, cliente ou localização. Clique no código da máquina para abrir os dados cadastrais e o histórico de atendimentos.";
  if (view === "overview") return "A visão geral consolida indicadores da base cadastrada, contratos, acesso remoto, localização e volume de atendimentos. Use os rankings para localizar máquinas, clientes e regiões que merecem atenção.";
  if (view === "machineDetail") return "Nesta tela ficam os dados técnicos da máquina, informações de acesso remoto e histórico. Clique em um atendimento para ver o registro completo ou use o menu de ações para baixar o PDF.";
  if (view === "service") return "Registre o atendimento com tipo, motivo breve e descrições completas. Em visita técnica, colete a assinatura do cliente para incluir no PDF.";
  if (view === "schedule") return "Use o cronograma para planejar viagens, técnicos envolvidos, cliente, código, status e motivo. Datas podem ser dd/mm ou A definir.";
  if (registryTab === "machines") return "Cadastre ou altere máquinas e informações de acesso. Use o menu de ações da tabela para editar ou excluir cadastros.";
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
      ["Faixa de IP", "Faixa reservada pela engenharia para a máquina ou software."],
      ["Fabricação", "Mês e ano no formato mm/aa."],
      ["Software", "Plataforma ou versão principal, como TIA V19, Scout ou equivalente."],
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

  return [
    ["Usuário", "Cadastre o nome que será exibido no sistema e associado aos registros feitos por essa conta."],
    ["E-mail", "Informe o e-mail corporativo autorizado. Apenas e-mails cadastrados conseguem validar o acesso ao app."],
    ["Perfil / setor", "Escolha o perfil correto para liberar apenas as telas e ações compatíveis com o setor do usuário."],
    ["Permissões", "Admin e Diretoria têm acesso total. Engenharia, Montagem e Comercial seguem restrições específicas de cadastro, cronograma, contratos e relatórios."],
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
  const [view, setView] = useState<View>("home");
  const [registryTab, setRegistryTab] = useState<RegistryTab>("machines");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [authorizedUsers, setAuthorizedUsers] = useState<AuthorizedUser[]>([]);
  const [travelSchedules, setTravelSchedules] = useState<TravelSchedule[]>([]);
  const [supportContracts, setSupportContracts] = useState<SupportContract[]>([]);
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
  const [editingTravelId, setEditingTravelId] = useState("");
  const [travelForm, setTravelForm] = useState<TravelScheduleFormState>(EMPTY_TRAVEL_FORM);
  const [scheduleTab, setScheduleTab] = useState<ScheduleTab>("travel");
  const [editingContractId, setEditingContractId] = useState("");
  const [contractForm, setContractForm] = useState<SupportContractFormState>(EMPTY_CONTRACT_FORM);
  const [travelSort, setTravelSort] = useState<{ key: TravelSortKey; direction: SortDirection }>({ key: "start_date", direction: "asc" });
  const [completedTravelSort, setCompletedTravelSort] = useState<{ key: TravelSortKey; direction: SortDirection }>({ key: "updated_at", direction: "desc" });
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [selectedServiceRecord, setSelectedServiceRecord] = useState<ServiceRecord | null>(null);
  const [editingServiceRecord, setEditingServiceRecord] = useState<ServiceRecord | null>(null);
  const [machineForm, setMachineForm] = useState<MachineFormState>(EMPTY_MACHINE_FORM);
  const [serviceType, setServiceType] = useState<ServiceType>("Acesso remoto");
  const [customerSignature, setCustomerSignature] = useState("");
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
    supabase.auth.getSession().then(({ data }) => {
      setSessionReady(true);
      const userEmail = data.session?.user.email ?? "";
      if (data.session && !isCorporateEmail(userEmail)) {
        void supabase.auth.signOut();
        clearAuthConfirmation();
        setIsAuthenticated(false);
        setMessage("Acesso negado. Use um e-mail corporativo da Tomasoni.");
        return;
      }

      if (data.session && !hasFreshAuthConfirmation()) {
        void supabase.auth.signOut();
        clearAuthConfirmation();
        setIsAuthenticated(false);
        setCurrentUserId("");
        setMessage("Por segurança, confirme seu acesso novamente com o código enviado ao e-mail.");
        return;
      }

      if (data.session && hasBiometricEnabledFor(userEmail) && !hasBiometricVerifiedThisOpen(userEmail)) {
        setBiometricRequired(true);
        setCurrentUserId(data.session.user.id);
        setCurrentUserEmail(userEmail);
        void loadProfile(data.session.user.id, userEmail);
        setMessage("Confirme sua biometria para abrir o app neste dispositivo.");
        return;
      }

      setIsAuthenticated(Boolean(data.session));
      setCurrentUserId(data.session?.user.id ?? "");
      setCurrentUserEmail(data.session?.user.email ?? "");
      if (data.session) {
        void loadProfile(data.session.user.id, data.session.user.email ?? "");
        void loadData();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      const userEmail = session?.user.email ?? "";
      if (session && !isCorporateEmail(userEmail)) {
        void supabase.auth.signOut();
        clearAuthConfirmation();
        setIsAuthenticated(false);
        setMessage("Acesso negado. Use um e-mail corporativo da Tomasoni.");
        return;
      }

      if (session && hasBiometricEnabledFor(userEmail) && !hasBiometricVerifiedThisOpen(userEmail)) {
        setBiometricRequired(true);
        setIsAuthenticated(false);
        setCurrentUserId(session.user.id);
        setCurrentUserEmail(userEmail);
        void loadProfile(session.user.id, userEmail);
        setMessage("Confirme sua biometria para abrir o app neste dispositivo.");
        return;
      }

      setIsAuthenticated(Boolean(session));
      setCurrentUserId(session?.user.id ?? "");
      setCurrentUserEmail(session?.user.email ?? "");
      if (session) {
        void loadProfile(session.user.id, session.user.email ?? "");
        void loadData();
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

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
  const editingMachine = machines.find((machine) => machine.id === editingMachineId);
  const showRemoteAccess = machineHasRemoteAccess(machineForm.remote_access);
  const canDownloadBackup = currentUserEmail.trim().toLowerCase() === BACKUP_ALLOWED_EMAIL;
  const currentUserHasFullAccess = hasFullAccess(currentUserRole);
  const currentUserCanManageUsers = canManageUsers(currentUserRole);
  const currentUserCanEditMachine = canEditMachine(currentUserRole);
  const currentUserCanManageContracts = canManageContracts(currentUserRole);
  const currentUserCanEmitReports = canEmitReports(currentUserRole);
  const currentUserCanEditSchedule = canEditSchedule(currentUserRole);
  const machineMainFieldsDisabled = !currentUserCanEditMachine;
  const selectedMachineAccess = normalizeRemoteAccess(selectedMachine?.remote_access ?? selectedMachine?.access_method);
  const selectedMachineContract = latestContractForMachine(supportContracts, selectedMachine);
  const selectedMachineContractDays = daysUntil(selectedMachineContract?.support_contract_until);
  const selectedMachineRecentHistory = [...(selectedMachine?.service_records ?? [])]
    .sort((a, b) => compareDate(b.service_date, a.service_date))
    .slice(0, 5);
  const openTravelSchedules = travelSchedules
    .filter((item) => !isCompletedTravel(item))
    .sort((a, b) => compareTravelBySort(a, b, travelSort) || compareText(a.client, b.client));
  const completedTravelSchedules = travelSchedules
    .filter(isCompletedTravel)
    .sort((a, b) => compareTravelBySort(a, b, completedTravelSort) || compareText(a.client, b.client));

  useEffect(() => {
    if (!currentUserCanManageContracts && scheduleTab !== "travel") {
      setScheduleTab("travel");
    }
  }, [currentUserCanManageContracts, scheduleTab]);

  const overviewData = useMemo(() => {
    const today = new Date();
    const currentMonth = monthKey(today);
    const lastSixMonths = Array.from({ length: 6 }, (_, index) => monthKey(addMonths(today, index - 5)));
    const serviceEntries = machines.flatMap((machine) => (machine.service_records ?? []).map((record) => ({ machine, record })));
    const machinesWithRemote = machines.filter((machine) => machineHasRemoteAccess(normalizeRemoteAccess(machine.remote_access ?? machine.access_method)));
    const machinesWithoutService = machines.filter((machine) => !lastServiceDate(machine));
    const machineContracts = machines
      .map((machine) => latestContractForMachine(supportContracts, machine))
      .filter((contract): contract is SupportContract => Boolean(contract));
    const activeContracts = machineContracts.filter((contract) => contract.active);
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
        services: machine.service_records?.length ?? 0
      }))
      .sort((a, b) => (b.days ?? 99999) - (a.days ?? 99999))
      .slice(0, 6);

    const topMachinesByService = [...machines]
      .map((machine) => ({ machine, value: machine.service_records?.length ?? 0 }))
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
    loadLeaflet()
      .then((leaflet) => {
        if (cancelled || !overviewMapRef.current) return;
        if (leafletMapRef.current) {
          leafletMapRef.current.remove();
          leafletMapRef.current = null;
        }

        const map = leaflet.map(overviewMapRef.current, {
          scrollWheelZoom: true,
          zoomControl: true
        }).setView([-14.235, -51.9253], 4);

        leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap"
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
          const center = await geocodeCity(item.city, item.state);
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
      })
      .catch(() => {
        setMessage("Não foi possível carregar o mapa. Verifique a conexão e tente novamente.");
      });

    return () => {
      cancelled = true;
    };
  }, [overviewData.geoCities, overviewData.geoStates, view]);

  useEffect(() => {
    setMachineForm(machineFormFromMachine(editingMachine));
  }, [editingMachineId, editingMachine]);

  useEffect(() => {
    const nextServiceType = normalizeServiceType(editingServiceRecord?.service_type);
    setServiceType(nextServiceType);
    setCustomerSignature(nextServiceType === "Visita técnica" ? editingServiceRecord?.customer_signature ?? "" : "");
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

  async function loadProfile(userId: string, userEmail: string) {
    const fallbackName = displayUserName(userEmail);
    const { data: authorizedRow } = await supabase
      .from("authorized_users")
      .select("*")
      .eq("email", userEmail.toLowerCase())
      .maybeSingle();

    if (authorizedRow) {
      const authorizedUser = authorizedRow as AuthorizedUser;
      setCurrentUserRole(authorizedUser.role);
      setCurrentUserName(authorizedUser.name || fallbackName);
      return;
    }

    setCurrentUserRole(null);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      setCurrentUserName(fallbackName);
      return;
    }

    if (data) {
      const profile = data as Profile;
      setCurrentUserName(profile.display_name || fallbackName);
      return;
    }

    const { data: insertedProfile, error: insertError } = await supabase
      .from("profiles")
      .upsert({ user_id: userId, email: userEmail, display_name: fallbackName }, { onConflict: "user_id" })
      .select()
      .single();

    if (insertError || !insertedProfile) {
      setCurrentUserName(fallbackName);
      return;
    }

    setCurrentUserName((insertedProfile as Profile).display_name || fallbackName);
  }

  async function loadData() {
    const { data: machineRows, error: machineError } = await supabase
      .from("machines")
      .select("*, machine_emails(*), service_records(*)")
      .order("code", { ascending: true });

    if (machineError) {
      setMessage(dataMessage(machineError.message || ""));
      return;
    }

    setMachines((machineRows ?? []) as Machine[]);

    const { data: userRows, error: userError } = await supabase
      .from("authorized_users")
      .select("*")
      .order("name", { ascending: true });

    if (userError) {
      setMessage(dataMessage(userError.message || ""));
      setAuthorizedUsers([]);
      return;
    }

    setAuthorizedUsers((userRows ?? []) as AuthorizedUser[]);

    const { data: scheduleRows } = await supabase
      .from("travel_schedules")
      .select("*")
      .order("created_at", { ascending: false });

    setTravelSchedules((scheduleRows ?? []) as TravelSchedule[]);

    const { data: contractRows, error: contractError } = await supabase
      .from("support_contracts")
      .select("*")
      .order("support_contract_until", { ascending: true });

    if (contractError) {
      setSupportContracts([]);
      console.warn("Tabela de contratos indisponível", contractError);
      return;
    }

    setSupportContracts((contractRows ?? []) as SupportContract[]);
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authLoading) return;
    const normalizedEmail = email.trim().toLowerCase();

    if (!isCorporateEmail(normalizedEmail)) {
      setMessage("Acesso permitido somente para e-mails corporativos da Tomasoni.");
      return;
    }

    setAuthLoading(true);
    setMessage(DEFAULT_MESSAGE);

    if (!otpSent) {
      const { data: isAuthorized, error: lookupError } = await supabase.rpc("authorized_email_exists", { input_email: normalizedEmail });
      if (lookupError || !isAuthorized) {
        setMessage("E-mail não cadastrado para acesso ao sistema.");
        setAuthLoading(false);
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: true
        }
      });

      if (error) {
        console.error("Erro ao enviar código de acesso", error);
        setMessage(authMessage(error));
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

    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: sanitizedCode,
      type: "email"
    });

    if (error || !data.session) {
      console.error("Erro ao validar código de acesso", error);
      setMessage(authMessage(error));
      setAuthLoading(false);
      return;
    }

    storeAuthConfirmation();
    storeBiometricVerifiedThisOpen(data.session.user.email ?? normalizedEmail);
    setOtpCode("");
    setOtpSent(false);
    setIsAuthenticated(true);
    setCurrentUserId(data.session.user.id);
    setCurrentUserEmail(data.session.user.email ?? normalizedEmail);
    await loadProfile(data.session.user.id, data.session.user.email ?? normalizedEmail);
    if (canUseWebAuthn() && !window.localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY) && !window.localStorage.getItem(BIOMETRIC_PROMPT_DISMISSED_KEY)) {
      setBiometricPromptOpen(true);
    }
    setMessage("Acesso autorizado.");
    await loadData();
    setAuthLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    clearAuthConfirmation();
    clearBiometricVerifiedThisOpen();
    setIsAuthenticated(false);
    setCurrentUserId("");
    setCurrentUserEmail("");
    setCurrentUserName("");
    setCurrentUserRole(null);
    setMachines([]);
    setAuthorizedUsers([]);
    setTravelSchedules([]);
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
    if (!canUseWebAuthn() || !currentUserEmail) {
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
    if (!credentialId || !canUseWebAuthn()) {
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

  function downloadMachinesBackup() {
    if (!canDownloadBackup) {
      setUserMenuOpen(false);
      setMessage("Backup disponível apenas para usuário autorizado.");
      return;
    }

    const headers = [
      "Código",
      "Modelo",
      "Descrição",
      "Cliente",
      "Localização",
      "Número de série",
      "Lista mecânica",
      "Fabricação",
      "Software",
      "Código do software",
      "VM",
      "Faixa de IP",
      "Acesso remoto",
      "IP de acesso VNC",
      "Senha VNC",
      "Usuário VM",
      "Senha VM",
      "Observações VNC",
      "Device Name SINEMA",
      "Subnet Name SINEMA",
      "Observações SINEMA",
      "Contrato ativo",
      "Tipo de contrato",
      "Final da vigência",
      "Último atendimento",
      "Quantidade de atendimentos",
      "Criado em",
      "Atualizado em"
    ];

    const rows = machines.map((machine) => [
      displayMachineCode(machine),
      machine.model ?? "",
      machine.description ?? "",
      machine.client ?? "",
      machine.unit_city ?? "",
      machine.serial ?? "",
      machine.mechanical_list ?? "",
      machine.manufacture_month ? formatMonthYear(machine.manufacture_month) : "",
      machine.software_version ?? "",
      machine.software_code ?? "",
      machine.vm ?? "",
      machine.ip_range ?? "",
      normalizeRemoteAccess(machine.remote_access ?? machine.access_method),
      machine.vnc_ip ?? "",
      machine.vnc_password ?? "",
      machine.vnc_user ?? "",
      machine.vnc_vm_password ?? "",
      machine.vnc_notes ?? "",
      machine.sinema_url ?? "",
      machine.sinema_user ?? "",
      machine.sinema_notes ?? "",
      machine.support_contract_active === null || machine.support_contract_active === undefined ? "" : machine.support_contract_active ? "Sim" : "NÃ£o",
      machine.support_contract_type ?? "",
      machine.support_contract_until ? formatDate(machine.support_contract_until) : "",
      lastServiceDate(machine) ? formatDate(lastServiceDate(machine)) : "",
      machine.service_records?.length ?? 0,
      machine.created_at ? formatDate(machine.created_at.slice(0, 10)) : "",
      machine.updated_at ? formatDate(machine.updated_at.slice(0, 10)) : ""
    ]);

    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `backup-maquinas-tomasoni-${fileTimestamp()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setUserMenuOpen(false);
    setMessage(`Backup de ${machines.length} máquinas gerado em planilha CSV.`);
  }

  async function saveUserProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayName = profileName.trim() || displayUserName(currentUserEmail);

    const { error } = await supabase
      .from("profiles")
      .upsert({
        user_id: currentUserId,
        email: currentUserEmail,
        display_name: displayName
      }, { onConflict: "user_id" });

    if (error) {
      setMessage(dataMessage(error.message));
      return;
    }

    await supabase
      .from("authorized_users")
      .update({ name: displayName })
      .eq("email", currentUserEmail.toLowerCase());

    setCurrentUserName(displayName);
    setProfileModalOpen(false);
    setMessage("Usuário atualizado com sucesso.");
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

  function startNewService() {
    if (!currentUserCanEmitReports) {
      setMessage("Seu perfil não tem permissão para emitir relatórios.");
      return;
    }

    setSignatureExpanded(false);
    setEditingServiceRecord(null);
    setSelectedServiceRecord(null);
    updateServiceType("Acesso remoto");
    setView("service");
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
        if (machineSort.key === "vm") result = compareText(a.vm, b.vm);

        return result * direction;
      });
  }, [machineFilter, machineSort, machines]);

  const registryMachines = useMemo(() => {
    return [...machines].sort((a, b) => compareText(a.code, b.code));
  }, [machines]);

  const filteredHistory = useMemo(() => {
    const term = historyFilter.trim().toLowerCase();
    const records = selectedMachine?.service_records ?? [];
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

  const clientSuggestions = useMemo(() => {
    return Array.from(new Set(
      machines
        .map((machine) => machine.client?.trim())
        .filter((client): client is string => Boolean(client))
    )).sort((a, b) => compareText(a, b));
  }, [machines]);

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
      validateCodePattern(normalizedCode, /^T665-\d{3,5}$/, "Código da máquina"),
      validateCodePattern(normalizedSoftwareCode, /^T665-\d{3,5}$/, "Código do software"),
      validateCodePattern(normalizedSerial, /^(500-\d{3}|500-\d{3}\/\d{2})$/, "Número de série"),
      validateCodePattern(normalizedMechanicalList, /^(500-\d{3}|T-0\d{3})$/, "Lista mecânica"),
      validateMonthYear(machineForm.manufacture_month, "Fabricação")
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
      description: machineForm.description.trim() || null,
      manufacture_month: normalizeMonthYear(machineForm.manufacture_month),
      mechanical_list: normalizedMechanicalList || null,
      software_code: normalizedSoftwareCode || null,
      ip_range: machineForm.ip_range.trim() || null,
      vm: machineForm.vm.trim() || null,
      software_version: machineForm.software_version.trim() || null,
      access_method: null,
      remote_access: machineForm.remote_access,
      vnc_ip: machineForm.remote_access === "VNC" ? machineForm.vnc_ip.trim() || null : null,
      vnc_user: machineForm.remote_access === "VNC" ? machineForm.vnc_user.trim() || null : null,
      vnc_password: machineForm.remote_access === "VNC" ? machineForm.vnc_password.trim() || null : null,
      vnc_vm_password: machineForm.remote_access === "VNC" ? machineForm.vnc_vm_password.trim() || null : null,
      vnc_notes: machineForm.remote_access === "VNC" ? machineForm.vnc_notes.trim() || null : null,
      sinema_url: machineForm.remote_access === "SINEMA" ? machineForm.sinema_url.trim() || null : null,
      sinema_user: machineForm.remote_access === "SINEMA" ? machineForm.sinema_user.trim() || null : null,
      sinema_password: null,
      sinema_notes: machineForm.remote_access === "SINEMA" ? machineForm.sinema_notes.trim() || null : null
    };

    const { data, error } = editingMachineId
      ? await supabase.from("machines").update(payload).eq("id", editingMachineId).select().single()
      : await supabase.from("machines").insert(payload).select().single();

    if (error || !data) {
      setMessage(dataMessage(error?.message || ""));
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
      role: userForm.role
    };

    if (!payload.name || !payload.email) {
      setMessage("Informe nome e e-mail do usuário.");
      return;
    }

    if (!isCorporateEmail(payload.email)) {
      setMessage("Cadastre apenas e-mails corporativos da Tomasoni.");
      return;
    }

    const { data, error } = editingUserId
      ? await supabase.from("authorized_users").update(payload).eq("id", editingUserId).select().single()
      : await supabase.from("authorized_users").insert(payload).select().single();

    if (error || !data) {
      setMessage(dataMessage(error?.message || ""));
      return;
    }

    const savedUser = data as AuthorizedUser;
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

  async function saveTravelSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUserCanEditSchedule) {
      setMessage("Seu usuário tem acesso apenas para visualizar o cronograma.");
      return;
    }

    const validationErrors = [
      validateDayMonth(travelForm.start_date, "Data de início"),
      validateDayMonth(travelForm.end_date, "Data de fim")
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

    const { error } = editingTravelId
      ? await supabase.from("travel_schedules").update(payload).eq("id", editingTravelId)
      : await supabase.from("travel_schedules").insert({ ...payload, created_by: currentUserId });

    if (error) {
      setMessage(dataMessage(error.message));
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

  async function saveSupportContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUserCanManageContracts) {
      setMessage("Seu usuário não tem permissão para cadastrar ou alterar contratos.");
      return;
    }

    setMessage("Salvando contrato...");

    const payload = {
      machine_id: contractForm.machine_id || null,
      code: contractForm.code.trim().toUpperCase() || null,
      client: contractForm.client.trim() || null,
      serial: contractForm.serial.trim().toUpperCase() || null,
      contract_type: contractForm.contract_type.trim() || null,
      active: contractForm.active === "Sim",
      support_contract_until: contractForm.support_contract_until || null
    };

    const { error } = editingContractId
      ? await supabase.from("support_contracts").update(payload).eq("id", editingContractId)
      : await supabase.from("support_contracts").insert({ ...payload, created_by: currentUserId });

    if (error) {
      console.error("Erro ao salvar contrato", error);
      setMessage(dataMessage(error.message));
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
      support_contract_until: contract.support_contract_until ?? "",
      active: contract.active ? "Sim" : "Não"
    });
  }

  async function deleteSupportContract(id: string) {
    if (!currentUserCanManageContracts) {
      setMessage("Seu usuário não tem permissão para excluir contratos.");
      return;
    }
    if (!confirm("Excluir este contrato?")) return;
    const { error } = await supabase.from("support_contracts").delete().eq("id", id);
    setMessage(error ? dataMessage(error.message) : "Contrato excluído.");
    await loadData();
  }

  async function sendServiceEmail(machine: Machine, record: ServiceRecord, recipients: string[]) {
    if (!recipients.length) {
      return "Atendimento salvo e PDF gerado. Nenhum e-mail foi informado para envio.";
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      return "Atendimento salvo e PDF gerado, mas não foi possível enviar o e-mail: sessão não encontrada.";
    }

    const pdfBase64 = await servicePdfBase64(machine, record);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    const response = await fetch("/api/send-service-email", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        to: recipients,
        subject: `Relatório de atendimento - Máquina ${displayMachineCode(machine)}`,
        filename: servicePdfFileName(machine, record),
        pdfBase64
      }),
      signal: controller.signal
    }).finally(() => window.clearTimeout(timeout));

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      return `Atendimento salvo e PDF gerado, mas o e-mail não foi enviado. Detalhe: ${result?.error ?? "erro não informado"}`;
    }

    return `Atendimento salvo, PDF gerado e e-mail enviado para ${recipients.join("; ")}.`;
  }

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUserCanEmitReports) {
      setMessage("Seu perfil não tem permissão para emitir relatórios.");
      return;
    }

    const isEditingService = Boolean(editingServiceRecord);
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    const machine = machines.find((item) => item.id === String(form.get("machine_id")));
    const serviceRecipients = parseEmails(String(form.get("service_recipients") ?? ""));

    if (!machine) {
      setMessage("Selecione uma máquina.");
      return;
    }

    if (editingServiceRecord && editingServiceRecord.created_by !== currentUserId) {
      setMessage("Este atendimento só pode ser alterado pelo usuário que lançou o registro.");
      return;
    }

    const selectedServiceType = normalizeServiceType(String(form.get("service_type") ?? serviceType));
    const serviceStart = String(form.get("service_start") ?? "").trim();
    const serviceEnd = String(form.get("service_end") ?? "").trim();
    const serviceDateErrors = [
      validateDayMonth(serviceStart, "Início de atendimento"),
      validateDayMonth(serviceEnd, "Fim de atendimento")
    ].filter(Boolean);

    if (serviceDateErrors.length) {
      setMessage(serviceDateErrors[0]);
      return;
    }

    const loggedTechnicianName = currentUserName || displayUserName(currentUserEmail);
    const payload = {
      machine_id: machine.id,
      technician_id: null,
      technician_name: loggedTechnicianName,
      technician_email: currentUserEmail || null,
      service_type: selectedServiceType,
      service_date: String(form.get("service_date") ?? ""),
      service_start: serviceStart || null,
      service_end: serviceEnd || null,
      equipment: String(form.get("equipment") ?? "").trim() || null,
      issue_summary: String(form.get("issue_summary") ?? "").trim() || null,
      request: String(form.get("request") ?? "").trim(),
      diagnosis: String(form.get("diagnosis") ?? "").trim(),
      service_done: String(form.get("service_done") ?? "").trim(),
      observations: String(form.get("observations") ?? "").trim() || null,
      customer_name: selectedServiceType === "Visita técnica" ? String(form.get("customer_name") ?? "").trim() || null : null,
      customer_signature: selectedServiceType === "Visita técnica" ? customerSignature || null : null
    };

    const { data, error } = editingServiceRecord
      ? await supabase
          .from("service_records")
          .update(payload)
          .eq("id", editingServiceRecord.id)
          .eq("created_by", currentUserId)
          .select()
          .single()
      : await supabase.from("service_records").insert({ ...payload, created_by: currentUserId }).select().single();

    if (error || !data) {
      setMessage(dataMessage(error?.message || ""));
      return;
    }

    const record = data as ServiceRecord;
    setSelectedMachineId(machine.id);
    setMessage(isEditingService ? "Atendimento atualizado com sucesso." : "Atendimento salvo. Gerando PDF e preparando envio por e-mail.");
    setSignatureExpanded(false);
    setEditingServiceRecord(null);
    setSelectedServiceRecord(null);
    formElement.reset();
    updateServiceType("Acesso remoto");
    await loadData();
    setView("machineDetail");

    if (!isEditingService) {
      try {
        await downloadServicePdf(machine, record);
        setMessage("Atendimento salvo. PDF gerado. Enviando e-mail aos responsáveis informados.");
        setMessage(await sendServiceEmail(machine, record, serviceRecipients));
      } catch (error) {
        const detail = error instanceof DOMException && error.name === "AbortError"
          ? "tempo limite do envio atingido"
          : error instanceof Error
            ? error.message
            : "erro não informado";
        setMessage(`Atendimento salvo e PDF gerado, mas o e-mail não foi confirmado. Detalhe: ${detail}.`);
      }
    }
  }

  function startServiceEdit(record: ServiceRecord) {
    if (record.created_by !== currentUserId) {
      setMessage("Este atendimento só pode ser alterado pelo usuário que lançou o registro.");
      return;
    }

    setSelectedMachineId(record.machine_id);
    setSelectedServiceRecord(null);
    setEditingServiceRecord(record);
    setView("service");
  }

  async function deleteMachine(id: string) {
    if (!confirm("Excluir esta máquina e todo o histórico?")) return;
    const { error } = await supabase.from("machines").delete().eq("id", id);
    setMessage(error ? dataMessage(error.message) : "Máquina excluída.");
    await loadData();
  }

  async function deleteUser(id: string) {
    if (!currentUserCanManageUsers) {
      setMessage("Seu usuário não tem permissão para excluir usuários.");
      return;
    }
    if (!confirm("Excluir este técnico?")) return;
    const { error } = await supabase.from("authorized_users").delete().eq("id", id);
    setMessage(error ? dataMessage(error.message) : "Técnico excluído.");
    await loadData();
  }

  async function deleteTravelSchedule(id: string) {
    if (!currentUserCanEditSchedule) {
      setMessage("Seu usuário tem acesso apenas para visualizar o cronograma.");
      return;
    }
    if (!confirm("Excluir este item do cronograma?")) return;
    const { error } = await supabase.from("travel_schedules").delete().eq("id", id);
    setMessage(error ? dataMessage(error.message) : "Item do cronograma excluído.");
    await loadData();
  }

  async function deleteServiceRecord(record: ServiceRecord) {
    if (!currentUserHasFullAccess && record.created_by !== currentUserId) {
      setMessage("Este atendimento só pode ser excluído pelo autor ou por usuário com acesso total.");
      return;
    }
    if (!confirm("Excluir este atendimento?")) return;
    const { error } = await supabase.from("service_records").delete().eq("id", record.id);
    setMessage(error ? dataMessage(error.message) : "Atendimento excluído.");
    setSelectedServiceRecord(null);
    await loadData();
  }

  if (!sessionReady) return <main className="centered">Carregando...</main>;

  if (!isSupabaseConfigured) {
    return (
      <main className="login-page">
        <section className="login-card">
          <Image src="/tomasoni-logo-transparent.png" alt="Tomasoni" width={300} height={80} priority />
          <h1>Configuração pendente</h1>
          <p>Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no arquivo `.env.local` ou nas variáveis de ambiente da Vercel.</p>
        </section>
      </main>
    );
  }

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
          <button className={`nav-item ${view === "schedule" ? "active" : ""}`} onClick={() => setView("schedule")}>Cronograma</button>
          {(currentUserCanEditMachine || currentUserCanManageUsers) && <button className={`nav-item ${view === "registry" ? "active" : ""}`} onClick={() => { setRegistryTab("machines"); setView("registry"); }}>Cadastro</button>}
        </nav>
        <div className="user-menu">
          <button className="user-menu-trigger" type="button" onClick={() => setUserMenuOpen((open) => !open)} aria-expanded={userMenuOpen}>
            <span className="avatar">{initialsFromEmail(currentUserEmail)}</span>
            <span className="user-meta">
              <strong>{currentUserName || displayUserName(currentUserEmail)}</strong>
              <small>{currentUserRole || "Usuário autorizado"}</small>
            </span>
            <MoreIcon />
          </button>
          {userMenuOpen && (
            <div className="user-menu-content">
              <button type="button" onClick={editUser}><EditIcon /> Editar Usuário</button>
              {canDownloadBackup && <button type="button" onClick={downloadMachinesBackup}><PdfDownloadIcon /> Backup de máquinas</button>}
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
                  <div className="real-map" ref={overviewMapRef} aria-label="Mapa de máquinas por estado e cidade" />
                  <div className="state-map-list">
                    {overviewData.byState.map((item) => (
                      <button key={item.name} type="button" onClick={() => { setMachineFilter(item.name === "Sem localização" ? "" : item.name); setView("home"); }}>
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

        {view === "schedule" && (
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
                  <label>Data de início<input value={travelForm.start_date} onChange={(event) => setTravelForm((current) => ({ ...current, start_date: event.target.value }))} placeholder="dd/mm ou A definir" /></label>
                  <label>Data de fim<input value={travelForm.end_date} onChange={(event) => setTravelForm((current) => ({ ...current, end_date: event.target.value }))} placeholder="dd/mm ou A definir" /></label>
                  <label>Código<input value={travelForm.code} onChange={(event) => setTravelForm((current) => ({ ...current, code: event.target.value }))} placeholder="T665-xxx" maxLength={10} /></label>
                  <label>Cliente<input list="client-suggestions" value={travelForm.client} onChange={(event) => setTravelForm((current) => ({ ...current, client: event.target.value }))} /></label>
                  <label>Técnicos<input value={travelForm.technicians} onChange={(event) => setTravelForm((current) => ({ ...current, technicians: event.target.value }))} placeholder="Nomes separados por vírgula" /></label>
                  <label>Status<select value={travelForm.status} onChange={(event) => setTravelForm((current) => ({ ...current, status: event.target.value }))}>
                    {TRAVEL_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select></label>
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
                    <label>Máquina<select value={contractForm.machine_id} onChange={(event) => updateContractMachine(event.target.value)}>
                      <option value="">Selecionar máquina, se aplicável</option>
                      {machines.map((machine) => <option key={machine.id} value={machine.id}>{displayMachineCode(machine)} - {machine.client || "Cliente não informado"}</option>)}
                    </select></label>
                    <label>Código<input value={contractForm.code} onChange={(event) => setContractForm((current) => ({ ...current, code: event.target.value }))} placeholder="T665-xxx" maxLength={10} /></label>
                    <label>Cliente<input list="client-suggestions" value={contractForm.client} onChange={(event) => setContractForm((current) => ({ ...current, client: event.target.value }))} /></label>
                    <label>Número de série<input value={contractForm.serial} onChange={(event) => setContractForm((current) => ({ ...current, serial: event.target.value }))} placeholder="500-xxx ou 500-697/22" maxLength={12} /></label>
                    <label>Contrato ativo<select value={contractForm.active} onChange={(event) => setContractForm((current) => ({ ...current, active: event.target.value }))}>
                      <option value="Sim">Sim</option>
                      <option value="Não">Não</option>
                    </select></label>
                    <label>Tipo de contrato<select value={contractForm.contract_type} onChange={(event) => setContractForm((current) => ({ ...current, contract_type: event.target.value }))}>
                      <option value="">Selecione</option>
                      {CONTRACT_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select></label>
                    <label>Final de vigência<input type="date" value={contractForm.support_contract_until} onChange={(event) => setContractForm((current) => ({ ...current, support_contract_until: event.target.value }))} /></label>
                  </div>
                </form>

                <section className="table-panel">
                  <div className="section-header"><h2>Contratos cadastrados</h2><span>{supportContracts.length} registros</span></div>
                  <div className="table-wrap">
                    <table className="compact-table schedule-table">
                      <thead><tr><th>Código</th><th>Cliente</th><th>Número de série</th><th>Tipo</th><th>Status</th><th>Fim da vigência</th><th>Prazo</th><th>Ações</th></tr></thead>
                      <tbody>{supportContracts.map((contract) => {
                        const remainingDays = daysUntil(contract.support_contract_until);
                        return (
                          <tr key={contract.id}>
                            <td>{contract.code || "-"}</td>
                            <td>{contract.client || "-"}</td>
                            <td>{contract.serial || "-"}</td>
                            <td>{contract.contract_type || "-"}</td>
                            <td><span className={`soft-pill ${contract.active ? "" : "danger-pill"}`}>{contract.active ? "Ativo" : "Inativo"}</span></td>
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
              <aside className={`contract-card ${selectedMachineContract?.active ? "active" : "inactive"}`}>
                <DetailIcon type={selectedMachineContract?.active ? "check" : "alert"} />
                <strong>{selectedMachineContract?.active ? "Contrato Ativo" : "Sem contrato ativo"}</strong>
                {selectedMachineContract?.active && (
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

              <article className="dashboard-card">
                <div className="card-title"><DetailIcon type="remote" /><h3>Acesso Remoto</h3><span className="soft-pill">{selectedMachineAccess}</span></div>
                <dl className="spec-list">
                  {selectedMachineAccess === "VNC" && (
                    <>
                      <div><dt>IP de acesso</dt><dd>{selectedMachine.vnc_ip || "-"}</dd></div>
                      <div><dt>Senha</dt><dd>{selectedMachine.vnc_password || "-"}</dd></div>
                      <div><dt>Usuário VM</dt><dd>{selectedMachine.vnc_user || "-"}</dd></div>
                      <div><dt>Senha VM</dt><dd>{selectedMachine.vnc_vm_password || "-"}</dd></div>
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
                <button type="button" onClick={startNewService}><PlusIcon /><span>Novo atendimento</span></button>
                {currentUserCanEditMachine && <button type="button" onClick={() => { setEditingMachineId(selectedMachine.id); setRegistryTab("machines"); setView("registry"); }}><EditIcon /><span>Alterar cadastro</span></button>}
                <button type="button" onClick={() => selectedMachineRecentHistory[0] && downloadServicePdf(selectedMachine, selectedMachineRecentHistory[0])} disabled={!selectedMachineRecentHistory.length}><PdfDownloadIcon /><span>Baixar último PDF</span></button>
              </div>
            </section>

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
                                <button type="button" onClick={() => { downloadServicePdf(selectedMachine, record); setOpenActionMenu(""); }}><PdfDownloadIcon /> Baixar PDF</button>
                                {record.created_by === currentUserId && <button type="button" onClick={() => { startServiceEdit(record); setOpenActionMenu(""); }}><EditIcon /> Editar</button>}
                                {(record.created_by === currentUserId || currentUserHasFullAccess) && <button className="danger" type="button" onClick={() => { void deleteServiceRecord(record); setOpenActionMenu(""); }}><TrashIcon /> Excluir</button>}
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
              <label>Máquina<select name="machine_id" required defaultValue={editingServiceRecord?.machine_id ?? serviceMachine?.id}>{machines.map((machine) => <option key={machine.id} value={machine.id}>{displayMachineCode(machine)}</option>)}</select></label>
              <label>Equipamento<input name="equipment" placeholder="CLP, IHM, servo, inversor" defaultValue={editingServiceRecord?.equipment ?? ""} /></label>
              <label>Técnico responsável<input value={currentUserName || displayUserName(currentUserEmail)} readOnly /></label>
              <label>Data<input name="service_date" type="date" required defaultValue={editingServiceRecord?.service_date ?? new Date().toISOString().slice(0, 10)} /></label>
              <label>Início do atendimento<input name="service_start" placeholder="dd/mm" pattern="\d{2}/\d{2}" defaultValue={editingServiceRecord?.service_start ?? ""} /></label>
              <label>Fim do atendimento<input name="service_end" placeholder="dd/mm" pattern="\d{2}/\d{2}" defaultValue={editingServiceRecord?.service_end ?? ""} /></label>
              <label>Tipo de atendimento<select name="service_type" value={serviceType} onChange={(event) => updateServiceType(event.target.value as ServiceType)}>
                {SERVICE_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select></label>
              {!editingServiceRecord && <label className="wide">E-mails para envio<textarea name="service_recipients" rows={2} placeholder="um@email.com; outro@email.com" /></label>}
              {serviceType === "Visita técnica" && (
                <label>Cliente / representante<input name="customer_name" placeholder="Nome de quem assinou" defaultValue={editingServiceRecord?.customer_name ?? ""} /></label>
              )}
              <label className="wide">Motivo breve<input name="issue_summary" placeholder="Ex.: Falha no acionamento X" defaultValue={editingServiceRecord?.issue_summary ?? ""} /></label>
              <label className="wide">Solicitação do cliente / problema relatado<textarea name="request" rows={3} required defaultValue={editingServiceRecord?.request ?? ""} /></label>
              <label className="wide">Diagnóstico<textarea name="diagnosis" rows={3} required defaultValue={editingServiceRecord?.diagnosis ?? ""} /></label>
              <label className="wide">Serviço realizado<textarea name="service_done" rows={3} required defaultValue={editingServiceRecord?.service_done ?? ""} /></label>
              <label className="wide">Observações<textarea name="observations" rows={3} defaultValue={editingServiceRecord?.observations ?? ""} /></label>
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
              <button className="icon-button save-action" type="submit" title={editingServiceRecord ? "Salvar alterações" : "Salvar e gerar PDF"} aria-label={editingServiceRecord ? "Salvar alterações" : "Salvar e gerar PDF"}><SaveIcon /></button>
            </div>
          </form>
        )}

        {view === "registry" && (
          <section className="view active">
            <section className="table-panel">
              <div className="section-header">
                <h2>Cadastro</h2>
                <div className="segmented-control" aria-label="Tipo de cadastro">
                  <button className={registryTab === "machines" ? "active" : ""} type="button" onClick={() => setRegistryTab("machines")}><DetailIcon type="software" /> Máquinas</button>
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
                      <label>Código<input disabled={machineMainFieldsDisabled} value={machineForm.code} onChange={(event) => updateMachineForm("code", event.target.value)} placeholder="T665-xxx" maxLength={10} /></label>
                      <label>Modelo<input disabled={machineMainFieldsDisabled} value={machineForm.model} onChange={(event) => updateMachineForm("model", event.target.value)} placeholder="Onduladeira, Dryend, ICV..." maxLength={120} /></label>
                      <label className="wide">Descrição<textarea disabled={machineMainFieldsDisabled} rows={4} value={machineForm.description} onChange={(event) => updateMachineForm("description", event.target.value)} placeholder="Detalhe o modelo da máquina, configuração ou observações do equipamento" maxLength={4000} /></label>
                      <label>Cliente<input disabled={machineMainFieldsDisabled} list="client-suggestions" value={machineForm.client} onChange={(event) => updateMachineForm("client", event.target.value)} placeholder="Nome da empresa" maxLength={160} /></label>
                      <datalist id="client-suggestions">{clientSuggestions.map((client) => <option key={client} value={client} />)}</datalist>
                      <label>Localização<input disabled={machineMainFieldsDisabled} list="city-suggestions" value={machineForm.unit_city} onChange={(event) => updateMachineForm("unit_city", event.target.value)} placeholder="Cidade - UF ou Cidade - PAIS" maxLength={160} /></label>
                      <datalist id="city-suggestions">{citySuggestions.map((city) => <option key={city} value={city} />)}</datalist>
                      <label>Mecânica<input disabled={machineMainFieldsDisabled} value={machineForm.mechanical_list} onChange={(event) => updateMachineForm("mechanical_list", event.target.value)} placeholder="500-xxx ou T-0xxx" maxLength={10} /></label>
                      <label>Código do software<input disabled={machineMainFieldsDisabled} value={machineForm.software_code} onChange={(event) => updateMachineForm("software_code", event.target.value)} placeholder="T665-xxx" maxLength={10} /></label>
                      <label>VM<input disabled={machineMainFieldsDisabled} value={machineForm.vm} onChange={(event) => updateMachineForm("vm", event.target.value)} placeholder="VM onde o software está alocado" maxLength={120} /></label>
                      <label>Faixa de IP<input disabled={machineMainFieldsDisabled} value={machineForm.ip_range} onChange={(event) => updateMachineForm("ip_range", event.target.value)} placeholder="Ex.: 189.1.87.xxx" maxLength={120} /></label>
                      <label>Número de série<input disabled={machineMainFieldsDisabled} value={machineForm.serial} onChange={(event) => updateMachineForm("serial", event.target.value)} placeholder="500-xxx ou 500-697/22" maxLength={12} /></label>
                      <label>Fabricação<input disabled={machineMainFieldsDisabled} value={machineForm.manufacture_month} onChange={(event) => updateMachineForm("manufacture_month", event.target.value)} placeholder="mm/aa" pattern="\d{2}/\d{2}" maxLength={5} /></label>
                      <label>Software<input disabled={machineMainFieldsDisabled} value={machineForm.software_version} onChange={(event) => updateMachineForm("software_version", event.target.value)} placeholder="TIA Vx, Scout..." maxLength={120} /></label>
                    </div>
                  </section>

                  <section className="form-card">
                    <h3>Informações de Acesso</h3>
                    <div className="fields-grid">
                      <label>Acesso remoto<select disabled={machineMainFieldsDisabled} value={machineForm.remote_access} onChange={(event) => updateMachineForm("remote_access", event.target.value as RemoteAccess)}>
                        {REMOTE_ACCESS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select></label>
                    </div>

                  {showRemoteAccess && (
                    <>
                      {machineForm.remote_access === "VNC" && (
                        <div className="fields-grid">
                          <label>IP de acesso<input disabled={machineMainFieldsDisabled} value={machineForm.vnc_ip} onChange={(event) => updateMachineForm("vnc_ip", event.target.value)} /></label>
                          <label>Senha<input type="text" value={machineForm.vnc_password} onChange={(event) => updateMachineForm("vnc_password", event.target.value)} /></label>
                          <label>Usuário VM<input value={machineForm.vnc_user} onChange={(event) => updateMachineForm("vnc_user", event.target.value)} /></label>
                          <label>Senha VM<input type="text" value={machineForm.vnc_vm_password} onChange={(event) => updateMachineForm("vnc_vm_password", event.target.value)} /></label>
                          <label className="wide">Observações de acesso<textarea rows={3} value={machineForm.vnc_notes} onChange={(event) => updateMachineForm("vnc_notes", event.target.value)} /></label>
                        </div>
                      )}
                      {machineForm.remote_access === "SINEMA" && (
                        <div className="fields-grid">
                          <label>Device Name<input disabled={machineMainFieldsDisabled} value={machineForm.sinema_url} onChange={(event) => updateMachineForm("sinema_url", event.target.value)} /></label>
                          <label>Subnet Name<input value={machineForm.sinema_user} onChange={(event) => updateMachineForm("sinema_user", event.target.value)} /></label>
                          <label className="wide">Observações<textarea rows={3} value={machineForm.sinema_notes} onChange={(event) => updateMachineForm("sinema_notes", event.target.value)} /></label>
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
                    <label>Perfil / Setor<select value={userForm.role} onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value as UserRole }))}>
                      {USER_ROLE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select></label>
                  </div>
                </form>
                <section className="table-panel">
                  <div className="table-wrap">
                    <table className="compact-table">
                      <thead><tr>
                        <th><button className="sort-header" type="button" onClick={() => toggleUserSort("name")}>Usuário <span>{sortMark(userSort.key === "name", userSort.direction)}</span></button></th>
                        <th><button className="sort-header" type="button" onClick={() => toggleUserSort("email")}>E-mail <span>{sortMark(userSort.key === "email", userSort.direction)}</span></button></th>
                        <th><button className="sort-header" type="button" onClick={() => toggleUserSort("role")}>Perfil / Setor <span>{sortMark(userSort.key === "role", userSort.direction)}</span></button></th>
                        <th>Ações</th>
                      </tr></thead>
                      <tbody>{sortedUsers.map((user) => (
                        <tr key={user.id}>
                          <td>{user.name}</td>
                          <td>{user.email}</td>
                          <td>{user.role}</td>
                          <td>
                            <div className="row-actions">
                              <button className="icon-button menu-trigger" type="button" title="Ações" aria-label={`Ações do usuário ${user.name}`} onClick={(event) => toggleActionMenu(`user-${user.id}`, event)}><MoreIcon /></button>
                              {openActionMenu === `user-${user.id}` && (
                                <div className="row-menu floating-row-menu" style={actionMenuPosition ?? undefined}>
                                  <button type="button" onClick={() => { setEditingUserId(user.id); setUserForm({ name: user.name, email: user.email, role: user.role }); setOpenActionMenu(""); }}><EditIcon /> Alterar</button>
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
              </div>
              <div className="modal-actions">
                <button className="icon-button download" type="button" title="Baixar PDF" aria-label="Baixar PDF" onClick={() => downloadServicePdf(selectedMachine, selectedServiceRecord)}><PdfDownloadIcon /></button>
                {selectedServiceRecord.created_by === currentUserId && (
                  <button className="button primary" type="button" onClick={() => startServiceEdit(selectedServiceRecord)}>Editar atendimento</button>
                )}
                {(currentUserHasFullAccess || selectedServiceRecord.created_by === currentUserId) && (
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

        {biometricPromptOpen && (
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
