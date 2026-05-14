"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { downloadServicePdf } from "@/lib/pdf";
import type { Machine, ServiceRecord, Technician } from "@/lib/types";

type View = "home" | "machine" | "service" | "technicians";
type AuthMode = "login" | "register" | "reset";

const ALLOWED_EMAIL_DOMAINS = ["tomasoni.ind.br", "tomasoni.in.br"];
const DEFAULT_MESSAGE = "Consulte uma máquina pelo código ou selecione uma linha da tabela.";

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

function isCorporateEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`));
}

function authMessage(error: string) {
  const normalized = error.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "E-mail ou senha inválidos.";
  if (normalized.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (normalized.includes("user already registered")) return "Usuário já cadastrado.";
  if (normalized.includes("signup is disabled")) return "O cadastro de novos usuários está desativado no Supabase.";
  if (normalized.includes("email rate limit") || normalized.includes("over_email_send_rate_limit")) return "Limite temporário de envio de e-mails atingido. Aguarde alguns minutos e tente novamente.";
  if (normalized.includes("for security purposes")) return "Aguarde alguns segundos antes de solicitar um novo envio.";
  if (normalized.includes("password")) return "Verifique a senha informada. Use pelo menos 6 caracteres.";
  return "Não foi possível concluir a autenticação. Verifique os dados e tente novamente.";
}

function dataMessage(error: string) {
  const normalized = error.toLowerCase();
  if (normalized.includes("duplicate") || normalized.includes("unique")) return "Já existe um cadastro com estes dados.";
  if (normalized.includes("permission") || normalized.includes("row-level security")) return "Seu usuário não tem permissão para executar esta ação.";
  if (normalized.includes("network") || normalized.includes("fetch")) return "Falha de conexão. Verifique a internet e tente novamente.";
  return "Não foi possível concluir a operação. Revise os dados e tente novamente.";
}

export default function Home() {
  const [sessionReady, setSessionReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [view, setView] = useState<View>("home");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [machineFilter, setMachineFilter] = useState("");
  const [historyFilter, setHistoryFilter] = useState("");
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
        setIsAuthenticated(false);
        setMessage("Acesso negado. Use um e-mail corporativo da Tomasoni.");
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
        setIsAuthenticated(false);
        setMessage("Acesso negado. Use um e-mail corporativo da Tomasoni.");
        return;
      }

      if (event === "PASSWORD_RECOVERY") {
        setIsRecoveringPassword(true);
        setMessage("Digite uma nova senha para concluir a redefinição.");
        return;
      }

      setIsAuthenticated(Boolean(session));
      setCurrentUserId(session?.user.id ?? "");
      if (session) void loadData();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

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

    if (authMode === "reset") {
      const { data: emailExists, error: lookupError } = await supabase.rpc("auth_email_exists", {
        input_email: normalizedEmail
      });

      if (lookupError) {
        setMessage(dataMessage(lookupError.message));
        return;
      }

      if (!emailExists) {
        setMessage("E-mail não cadastrado.");
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: window.location.origin
      });

      setMessage(
        error
          ? authMessage(error.message)
          : "Se este e-mail possuir cadastro, enviaremos um link para redefinir a senha."
      );
      return;
    }

    if (password.length < 6) {
      setMessage("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (authMode === "register") {
      if (password !== passwordConfirmation) {
        setMessage("As senhas informadas não conferem.");
        return;
      }

      const { data: emailExists, error: lookupError } = await supabase.rpc("auth_email_exists", {
        input_email: normalizedEmail
      });

      if (lookupError) {
        setMessage(dataMessage(lookupError.message));
        return;
      }

      if (emailExists) {
        setMessage("Usuário já cadastrado.");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { emailRedirectTo: window.location.origin }
      });

      if (!error && data.user?.identities?.length === 0) {
        setMessage("Usuário já cadastrado.");
        return;
      }

      setMessage(
        error
          ? authMessage(error.message)
          : "Cadastro solicitado. Se o e-mail ainda não existir, enviaremos a confirmação para liberar o acesso."
      );
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMessage(error ? authMessage(error.message) : "Acesso autorizado.");
  }

  async function updateRecoveredPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (recoveryPassword.length < 6) {
      setMessage("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: recoveryPassword });
    if (error) {
      setMessage(authMessage(error.message));
      return;
    }

    setRecoveryPassword("");
    setIsRecoveringPassword(false);
    setIsAuthenticated(true);
    setMessage("Senha atualizada com sucesso. Acesso autorizado.");
    await loadData();
  }

  async function signOut() {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setCurrentUserId("");
    setMachines([]);
    setTechnicians([]);
  }

  const selectedMachine = machines.find((machine) => machine.id === selectedMachineId) ?? machines[0];

  const filteredMachines = useMemo(() => {
    const term = machineFilter.trim().toLowerCase();
    return [...machines]
      .sort((a, b) => {
        const first = lastServiceDate(a);
        const second = lastServiceDate(b);
        if (!first && second) return 1;
        if (first && !second) return -1;
        return second.localeCompare(first);
      })
      .filter((machine) => {
        if (!term) return true;
        return [machine.code, machine.model, machine.client, machine.unit_city, machine.serial, machine.software_version, machine.access_method]
          .join(" ")
          .toLowerCase()
          .includes(term);
      });
  }, [machineFilter, machines]);

  const filteredHistory = useMemo(() => {
    const term = historyFilter.trim().toLowerCase();
    const records = selectedMachine?.service_records ?? [];
    return [...records]
      .sort((a, b) => b.service_date.localeCompare(a.service_date))
      .filter((record) => {
        if (!term) return true;
        return [record.technician_name, record.equipment, record.request, record.diagnosis, record.service_done, record.observations]
          .join(" ")
          .toLowerCase()
          .includes(term);
      });
  }, [historyFilter, selectedMachine]);

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

  if (isRecoveringPassword) {
    return (
      <main className="login-page">
        <form className="login-card" onSubmit={updateRecoveredPassword}>
          <Image className="login-logo" src="/tomasoni-logo-reference.png" alt="Tomasoni" width={300} height={80} priority />
          <div>
            <p className="eyebrow">Redefinição de senha</p>
            <h1>Crie uma nova senha</h1>
          </div>
          <p>Informe uma nova senha para concluir o acesso corporativo.</p>
          <label>
            Nova senha
            <input value={recoveryPassword} onChange={(event) => setRecoveryPassword(event.target.value)} type="password" placeholder="Nova senha" required minLength={6} />
          </label>
          <button className="button primary" type="submit">Atualizar senha</button>
          {message !== DEFAULT_MESSAGE && <span className="form-message">{message}</span>}
        </form>
      </main>
    );
  }

  if (!isAuthenticated) {
    const isLoginMode = authMode === "login";
    const isRegisterMode = authMode === "register";
    const isResetMode = authMode === "reset";

    return (
      <main className="login-page">
        <form className="login-card" onSubmit={signIn}>
          <Image className="login-logo" src="/tomasoni-logo-reference.png" alt="Tomasoni" width={300} height={80} priority />
          <label>
            E-mail corporativo
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder={`nome@${ALLOWED_EMAIL_DOMAINS[0]}`} required />
          </label>
          {!isResetMode && (
            <label>
              Senha
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Sua senha" required minLength={6} />
            </label>
          )}
          {isRegisterMode && (
            <label>
              Confirmar senha
              <input value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} type="password" placeholder="Confirme sua senha" required minLength={6} />
            </label>
          )}
          <button className="button primary" type="submit">{isLoginMode ? "Entrar" : isRegisterMode ? "Criar acesso" : "Enviar link de redefinição"}</button>
          <div className="auth-links">
            {!isRegisterMode && <button type="button" onClick={() => setAuthMode("register")}>Criar acesso</button>}
            {!isResetMode && <button type="button" onClick={() => setAuthMode("reset")}>Esqueceu a senha?</button>}
            {!isLoginMode && <button type="button" onClick={() => setAuthMode("login")}>Voltar ao login</button>}
          </div>
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
            <h1>Relatórios de atendimento</h1>
          </div>
          <button className="button primary" onClick={() => setView("service")}>Novo atendimento</button>
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
                  <thead><tr><th>Código</th><th>Modelo</th><th>Cliente</th><th>Unidade / Cidade</th><th>Série</th><th>Software</th><th>Último atendimento</th><th>Ações</th></tr></thead>
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
              <div className="section-header"><h2>{editingMachineId ? "Alterar máquina" : "Cadastrar máquina"}</h2><button className="button primary">Salvar máquina</button></div>
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
                    <thead><tr><th>Data</th><th>Equipamento</th><th>Técnico</th><th>Solicitação</th><th>Diagnóstico</th><th>Serviço</th><th>PDF</th></tr></thead>
                    <tbody>
                      {filteredHistory.map((record) => (
                        <tr key={record.id} className="clickable-row" onClick={() => setSelectedServiceRecord(record)}>
                          <td>{formatDate(record.service_date)}</td>
                          <td>{record.equipment || "-"}</td>
                          <td>{record.technician_name}</td>
                          <td>{record.request}</td>
                          <td>{record.diagnosis}</td>
                          <td>{record.service_done}</td>
                          <td><button className="button ghost" onClick={(event) => { event.stopPropagation(); downloadServicePdf(selectedMachine, record); }}>Baixar</button></td>
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
                <button className="button primary">{editingServiceRecord ? "Salvar alterações" : "Salvar e gerar PDF"}</button>
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
              <div className="section-header"><h2>{editingTechnicianId ? "Alterar técnico" : "Cadastrar técnico"}</h2><button className="button primary">Salvar técnico</button></div>
              <div className="fields-grid">
                <label>Nome<input name="name" required /></label>
                <label>E-mail<input name="email" type="email" /></label>
              </div>
            </form>
            <section className="table-panel">
              <div className="table-wrap">
                <table className="compact-table">
                  <thead><tr><th>Nome</th><th>E-mail</th><th>Ações</th></tr></thead>
                  <tbody>{technicians.map((technician) => <tr key={technician.id}><td>{technician.name}</td><td>{technician.email || "-"}</td><td><button className="icon-button danger" type="button" title="Excluir técnico" aria-label={`Excluir técnico ${technician.name}`} onClick={() => deleteTechnician(technician.id)}>×</button></td></tr>)}</tbody>
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
                <button className="button ghost" type="button" onClick={() => downloadServicePdf(selectedMachine, selectedServiceRecord)}>Baixar PDF</button>
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
