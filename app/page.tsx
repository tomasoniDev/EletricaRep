"use client";

import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { downloadServicePdf, servicePdfBase64, servicePdfFileName } from "@/lib/pdf";
import type { Machine, ServiceRecord, Technician } from "@/lib/types";

type View = "home" | "machineDetail" | "service" | "registry";
type RegistryTab = "machines" | "technicians";
type SortDirection = "asc" | "desc";
type MachineSortKey = "code" | "model" | "client" | "unit_city" | "serial" | "software_version" | "last_service";
type HistorySortKey = "service_date" | "equipment" | "technician_name" | "request" | "diagnosis" | "service_done";
type TechnicianSortKey = "name" | "email";
type RemoteAccess = "SINEMA" | "VNC" | "Sem acesso remoto";
type ServiceType = "Acesso remoto" | "Visita técnica";

type MachineFormState = {
  code: string;
  mechanical_list: string;
  software_code: string;
  serial: string;
  model: string;
  client: string;
  unit_city: string;
  manufacture_month: string;
  software_version: string;
  remote_access: RemoteAccess;
  emails: string;
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
  support_contract_until: string;
};

const ALLOWED_EMAIL_DOMAINS = ["tomasoni.ind.br", "tomasoni.in.br"];
const DEFAULT_MESSAGE = "Consulte uma máquina pelo código ou selecione uma linha da tabela.";
const AUTH_CONFIRMED_AT_KEY = "tomasoni-servicecore-auth-confirmed-at";
const AUTH_CONFIRMATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const REMOTE_ACCESS_OPTIONS: RemoteAccess[] = ["Sem acesso remoto", "SINEMA", "VNC"];
const SERVICE_TYPE_OPTIONS: ServiceType[] = ["Acesso remoto", "Visita técnica"];
const EMPTY_MACHINE_FORM: MachineFormState = {
  code: "",
  mechanical_list: "",
  software_code: "",
  serial: "",
  model: "",
  client: "",
  unit_city: "",
  manufacture_month: "",
  software_version: "",
  remote_access: "Sem acesso remoto",
  emails: "",
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
  support_contract_until: ""
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
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
    serial: machine.serial ?? "",
    model: machine.model ?? "",
    client: machine.client ?? "",
    unit_city: machine.unit_city ?? "",
    manufacture_month: formatMonthYear(machine.manufacture_month) === "-" ? "" : formatMonthYear(machine.manufacture_month),
    software_version: machine.software_version ?? "",
    remote_access: normalizeRemoteAccess(machine.remote_access ?? machine.access_method),
    emails: machine.machine_emails?.map((item) => item.email).join("; ") ?? "",
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
  if (registryTab === "machines") return "Cadastre, altere ou exclua máquinas e e-mails vinculados ao cliente.";
  return "Cadastre e gerencie os técnicos disponíveis para lançamento dos atendimentos.";
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

export default function Home() {
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
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
      if (data.session) void loadData();
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
      if (session) void loadData();
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

  const selectedMachine = machines.find((machine) => machine.id === selectedMachineId);
  const serviceMachine = selectedMachine ?? machines[0];
  const editingMachine = machines.find((machine) => machine.id === editingMachineId);
  const showRemoteAccess = machineHasRemoteAccess(machineForm.remote_access);

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

  async function loadData() {
    const [{ data: machineRows, error: machineError }, { data: technicianRows, error: technicianError }] = await Promise.all([
      supabase
        .from("machines")
        .select("*, machine_emails(*), service_records(*)")
        .order("code", { ascending: true }),
      supabase.from("technicians").select("*").order("name", { ascending: true })
    ]);

    if (machineError || technicianError) {
      setMessage(dataMessage(machineError?.message || technicianError?.message || ""));
      return;
    }

    setMachines((machineRows ?? []) as Machine[]);
    setTechnicians((technicianRows ?? []) as Technician[]);
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
    setMessage("Acesso autorizado.");
    await loadData();
    setAuthLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    clearAuthConfirmation();
    setIsAuthenticated(false);
    setCurrentUserId("");
    setMachines([]);
    setTechnicians([]);
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

  const filteredMachines = useMemo(() => {
    const term = machineFilter.trim().toLowerCase();
    return [...machines]
      .filter((machine) => {
        if (!term) return true;
        return [machine.code, machine.mechanical_list, machine.software_code, machine.model, machine.client, machine.unit_city, machine.serial, machine.manufacture_month, machine.software_version, machine.remote_access, machine.access_method]
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
        return [record.service_type, record.technician_name, record.equipment, record.request, record.diagnosis, record.service_done, record.observations, record.customer_name]
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
        if (historySort.key === "request") result = compareText(a.request, b.request);
        if (historySort.key === "diagnosis") result = compareText(a.diagnosis, b.diagnosis);
        if (historySort.key === "service_done") result = compareText(a.service_done, b.service_done);

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
      manufacture_month: normalizeMonthYear(machineForm.manufacture_month),
      mechanical_list: machineForm.mechanical_list.trim() || null,
      software_code: machineForm.software_code.trim().toUpperCase() || null,
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
      support_contract_until: showRemoteAccess ? machineForm.support_contract_until.trim() || null : null
    };

    const { data, error } = editingMachineId
      ? await supabase.from("machines").update(payload).eq("id", editingMachineId).select().single()
      : await supabase.from("machines").insert(payload).select().single();

    if (error || !data) {
      setMessage(dataMessage(error?.message || ""));
      return;
    }

    const emails = parseEmails(machineForm.emails);
    await supabase.from("machine_emails").delete().eq("machine_id", data.id);
    if (emails.length) {
      await supabase.from("machine_emails").insert(emails.map((mail) => ({ machine_id: data.id, email: mail })));
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

  async function sendServiceEmail(machine: Machine, record: ServiceRecord) {
    const recipients = machine.machine_emails?.map((item) => item.email).filter(Boolean) ?? [];
    if (!recipients.length) {
      return "Atendimento salvo e PDF gerado. Nenhum e-mail de cliente foi cadastrado para esta máquina.";
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
    const technician = technicians.find((item) => item.id === String(form.get("technician_id")));

    if (!machine || !technician) {
      setMessage("Selecione uma máquina e um técnico.");
      return;
    }

    if (editingServiceRecord?.created_by && editingServiceRecord.created_by !== currentUserId) {
      setMessage("Este atendimento só pode ser alterado pelo usuário que lançou o registro.");
      return;
    }

    const selectedServiceType = normalizeServiceType(String(form.get("service_type") ?? serviceType));
    const payload = {
      machine_id: machine.id,
      technician_id: technician.id,
      technician_name: technician.name,
      technician_email: technician.email,
      service_type: selectedServiceType,
      service_date: String(form.get("service_date") ?? ""),
      equipment: String(form.get("equipment") ?? "").trim() || null,
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
        setMessage("Atendimento salvo. PDF gerado. Enviando e-mail aos responsáveis cadastrados.");
        setMessage(await sendServiceEmail(machine, record));
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
          <Image src="/tomasoni-logo-reference.png" alt="Tomasoni" width={300} height={80} priority />
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
          <Image className="login-logo" src="/tomasoni-logo-reference.png" alt="Tomasoni" width={300} height={80} priority />
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
        <div className="brand"><Image src="/tomasoni-logo-reference.png" alt="Tomasoni" width={220} height={59} priority /></div>
        <nav className="side-nav">
          <button className={`nav-item ${view === "home" ? "active" : ""}`} onClick={() => setView("home")}>Tela inicial</button>
          <button className={`nav-item ${view === "service" ? "active" : ""}`} onClick={startNewService}>Novo registro</button>
          <button className={`nav-item ${view === "registry" ? "active" : ""}`} onClick={() => setView("registry")}>Cadastro</button>
        </nav>
        <button className="button ghost logout-button" onClick={signOut}>Sair</button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Núcleo de Assistência</h1>
          </div>
          <button className="icon-button add-action" type="button" title="Novo atendimento" aria-label="Novo atendimento" onClick={startNewService}><PlusIcon /></button>
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
          <section className="view active">
            <section className="table-panel">
              <div className="section-header">
                <h2>Dados da máquina</h2>
                <button className="button ghost" type="button" onClick={() => setView("home")}>Voltar</button>
              </div>
              <div className="details-grid">
                <div><span>Código</span><strong>{selectedMachine.code || "-"}</strong></div>
                <div><span>Modelo</span><strong>{selectedMachine.model || "-"}</strong></div>
                <div><span>Mecânica</span><strong>{selectedMachine.mechanical_list || "-"}</strong></div>
                <div><span>Código do software</span><strong>{selectedMachine.software_code || "-"}</strong></div>
                <div><span>Cliente</span><strong>{selectedMachine.client || "-"}</strong></div>
                <div><span>Localização</span><strong>{selectedMachine.unit_city || "-"}</strong></div>
                <div><span>Número de série</span><strong>{selectedMachine.serial || "-"}</strong></div>
                <div><span>Fabricação</span><strong>{formatMonthYear(selectedMachine.manufacture_month)}</strong></div>
                <div><span>Software</span><strong>{selectedMachine.software_version || "-"}</strong></div>
                <div><span>Acesso remoto</span><strong>{selectedMachine.remote_access || selectedMachine.access_method || "Sem acesso remoto"}</strong></div>
                {machineHasRemoteAccess(selectedMachine.remote_access || selectedMachine.access_method || "Sem acesso remoto") && (
                  <>
                    <div><span>Contrato ativo</span><strong>{selectedMachine.support_contract_active ? "Sim" : "Não"}</strong></div>
                    <div><span>Fim da vigência</span><strong>{formatDate(selectedMachine.support_contract_until)}</strong></div>
                  </>
                )}
                <div><span>E-mails do cliente</span><strong>{selectedMachine.machine_emails?.map((item) => item.email).join("; ") || "-"}</strong></div>
              </div>
            </section>

            {selectedMachine.remote_access === "VNC" && (
              <section className="table-panel">
                <div className="section-header"><h2>Informações de acesso VNC</h2></div>
                <div className="details-grid">
                  <div><span>IP de acesso</span><strong>{selectedMachine.vnc_ip || "-"}</strong></div>
                  <div><span>Senha</span><strong>{selectedMachine.vnc_password || "-"}</strong></div>
                  <div><span>Usuário VM</span><strong>{selectedMachine.vnc_user || "-"}</strong></div>
                  <div><span>Senha VM</span><strong>{selectedMachine.vnc_vm_password || "-"}</strong></div>
                  <div><span>Observações</span><strong>{selectedMachine.vnc_notes || "-"}</strong></div>
                </div>
              </section>
            )}

            {selectedMachine.remote_access === "SINEMA" && (
              <section className="table-panel">
                <div className="section-header"><h2>Informações de acesso SINEMA</h2></div>
                <div className="details-grid">
                  <div><span>Device Name</span><strong>{selectedMachine.sinema_url || "-"}</strong></div>
                  <div><span>Subnet Name</span><strong>{selectedMachine.sinema_user || "-"}</strong></div>
                  <div><span>Observações</span><strong>{selectedMachine.sinema_notes || "-"}</strong></div>
                </div>
              </section>
            )}

            <section className="table-panel">
              <div className="section-header"><h2>Histórico de {displayMachineCode(selectedMachine)}</h2><span>{filteredHistory.length} registros</span></div>
              <label>Filtrar histórico<input value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)} /></label>
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th><button className="sort-header" type="button" onClick={() => toggleHistorySort("service_date")}>Data <span>{sortMark(historySort.key === "service_date", historySort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleHistorySort("equipment")}>Equipamento <span>{sortMark(historySort.key === "equipment", historySort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleHistorySort("technician_name")}>Técnico <span>{sortMark(historySort.key === "technician_name", historySort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleHistorySort("request")}>Solicitação <span>{sortMark(historySort.key === "request", historySort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleHistorySort("diagnosis")}>Diagnóstico <span>{sortMark(historySort.key === "diagnosis", historySort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleHistorySort("service_done")}>Serviço <span>{sortMark(historySort.key === "service_done", historySort.direction)}</span></button></th>
                    <th>PDF</th>
                  </tr></thead>
                  <tbody>
                    {filteredHistory.map((record) => (
                      <tr key={record.id} className="clickable-row" onClick={() => setSelectedServiceRecord(record)}>
                        <td>{formatDate(record.service_date)}</td>
                        <td>{record.equipment || "-"}</td>
                        <td>{record.technician_name}</td>
                        <td>{record.request}</td>
                        <td>{record.diagnosis}</td>
                        <td>{record.service_done}</td>
                        <td><button className="icon-button download" type="button" title="Baixar PDF" aria-label="Baixar PDF" onClick={(event) => { event.stopPropagation(); downloadServicePdf(selectedMachine, record); }}><PdfDownloadIcon /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        )}

        {view === "service" && (
          <form className="form-panel" onSubmit={saveService}>
            <div className="section-header">
              <h2>{editingServiceRecord ? "Editar atendimento" : "Registrar atendimento"}</h2>
              <div className="actions-row">
                {editingServiceRecord && <button className="button ghost" type="button" onClick={startNewService}>Cancelar edição</button>}
                <button className="icon-button save-action" title={editingServiceRecord ? "Salvar alterações" : "Salvar e gerar PDF"} aria-label={editingServiceRecord ? "Salvar alterações" : "Salvar e gerar PDF"}><SaveIcon /></button>
              </div>
            </div>
            <div className="fields-grid">
              <label>Máquina<select name="machine_id" required defaultValue={editingServiceRecord?.machine_id ?? serviceMachine?.id}>{machines.map((machine) => <option key={machine.id} value={machine.id}>{displayMachineCode(machine)}</option>)}</select></label>
              <label>Equipamento<input name="equipment" placeholder="CLP, IHM, servo, inversor" defaultValue={editingServiceRecord?.equipment ?? ""} /></label>
              <label>Técnico responsável<select name="technician_id" required defaultValue={editingServiceRecord?.technician_id ?? ""}>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label>
              <label>Data<input name="service_date" type="date" required defaultValue={editingServiceRecord?.service_date ?? new Date().toISOString().slice(0, 10)} /></label>
              <label>Tipo de atendimento<select name="service_type" value={serviceType} onChange={(event) => updateServiceType(event.target.value as ServiceType)}>
                {SERVICE_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select></label>
              {serviceType === "Visita técnica" && (
                <label>Cliente / representante<input name="customer_name" placeholder="Nome de quem assinou" defaultValue={editingServiceRecord?.customer_name ?? ""} /></label>
              )}
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
                </section>
              )}
            </div>
          </form>
        )}

        {view === "registry" && (
          <section className="view active">
            <section className="table-panel">
              <div className="section-header">
                <h2>Cadastro</h2>
                <div className="segmented-control" role="tablist" aria-label="Opções de cadastro">
                  <button className={registryTab === "machines" ? "active" : ""} type="button" onClick={() => setRegistryTab("machines")}>Máquinas</button>
                  <button className={registryTab === "technicians" ? "active" : ""} type="button" onClick={() => setRegistryTab("technicians")}>Técnicos</button>
                </div>
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
                      <label>Cliente<input value={machineForm.client} onChange={(event) => updateMachineForm("client", event.target.value)} placeholder="Nome da empresa" /></label>
                      <label>Localização<input value={machineForm.unit_city} onChange={(event) => updateMachineForm("unit_city", event.target.value)} placeholder="Cidade - Estado" /></label>
                      <label>Mecânica<input value={machineForm.mechanical_list} onChange={(event) => updateMachineForm("mechanical_list", event.target.value)} placeholder="Lista mecânica" /></label>
                      <label>Código do software<input value={machineForm.software_code} onChange={(event) => updateMachineForm("software_code", event.target.value)} placeholder="Código do software da máquina" /></label>
                      <label>Número de série<input value={machineForm.serial} onChange={(event) => updateMachineForm("serial", event.target.value)} /></label>
                      <label>Fabricação<input value={machineForm.manufacture_month} onChange={(event) => updateMachineForm("manufacture_month", event.target.value)} placeholder="mm/aa" pattern="\d{2}/\d{2}" /></label>
                      <label>Software<input value={machineForm.software_version} onChange={(event) => updateMachineForm("software_version", event.target.value)} placeholder="TIA Vx, Scout..." /></label>
                      <label className="wide">E-mails do cliente<textarea rows={3} value={machineForm.emails} onChange={(event) => updateMachineForm("emails", event.target.value)} placeholder="um@email.com; outro@email.com" /></label>
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
                            <button className="icon-button edit" type="button" title="Alterar máquina" aria-label={`Alterar máquina ${displayMachineCode(machine)}`} onClick={() => { setEditingMachineId(machine.id); setRegistryTab("machines"); }}>✎</button>
                            <button className="icon-button danger" type="button" title="Excluir máquina" aria-label={`Excluir máquina ${displayMachineCode(machine)}`} onClick={() => deleteMachine(machine.id)}>×</button>
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
                      <tbody>{sortedTechnicians.map((technician) => <tr key={technician.id}><td>{technician.name}</td><td>{technician.email || "-"}</td><td><button className="icon-button danger" type="button" title="Excluir técnico" aria-label={`Excluir técnico ${technician.name}`} onClick={() => deleteTechnician(technician.id)}>×</button></td></tr>)}</tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </section>
        )}

        {selectedServiceRecord && selectedMachine && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="service-modal-title">
            <section className="modal-card">
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
      </section>
    </main>
  );
}
