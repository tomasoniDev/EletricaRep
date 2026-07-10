"use client";

import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { downloadServicePdf, servicePdfBase64, servicePdfFileName } from "@/lib/pdf";
import type { Machine, Profile, ServiceRecord, Technician } from "@/lib/types";

type View = "home" | "machineDetail" | "service" | "registry";
type RegistryTab = "machines" | "technicians";
type SortDirection = "asc" | "desc";
type MachineSortKey = "code" | "model" | "client" | "unit_city" | "serial" | "software_version" | "last_service";
type HistorySortKey = "service_date" | "equipment" | "technician_name" | "issue_summary";
type TechnicianSortKey = "name" | "email";
type RemoteAccess = "SINEMA" | "VNC" | "Sem acesso remoto";
type ServiceType = "Acesso remoto" | "Visita técnica";
type ThemeMode = "light" | "dark";
type ContractType = "Seg-Sex" | "Seg-Sab" | "Garantia";

type MachineFormState = {
  code: string;
  mechanical_list: string;
  software_code: string;
  ip_range: string;
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
  support_contract_active: string;
  support_contract_type: string;
  support_contract_until: string;
};

const ALLOWED_EMAIL_DOMAINS = ["tomasoni.ind.br", "tomasoni.in.br"];
const DEFAULT_MESSAGE = "Consulte uma máquina pelo código ou selecione uma linha da tabela.";
const AUTH_CONFIRMED_AT_KEY = "tomasoni-servicecore-auth-confirmed-at";
const AUTH_CONFIRMATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const THEME_KEY = "tomasoni-servicecore-theme";
const REMOTE_ACCESS_OPTIONS: RemoteAccess[] = ["Sem acesso remoto", "SINEMA", "VNC"];
const SERVICE_TYPE_OPTIONS: ServiceType[] = ["Acesso remoto", "Visita técnica"];
const CONTRACT_TYPE_OPTIONS: ContractType[] = ["Seg-Sex", "Seg-Sab", "Garantia"];
const EMPTY_MACHINE_FORM: MachineFormState = {
  code: "",
  mechanical_list: "",
  software_code: "",
  ip_range: "",
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
  sinema_notes: "",
  support_contract_active: "",
  support_contract_type: "",
  support_contract_until: ""
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

function machineFormFromMachine(machine?: Machine | null): MachineFormState {
  if (!machine) return EMPTY_MACHINE_FORM;
  return {
    code: machine.code ?? "",
    mechanical_list: machine.mechanical_list ?? "",
    software_code: machine.software_code ?? "",
    ip_range: machine.ip_range ?? "",
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
    sinema_notes: machine.sinema_notes ?? "",
    support_contract_active: machine.support_contract_active === null || machine.support_contract_active === undefined ? "" : machine.support_contract_active ? "Sim" : "Não",
    support_contract_type: machine.support_contract_type ?? "",
    support_contract_until: machine.support_contract_until ?? ""
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

function compareText(first?: string | null, second?: string | null) {
  return (first ?? "").localeCompare(second ?? "", "pt-BR", { numeric: true, sensitivity: "base" });
}

function compareDate(first?: string | null, second?: string | null) {
  return (first ?? "").localeCompare(second ?? "");
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
  if (normalized.includes("duplicate") || normalized.includes("unique")) return "Já existe um cadastro com estes dados.";
  if (normalized.includes("permission") || normalized.includes("row-level security")) return "Seu usuário não tem permissão para executar esta ação.";
  if (normalized.includes("network") || normalized.includes("fetch")) return "Falha de conexão. Verifique a internet e tente novamente.";
  return "Não foi possível concluir a operação. Revise os dados e tente novamente.";
}

function screenLegend(view: View, registryTab: RegistryTab, selectedMachine?: Machine) {
  if (view === "home") return "Consulte uma máquina pelo código ou selecione uma linha da tabela.";
  if (view === "machineDetail") return selectedMachine ? `Dados cadastrais e histórico da máquina ${displayMachineCode(selectedMachine)}.` : "Dados cadastrais e histórico da máquina.";
  if (view === "service") return "Registre um novo atendimento técnico e gere o relatório em PDF.";
  if (registryTab === "machines") return "Cadastre, altere ou exclua máquinas e informações de acesso.";
  return "Cadastre e gerencie os técnicos disponíveis para lançamento dos atendimentos.";
}

function helpText(view: View, registryTab: RegistryTab) {
  if (view === "home") return "Use o filtro para localizar uma máquina por código, modelo, cliente ou localização. Clique no código da máquina para abrir os dados cadastrais e o histórico de atendimentos.";
  if (view === "machineDetail") return "Nesta tela ficam os dados técnicos da máquina, informações de acesso remoto e histórico. Clique em um atendimento para ver o registro completo ou use o menu de ações para baixar o PDF.";
  if (view === "service") return "Registre o atendimento com tipo, motivo breve e descrições completas. Em visita técnica, colete a assinatura do cliente para incluir no PDF.";
  if (registryTab === "machines") return "Cadastre ou altere máquinas e informações de acesso. Use o menu de ações da tabela para editar ou excluir cadastros.";
  return "Cadastre os técnicos disponíveis para lançamento dos atendimentos. O nome do técnico aparece no relatório e no histórico.";
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
      <path d="M5 4h12l2 2v14H5z" />
      <path d="M8 4v6h8V4M8 20v-6h8v6" />
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
  const [view, setView] = useState<View>("home");
  const [registryTab, setRegistryTab] = useState<RegistryTab>("machines");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [machineFilter, setMachineFilter] = useState("");
  const [historyFilter, setHistoryFilter] = useState("");
  const [machineSort, setMachineSort] = useState<{ key: MachineSortKey; direction: SortDirection }>({ key: "last_service", direction: "desc" });
  const [historySort, setHistorySort] = useState<{ key: HistorySortKey; direction: SortDirection }>({ key: "service_date", direction: "desc" });
  const [technicianSort, setTechnicianSort] = useState<{ key: TechnicianSortKey; direction: SortDirection }>({ key: "name", direction: "asc" });
  const [editingMachineId, setEditingMachineId] = useState("");
  const [editingTechnicianId, setEditingTechnicianId] = useState("");
  const [selectedServiceRecord, setSelectedServiceRecord] = useState<ServiceRecord | null>(null);
  const [editingServiceRecord, setEditingServiceRecord] = useState<ServiceRecord | null>(null);
  const [machineForm, setMachineForm] = useState<MachineFormState>(EMPTY_MACHINE_FORM);
  const [serviceType, setServiceType] = useState<ServiceType>("Acesso remoto");
  const [customerSignature, setCustomerSignature] = useState("");
  const [isSigning, setIsSigning] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [openActionMenu, setOpenActionMenu] = useState("");

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
    setUserMenuOpen(false);
  }, [view, registryTab]);

  useEffect(() => {
    function closeFloatingLayers(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (!target.closest(".user-menu")) setUserMenuOpen(false);
      if (!target.closest(".row-actions")) setOpenActionMenu("");
    }

    document.addEventListener("mousedown", closeFloatingLayers);
    return () => document.removeEventListener("mousedown", closeFloatingLayers);
  }, []);

  const selectedMachine = machines.find((machine) => machine.id === selectedMachineId);
  const serviceMachine = selectedMachine ?? machines[0];
  const editingMachine = machines.find((machine) => machine.id === editingMachineId);
  const showRemoteAccess = machineHasRemoteAccess(machineForm.remote_access);
  const selectedMachineAccess = normalizeRemoteAccess(selectedMachine?.remote_access ?? selectedMachine?.access_method);
  const selectedMachineContractDays = daysUntil(selectedMachine?.support_contract_until);
  const selectedMachineRecentHistory = [...(selectedMachine?.service_records ?? [])]
    .sort((a, b) => compareDate(b.service_date, a.service_date))
    .slice(0, 5);

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
    setOtpCode("");
    setOtpSent(false);
    setIsAuthenticated(true);
    setCurrentUserId(data.session.user.id);
    setCurrentUserEmail(data.session.user.email ?? normalizedEmail);
    await loadProfile(data.session.user.id, data.session.user.email ?? normalizedEmail);
    setMessage("Acesso autorizado.");
    await loadData();
    setAuthLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    clearAuthConfirmation();
    setIsAuthenticated(false);
    setCurrentUserId("");
    setCurrentUserEmail("");
    setCurrentUserName("");
    setMachines([]);
    setTechnicians([]);
  }

  function toggleTheme() {
    setTheme((current) => current === "dark" ? "light" : "dark");
  }

  function editUser() {
    setUserMenuOpen(false);
    setProfileName(currentUserName || displayUserName(currentUserEmail));
    setProfileModalOpen(true);
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

  function startSignature(event: PointerEvent<HTMLCanvasElement>) {
    if (serviceType !== "Visita técnica") return;
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
    if (value !== "Visita técnica") clearSignature();
  }

  function startNewService() {
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
        return [machine.code, machine.mechanical_list, machine.software_code, machine.model, machine.description, machine.client, machine.unit_city, machine.serial, machine.manufacture_month, machine.software_version, machine.remote_access, machine.access_method]
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

  const sortedTechnicians = useMemo(() => {
    return [...technicians].sort((a, b) => {
      const direction = technicianSort.direction === "asc" ? 1 : -1;
      const result = technicianSort.key === "name" ? compareText(a.name, b.name) : compareText(a.email, b.email);
      return result * direction;
    });
  }, [technicianSort, technicians]);

  function toggleMachineSort(key: MachineSortKey) {
    setMachineSort((current) => ({ key, direction: nextDirection(current.key === key, current.direction) }));
  }

  function toggleHistorySort(key: HistorySortKey) {
    setHistorySort((current) => ({ key, direction: nextDirection(current.key === key, current.direction) }));
  }

  function toggleTechnicianSort(key: TechnicianSortKey) {
    setTechnicianSort((current) => ({ key, direction: nextDirection(current.key === key, current.direction) }));
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
          next.support_contract_active = "";
          next.support_contract_type = "";
          next.support_contract_until = "";
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

      if (key === "support_contract_active" && value !== "Sim") {
        next.support_contract_type = "";
      }

      return next;
    });
  }

  async function saveMachine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      code: machineForm.code.trim().toUpperCase() || null,
      model: machineForm.model.trim() || null,
      client: machineForm.client.trim() || null,
      unit_city: machineForm.unit_city.trim() || null,
      serial: machineForm.serial.trim() || null,
      description: machineForm.description.trim() || null,
      manufacture_month: normalizeMonthYear(machineForm.manufacture_month),
      mechanical_list: machineForm.mechanical_list.trim() || null,
      software_code: machineForm.software_code.trim().toUpperCase() || null,
      ip_range: machineForm.ip_range.trim() || null,
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
      sinema_notes: machineForm.remote_access === "SINEMA" ? machineForm.sinema_notes.trim() || null : null,
      support_contract_active: showRemoteAccess ? machineForm.support_contract_active === "Sim" : null,
      support_contract_type: showRemoteAccess && machineForm.support_contract_active === "Sim" ? machineForm.support_contract_type.trim() || null : null,
      support_contract_until: showRemoteAccess ? machineForm.support_contract_until.trim() || null : null
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

  async function saveTechnician(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim() || null
    };

    const { error } = editingTechnicianId
      ? await supabase.from("technicians").update(payload).eq("id", editingTechnicianId)
      : await supabase.from("technicians").insert(payload);

    if (error) {
      setMessage(dataMessage(error.message));
      return;
    }

    setEditingTechnicianId("");
    setMessage("Técnico salvo com sucesso.");
    event.currentTarget.reset();
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
    const loggedTechnicianName = currentUserName || displayUserName(currentUserEmail);
    const payload = {
      machine_id: machine.id,
      technician_id: null,
      technician_name: loggedTechnicianName,
      technician_email: currentUserEmail || null,
      service_type: selectedServiceType,
      service_date: String(form.get("service_date") ?? ""),
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

  async function deleteTechnician(id: string) {
    if (!confirm("Excluir este técnico?")) return;
    const { error } = await supabase.from("technicians").delete().eq("id", id);
    setMessage(error ? dataMessage(error.message) : "Técnico excluído.");
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
          <button className={`nav-item ${view === "registry" ? "active" : ""}`} onClick={() => { setRegistryTab("machines"); setView("registry"); }}>Cadastro</button>
        </nav>
        <div className="user-menu">
          <button className="user-menu-trigger" type="button" onClick={() => setUserMenuOpen((open) => !open)} aria-expanded={userMenuOpen}>
            <span className="avatar">{initialsFromEmail(currentUserEmail)}</span>
            <span className="user-meta">
              <strong>{currentUserName || displayUserName(currentUserEmail)}</strong>
              <small>{currentUserEmail || "Sessão ativa"}</small>
            </span>
            <MoreIcon />
          </button>
          {userMenuOpen && (
            <div className="user-menu-content">
              <button type="button" onClick={editUser}><EditIcon /> Editar Usuário</button>
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
            <button className="icon-button add-action" type="button" title="Novo atendimento" aria-label="Novo atendimento" onClick={startNewService}><PlusIcon /></button>
          </div>
        </header>

        <section className="status-band">
          <strong>{screenLegend(view, registryTab, selectedMachine)}</strong>
          {message !== DEFAULT_MESSAGE && <span>{message}</span>}
        </section>

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
                    <th><button className="sort-header" type="button" onClick={() => toggleMachineSort("last_service")}>Último atendimento <span>{sortMark(machineSort.key === "last_service", machineSort.direction)}</span></button></th>
                  </tr></thead>
                  <tbody>
                    {filteredMachines.map((machine) => (
                      <tr key={machine.id}>
                        <td><button className="link-button" onClick={() => { setSelectedMachineId(machine.id); setHistoryFilter(""); setView("machineDetail"); }}>{displayMachineCode(machine)}</button></td>
                        <td>{machine.model || "-"}</td>
                        <td>{machine.client || "-"}</td>
                        <td>{machine.unit_city || "-"}</td>
                        <td>{formatDate(lastServiceDate(machine))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
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
              <aside className={`contract-card ${selectedMachine.support_contract_active ? "active" : "inactive"}`}>
                <DetailIcon type={selectedMachine.support_contract_active ? "check" : "alert"} />
                <strong>{selectedMachine.support_contract_active ? "Contrato Ativo" : "Sem contrato ativo"}</strong>
                {selectedMachine.support_contract_active && (
                  <>
                    <span>Tipo de contrato</span>
                    <b>{selectedMachine.support_contract_type || "-"}</b>
                    <span>Fim da vigência</span>
                    <em>{formatDate(selectedMachine.support_contract_until)}</em>
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
                <button type="button" onClick={() => { setEditingMachineId(selectedMachine.id); setRegistryTab("machines"); setView("registry"); }}><EditIcon /><span>Alterar cadastro</span></button>
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
                            <button className="icon-button menu-trigger" type="button" title="Ações" aria-label="Ações do atendimento" onClick={() => setOpenActionMenu(openActionMenu === `service-${record.id}` ? "" : `service-${record.id}`)}><MoreIcon /></button>
                            {openActionMenu === `service-${record.id}` && (
                              <div className="row-menu">
                                <button type="button" onClick={() => { downloadServicePdf(selectedMachine, record); setOpenActionMenu(""); }}><PdfDownloadIcon /> Baixar PDF</button>
                                {record.created_by === currentUserId && <button type="button" onClick={() => { startServiceEdit(record); setOpenActionMenu(""); }}><EditIcon /> Editar</button>}
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
                <section className="signature-panel wide">
                  <div className="section-header">
                    <div>
                      <h3>Assinatura do cliente</h3>
                      <p>Assine com mouse, touchpad ou tela touch.</p>
                    </div>
                    <button className="button ghost" type="button" onClick={clearSignature}>Limpar assinatura</button>
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
              </div>
            </section>

            {registryTab === "machines" && (
              <>
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
                      <label>Código<input value={machineForm.code} onChange={(event) => updateMachineForm("code", event.target.value)} placeholder="Número do projeto" /></label>
                      <label>Modelo<input value={machineForm.model} onChange={(event) => updateMachineForm("model", event.target.value)} placeholder="Onduladeira, Dryend, ICV..." /></label>
                      <label className="wide">Descrição<textarea rows={3} value={machineForm.description} onChange={(event) => updateMachineForm("description", event.target.value)} placeholder="Detalhe o modelo da máquina, configuração ou observações do equipamento" /></label>
                      <label>Cliente<input value={machineForm.client} onChange={(event) => updateMachineForm("client", event.target.value)} placeholder="Nome da empresa" /></label>
                      <label>Localização<input value={machineForm.unit_city} onChange={(event) => updateMachineForm("unit_city", event.target.value)} placeholder="Cidade - Estado" /></label>
                      <label>Mecânica<input value={machineForm.mechanical_list} onChange={(event) => updateMachineForm("mechanical_list", event.target.value)} placeholder="Lista mecânica" /></label>
                      <label>Código do software<input value={machineForm.software_code} onChange={(event) => updateMachineForm("software_code", event.target.value)} placeholder="Código do software da máquina" /></label>
                      <label>Faixa de IP<input value={machineForm.ip_range} onChange={(event) => updateMachineForm("ip_range", event.target.value)} placeholder="Ex.: 189.1.87.xxx" /></label>
                      <label>Número de série<input value={machineForm.serial} onChange={(event) => updateMachineForm("serial", event.target.value)} /></label>
                      <label>Fabricação<input value={machineForm.manufacture_month} onChange={(event) => updateMachineForm("manufacture_month", event.target.value)} placeholder="mm/aa" pattern="\d{2}/\d{2}" /></label>
                      <label>Software<input value={machineForm.software_version} onChange={(event) => updateMachineForm("software_version", event.target.value)} placeholder="TIA Vx, Scout..." /></label>
                    </div>
                  </section>

                  <section className="form-card">
                    <h3>Informações de Acesso</h3>
                    <div className="fields-grid">
                      <label>Acesso remoto<select value={machineForm.remote_access} onChange={(event) => updateMachineForm("remote_access", event.target.value as RemoteAccess)}>
                        {REMOTE_ACCESS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select></label>
                    </div>

                  {showRemoteAccess && (
                    <>
                      {machineForm.remote_access === "VNC" && (
                        <div className="fields-grid">
                          <label>IP de acesso<input value={machineForm.vnc_ip} onChange={(event) => updateMachineForm("vnc_ip", event.target.value)} /></label>
                          <label>Senha<input type="text" value={machineForm.vnc_password} onChange={(event) => updateMachineForm("vnc_password", event.target.value)} /></label>
                          <label>Usuário VM<input value={machineForm.vnc_user} onChange={(event) => updateMachineForm("vnc_user", event.target.value)} /></label>
                          <label>Senha VM<input type="text" value={machineForm.vnc_vm_password} onChange={(event) => updateMachineForm("vnc_vm_password", event.target.value)} /></label>
                          <label className="wide">Observações de acesso<textarea rows={3} value={machineForm.vnc_notes} onChange={(event) => updateMachineForm("vnc_notes", event.target.value)} /></label>
                        </div>
                      )}
                      {machineForm.remote_access === "SINEMA" && (
                        <div className="fields-grid">
                          <label>Device Name<input value={machineForm.sinema_url} onChange={(event) => updateMachineForm("sinema_url", event.target.value)} /></label>
                          <label>Subnet Name<input value={machineForm.sinema_user} onChange={(event) => updateMachineForm("sinema_user", event.target.value)} /></label>
                          <label className="wide">Observações<textarea rows={3} value={machineForm.sinema_notes} onChange={(event) => updateMachineForm("sinema_notes", event.target.value)} /></label>
                        </div>
                      )}
                      <div className="fields-grid support-grid">
                        <label>Contrato de assistência técnica ativo<select value={machineForm.support_contract_active} onChange={(event) => updateMachineForm("support_contract_active", event.target.value)}>
                          <option value="">Selecione</option>
                          <option value="Sim">Sim</option>
                          <option value="Não">Não</option>
                        </select></label>
                        <label>Tipo de contrato<select value={machineForm.support_contract_type} onChange={(event) => updateMachineForm("support_contract_type", event.target.value)}>
                          <option value="">Selecione</option>
                          {CONTRACT_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select></label>
                        <label>Final de vigência do contrato<input type="date" value={machineForm.support_contract_until} onChange={(event) => updateMachineForm("support_contract_until", event.target.value)} /></label>
                      </div>
                    </>
                  )}
                  </section>
                </form>

                <section className="table-panel">
                  <div className="section-header"><h2>Máquinas cadastradas</h2><span>{registryMachines.length} registros</span></div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Código</th><th>Modelo</th><th>Cliente</th><th>Localização</th><th>Fabricação</th><th>Acesso</th><th>Ações</th></tr></thead>
                      <tbody>{registryMachines.map((machine) => (
                        <tr key={machine.id}>
                          <td>{displayMachineCode(machine)}</td>
                          <td>{machine.model || "-"}</td>
                          <td>{machine.client || "-"}</td>
                          <td>{machine.unit_city || "-"}</td>
                          <td>{formatMonthYear(machine.manufacture_month)}</td>
                          <td>{machine.remote_access || machine.access_method || "Sem acesso remoto"}</td>
                          <td>
                            <div className="row-actions">
                              <button className="icon-button menu-trigger" type="button" title="Ações" aria-label={`Ações da máquina ${displayMachineCode(machine)}`} onClick={() => setOpenActionMenu(openActionMenu === `machine-${machine.id}` ? "" : `machine-${machine.id}`)}><MoreIcon /></button>
                              {openActionMenu === `machine-${machine.id}` && (
                                <div className="row-menu">
                                  <button type="button" onClick={() => { setEditingMachineId(machine.id); setRegistryTab("machines"); setOpenActionMenu(""); }}><EditIcon /> Alterar cadastro</button>
                                  <button className="danger" type="button" onClick={() => { void deleteMachine(machine.id); setOpenActionMenu(""); }}><TrashIcon /> Excluir</button>
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

            {registryTab === "technicians" && (
              <>
                <form className="form-panel" onSubmit={saveTechnician}>
                  <div className="section-header"><h2>{editingTechnicianId ? "Alterar técnico" : "Cadastrar técnico"}</h2><button className="icon-button save-action" title="Salvar técnico" aria-label="Salvar técnico"><SaveIcon /></button></div>
                  <div className="fields-grid">
                    <label>Nome<input name="name" required /></label>
                    <label>E-mail<input name="email" type="email" /></label>
                  </div>
                </form>
                <section className="table-panel">
                  <div className="table-wrap">
                    <table className="compact-table">
                      <thead><tr>
                        <th><button className="sort-header" type="button" onClick={() => toggleTechnicianSort("name")}>Nome <span>{sortMark(technicianSort.key === "name", technicianSort.direction)}</span></button></th>
                        <th><button className="sort-header" type="button" onClick={() => toggleTechnicianSort("email")}>E-mail <span>{sortMark(technicianSort.key === "email", technicianSort.direction)}</span></button></th>
                        <th>Ações</th>
                      </tr></thead>
                      <tbody>{sortedTechnicians.map((technician) => (
                        <tr key={technician.id}>
                          <td>{technician.name}</td>
                          <td>{technician.email || "-"}</td>
                          <td>
                            <div className="row-actions">
                              <button className="icon-button menu-trigger" type="button" title="Ações" aria-label={`Ações do técnico ${technician.name}`} onClick={() => setOpenActionMenu(openActionMenu === `technician-${technician.id}` ? "" : `technician-${technician.id}`)}><MoreIcon /></button>
                              {openActionMenu === `technician-${technician.id}` && (
                                <div className="row-menu">
                                  <button className="danger" type="button" onClick={() => { void deleteTechnician(technician.id); setOpenActionMenu(""); }}><TrashIcon /> Excluir</button>
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
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
