"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { downloadServicePdf } from "@/lib/pdf";
import type { Machine, ServiceRecord, Technician } from "@/lib/types";

type View = "home" | "machine" | "service" | "technicians";
type SortDirection = "asc" | "desc";
type MachineSortKey = "code" | "model" | "client" | "unit_city" | "serial" | "software_version" | "last_service";
type HistorySortKey = "service_date" | "equipment" | "technician_name" | "request" | "diagnosis" | "service_done";
type TechnicianSortKey = "name" | "email";

const ALLOWED_EMAIL_DOMAINS = ["tomasoni.ind.br", "tomasoni.in.br"];
const DEFAULT_MESSAGE = "Consulte uma máquina pelo código ou selecione uma linha da tabela.";
const AUTH_CONFIRMED_AT_KEY = "tomasoni-servicecore-auth-confirmed-at";
const AUTH_CONFIRMATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function formatDate(value?: string | null) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
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

function authMessage(error: string) {
  const normalized = error.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "Código inválido ou expirado.";
  if (normalized.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (normalized.includes("user already registered")) return "Usuário já cadastrado.";
  if (normalized.includes("signup is disabled")) return "O cadastro de novos usuários está desativado no Supabase.";
  if (normalized.includes("email rate limit") || normalized.includes("over_email_send_rate_limit")) return "Limite temporário de envio de e-mails atingido. Aguarde alguns minutos e tente novamente.";
  if (normalized.includes("for security purposes")) return "Aguarde alguns segundos antes de solicitar um novo envio.";
  if (normalized.includes("otp") || normalized.includes("token")) return "Código inválido ou expirado. Solicite um novo código e tente novamente.";
  return "Não foi possível concluir a autenticação. Verifique os dados e tente novamente.";
}

function dataMessage(error: string) {
  const normalized = error.toLowerCase();
  if (normalized.includes("duplicate") || normalized.includes("unique")) return "Já existe um cadastro com estes dados.";
  if (normalized.includes("permission") || normalized.includes("row-level security")) return "Seu usuário não tem permissão para executar esta ação.";
  if (normalized.includes("network") || normalized.includes("fetch")) return "Falha de conexão. Verifique a internet e tente novamente.";
  return "Não foi possível concluir a operação. Revise os dados e tente novamente.";
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
  const [sessionReady, setSessionReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [view, setView] = useState<View>("home");
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
    const normalizedEmail = email.trim().toLowerCase();

    if (!isCorporateEmail(normalizedEmail)) {
      setMessage("Acesso permitido somente para e-mails corporativos da Tomasoni.");
      return;
    }

    if (!otpSent) {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: window.location.origin
        }
      });

      if (error) {
        setMessage(authMessage(error.message));
        return;
      }

      setEmail(normalizedEmail);
      setOtpSent(true);
      setMessage("Enviamos um código de acesso para o seu e-mail corporativo.");
      return;
    }

    const sanitizedCode = otpCode.trim();
    if (!sanitizedCode) {
      setMessage("Informe o código recebido por e-mail.");
      return;
    }

    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: sanitizedCode,
      type: "email"
    });

    if (error || !data.session) {
      setMessage(authMessage(error?.message || ""));
      return;
    }

    storeAuthConfirmation();
    setOtpCode("");
    setOtpSent(false);
    setIsAuthenticated(true);
    setCurrentUserId(data.session.user.id);
    setMessage("Acesso autorizado.");
    await loadData();
  }

  async function signOut() {
    await supabase.auth.signOut();
    clearAuthConfirmation();
    setIsAuthenticated(false);
    setCurrentUserId("");
    setMachines([]);
    setTechnicians([]);
  }

  const selectedMachine = machines.find((machine) => machine.id === selectedMachineId) ?? machines[0];

  const filteredMachines = useMemo(() => {
    const term = machineFilter.trim().toLowerCase();
    return [...machines]
      .filter((machine) => {
        if (!term) return true;
        return [machine.code, machine.model, machine.client, machine.unit_city, machine.serial, machine.software_version, machine.access_method]
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

  const filteredHistory = useMemo(() => {
    const term = historyFilter.trim().toLowerCase();
    const records = selectedMachine?.service_records ?? [];
    return [...records]
      .filter((record) => {
        if (!term) return true;
        return [record.technician_name, record.equipment, record.request, record.diagnosis, record.service_done, record.observations]
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

  async function saveMachine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      code: String(form.get("code") ?? "").trim().toUpperCase(),
      model: String(form.get("model") ?? "").trim(),
      client: String(form.get("client") ?? "").trim(),
      unit_city: String(form.get("unit_city") ?? "").trim() || null,
      serial: String(form.get("serial") ?? "").trim() || null,
      software_version: String(form.get("software_version") ?? "").trim() || null,
      access_method: String(form.get("access_method") ?? "").trim() || null
    };

    const { data, error } = editingMachineId
      ? await supabase.from("machines").update(payload).eq("id", editingMachineId).select().single()
      : await supabase.from("machines").insert(payload).select().single();

    if (error || !data) {
      setMessage(dataMessage(error?.message || ""));
      return;
    }

    const emails = parseEmails(String(form.get("emails") ?? ""));
    await supabase.from("machine_emails").delete().eq("machine_id", data.id);
    if (emails.length) {
      await supabase.from("machine_emails").insert(emails.map((mail) => ({ machine_id: data.id, email: mail })));
    }

    setEditingMachineId("");
    setSelectedMachineId(data.id);
    setMessage(`Máquina ${payload.code} salva com sucesso.`);
    event.currentTarget.reset();
    await loadData();
    setView("home");
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

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

    const payload = {
      machine_id: machine.id,
      technician_id: technician.id,
      technician_name: technician.name,
      technician_email: technician.email,
      service_date: String(form.get("service_date") ?? ""),
      equipment: String(form.get("equipment") ?? "").trim() || null,
      request: String(form.get("request") ?? "").trim(),
      diagnosis: String(form.get("diagnosis") ?? "").trim(),
      service_done: String(form.get("service_done") ?? "").trim(),
      observations: String(form.get("observations") ?? "").trim() || null
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
    setMessage(editingServiceRecord ? "Atendimento atualizado com sucesso." : "Atendimento salvo. O PDF foi gerado para download.");
    setEditingServiceRecord(null);
    setSelectedServiceRecord(null);
    event.currentTarget.reset();
    await loadData();
    if (!editingServiceRecord) downloadServicePdf(machine, record);
    setView("machine");
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
          <button className="button primary" type="submit">{otpSent ? "Confirmar código" : "Enviar código de acesso"}</button>
          {otpSent && <button className="link-button auth-secondary-action" type="button" onClick={() => { setOtpSent(false); setOtpCode(""); setMessage(DEFAULT_MESSAGE); }}>Alterar e-mail</button>}
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
          <button className={`nav-item ${view === "service" ? "active" : ""}`} onClick={() => setView("service")}>Novo registro</button>
          <button className={`nav-item ${view === "machine" ? "active" : ""}`} onClick={() => setView("machine")}>Cadastro</button>
          <button className={`nav-item ${view === "technicians" ? "active" : ""}`} onClick={() => setView("technicians")}>Técnicos</button>
        </nav>
        <button className="button ghost logout-button" onClick={signOut}>Sair</button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Núcleo de Assistência</h1>
          </div>
          <button className="icon-button add-action" type="button" title="Novo atendimento" aria-label="Novo atendimento" onClick={() => setView("service")}><PlusIcon /></button>
        </header>

        <section className="status-band"><strong>{message}</strong></section>

        {view === "home" && (
          <section className="view active">
            <div className="search-panel">
              <label>Filtrar máquinas<input value={machineFilter} onChange={(event) => setMachineFilter(event.target.value)} placeholder="Código, modelo, cliente..." /></label>
            </div>
            <section className="table-panel">
              <div className="section-header"><h2>Máquinas cadastradas</h2><span>{filteredMachines.length} registros</span></div>
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th><button className="sort-header" type="button" onClick={() => toggleMachineSort("code")}>Código <span>{sortMark(machineSort.key === "code", machineSort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleMachineSort("model")}>Modelo <span>{sortMark(machineSort.key === "model", machineSort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleMachineSort("client")}>Cliente <span>{sortMark(machineSort.key === "client", machineSort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleMachineSort("unit_city")}>Unidade / Cidade <span>{sortMark(machineSort.key === "unit_city", machineSort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleMachineSort("serial")}>Série <span>{sortMark(machineSort.key === "serial", machineSort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleMachineSort("software_version")}>Software <span>{sortMark(machineSort.key === "software_version", machineSort.direction)}</span></button></th>
                    <th><button className="sort-header" type="button" onClick={() => toggleMachineSort("last_service")}>Último atendimento <span>{sortMark(machineSort.key === "last_service", machineSort.direction)}</span></button></th>
                    <th>Ações</th>
                  </tr></thead>
                  <tbody>
                    {filteredMachines.map((machine) => (
                      <tr key={machine.id}>
                        <td><button className="link-button" onClick={() => { setSelectedMachineId(machine.id); setView("machine"); }}>{machine.code}</button></td>
                        <td>{machine.model}</td>
                        <td>{machine.client}</td>
                        <td>{machine.unit_city || "-"}</td>
                        <td>{machine.serial || "-"}</td>
                        <td>{machine.software_version || "-"}</td>
                        <td>{formatDate(lastServiceDate(machine))}</td>
                        <td><button className="icon-button danger" type="button" title="Excluir máquina" aria-label={`Excluir máquina ${machine.code}`} onClick={() => deleteMachine(machine.id)}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        )}

        {view === "machine" && (
          <section className="view active">
            <form className="form-panel" onSubmit={saveMachine}>
              <div className="section-header"><h2>{editingMachineId ? "Alterar máquina" : "Cadastrar máquina"}</h2><button className="icon-button save-action" title="Salvar máquina" aria-label="Salvar máquina"><SaveIcon /></button></div>
              <div className="fields-grid">
                <label>Código<input name="code" required defaultValue={selectedMachine?.code ?? ""} /></label>
                <label>Modelo<input name="model" required defaultValue={selectedMachine?.model ?? ""} /></label>
                <label>Cliente<input name="client" required defaultValue={selectedMachine?.client ?? ""} /></label>
                <label>Unidade / Cidade<input name="unit_city" defaultValue={selectedMachine?.unit_city ?? ""} /></label>
                <label>Número de série<input name="serial" defaultValue={selectedMachine?.serial ?? ""} /></label>
                <label>Versão do software<input name="software_version" defaultValue={selectedMachine?.software_version ?? ""} /></label>
                <label>Forma de acesso<input name="access_method" defaultValue={selectedMachine?.access_method ?? ""} /></label>
                <label className="wide">E-mails do cliente<textarea name="emails" rows={3} defaultValue={selectedMachine?.machine_emails?.map((item) => item.email).join("; ") ?? ""} /></label>
              </div>
              {selectedMachine && <button type="button" className="icon-button edit" title="Alterar cadastro atual" aria-label="Alterar cadastro atual" onClick={() => setEditingMachineId(selectedMachine.id)}>✎</button>}
            </form>

            {selectedMachine && (
              <section className="table-panel">
                <div className="section-header"><h2>Histórico de {selectedMachine.code}</h2><span>{filteredHistory.length} registros</span></div>
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
            )}
          </section>
        )}

        {view === "service" && (
          <form className="form-panel" onSubmit={saveService}>
            <div className="section-header">
              <h2>{editingServiceRecord ? "Editar atendimento" : "Registrar atendimento"}</h2>
              <div className="actions-row">
                {editingServiceRecord && <button className="button ghost" type="button" onClick={() => setEditingServiceRecord(null)}>Cancelar edição</button>}
                <button className="icon-button save-action" title={editingServiceRecord ? "Salvar alterações" : "Salvar e gerar PDF"} aria-label={editingServiceRecord ? "Salvar alterações" : "Salvar e gerar PDF"}><SaveIcon /></button>
              </div>
            </div>
            <div className="fields-grid">
              <label>Máquina<select name="machine_id" required defaultValue={editingServiceRecord?.machine_id ?? selectedMachine?.id}>{machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.code} - {machine.model}</option>)}</select></label>
              <label>Equipamento<input name="equipment" placeholder="CLP, IHM, servo, inversor" defaultValue={editingServiceRecord?.equipment ?? ""} /></label>
              <label>Técnico responsável<select name="technician_id" required defaultValue={editingServiceRecord?.technician_id ?? ""}>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label>
              <label>Data<input name="service_date" type="date" required defaultValue={editingServiceRecord?.service_date ?? new Date().toISOString().slice(0, 10)} /></label>
              <label className="wide">Solicitação do cliente / problema relatado<textarea name="request" rows={3} required defaultValue={editingServiceRecord?.request ?? ""} /></label>
              <label className="wide">Diagnóstico<textarea name="diagnosis" rows={3} required defaultValue={editingServiceRecord?.diagnosis ?? ""} /></label>
              <label className="wide">Serviço realizado<textarea name="service_done" rows={3} required defaultValue={editingServiceRecord?.service_done ?? ""} /></label>
              <label className="wide">Observações<textarea name="observations" rows={3} defaultValue={editingServiceRecord?.observations ?? ""} /></label>
            </div>
          </form>
        )}

        {view === "technicians" && (
          <section className="view active">
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
          </section>
        )}

        {selectedServiceRecord && selectedMachine && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="service-modal-title">
            <section className="modal-card">
              <div className="section-header">
                <div>
                  <p className="eyebrow">{formatDate(selectedServiceRecord.service_date)}</p>
                  <h2 id="service-modal-title">Atendimento - {selectedMachine.code}</h2>
                </div>
                <button className="button ghost" type="button" onClick={() => setSelectedServiceRecord(null)}>Fechar</button>
              </div>
              <div className="record-details">
                <div><span>Equipamento</span><strong>{selectedServiceRecord.equipment || "-"}</strong></div>
                <div><span>Técnico</span><strong>{selectedServiceRecord.technician_name}</strong></div>
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
