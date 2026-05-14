"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { downloadServicePdf } from "@/lib/pdf";
import type { Machine, ServiceRecord, Technician } from "@/lib/types";

type View = "home" | "machine" | "service" | "technicians";

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

export default function Home() {
  const [sessionReady, setSessionReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [view, setView] = useState<View>("home");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [message, setMessage] = useState("Consulte uma máquina pelo código ou selecione uma linha da tabela.");
  const [machineFilter, setMachineFilter] = useState("");
  const [historyFilter, setHistoryFilter] = useState("");
  const [editingMachineId, setEditingMachineId] = useState("");
  const [editingTechnicianId, setEditingTechnicianId] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(Boolean(data.session));
      setSessionReady(true);
      if (data.session) void loadData();
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
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
      setMessage(machineError?.message || technicianError?.message || "Erro ao carregar dados.");
      return;
    }

    setMachines((machineRows ?? []) as Machine[]);
    setTechnicians((technicianRows ?? []) as Technician[]);
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    });

    setMessage(error ? error.message : "Enviamos um link de acesso para o seu e-mail.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
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
        return [machine.code, machine.model, machine.client, machine.serial, machine.software_version, machine.access_method]
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
      serial: String(form.get("serial") ?? "").trim() || null,
      software_version: String(form.get("software_version") ?? "").trim() || null,
      access_method: String(form.get("access_method") ?? "").trim() || null
    };

    const { data, error } = editingMachineId
      ? await supabase.from("machines").update(payload).eq("id", editingMachineId).select().single()
      : await supabase.from("machines").insert(payload).select().single();

    if (error || !data) {
      setMessage(error?.message || "Erro ao salvar máquina.");
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
      setMessage(error.message);
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

    const { data, error } = await supabase.from("service_records").insert(payload).select().single();
    if (error || !data) {
      setMessage(error?.message || "Erro ao salvar atendimento.");
      return;
    }

    const record = data as ServiceRecord;
    setSelectedMachineId(machine.id);
    setMessage("Atendimento salvo. O PDF foi gerado para download.");
    event.currentTarget.reset();
    await loadData();
    downloadServicePdf(machine, record);
    setView("machine");
  }

  async function deleteMachine(id: string) {
    if (!confirm("Excluir esta máquina e todo o histórico?")) return;
    const { error } = await supabase.from("machines").delete().eq("id", id);
    setMessage(error ? error.message : "Máquina excluída.");
    await loadData();
  }

  async function deleteTechnician(id: string) {
    if (!confirm("Excluir este técnico?")) return;
    const { error } = await supabase.from("technicians").delete().eq("id", id);
    setMessage(error ? error.message : "Técnico excluído.");
    await loadData();
  }

  if (!sessionReady) return <main className="centered">Carregando...</main>;

  if (!isSupabaseConfigured) {
    return (
      <main className="login-page">
        <section className="login-card">
          <Image src="/tomasoni-logo.png" alt="Tomasoni" width={220} height={120} priority />
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
          <Image src="/tomasoni-logo.png" alt="Tomasoni" width={220} height={120} priority />
          <h1>Relatórios de atendimento</h1>
          <p>Entre com seu e-mail corporativo para acessar a aplicação.</p>
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="nome@empresa.com.br" required />
          <button className="button primary" type="submit">Enviar link de acesso</button>
          <span>{message}</span>
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><Image src="/tomasoni-logo.png" alt="Tomasoni" width={190} height={90} priority /></div>
        <nav className="side-nav">
          <button className={`nav-item ${view === "home" ? "active" : ""}`} onClick={() => setView("home")}>Tela inicial</button>
          <button className={`nav-item ${view === "service" ? "active" : ""}`} onClick={() => setView("service")}>Novo registro</button>
          <button className={`nav-item ${view === "machine" ? "active" : ""}`} onClick={() => setView("machine")}>Cadastro</button>
          <button className={`nav-item ${view === "technicians" ? "active" : ""}`} onClick={() => setView("technicians")}>Técnicos</button>
        </nav>
        <button className="button ghost" onClick={signOut}>Sair</button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Aplicação corporativa</p>
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
                  <thead><tr><th>Código</th><th>Modelo</th><th>Cliente</th><th>Série</th><th>Software</th><th>Último atendimento</th><th>Ações</th></tr></thead>
                  <tbody>
                    {filteredMachines.map((machine) => (
                      <tr key={machine.id}>
                        <td><button className="link-button" onClick={() => { setSelectedMachineId(machine.id); setView("machine"); }}>{machine.code}</button></td>
                        <td>{machine.model}</td>
                        <td>{machine.client}</td>
                        <td>{machine.serial || "-"}</td>
                        <td>{machine.software_version || "-"}</td>
                        <td>{formatDate(lastServiceDate(machine))}</td>
                        <td><button className="button ghost" onClick={() => deleteMachine(machine.id)}>Excluir</button></td>
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
                <label>Número de série<input name="serial" defaultValue={selectedMachine?.serial ?? ""} /></label>
                <label>Versão do software<input name="software_version" defaultValue={selectedMachine?.software_version ?? ""} /></label>
                <label>Forma de acesso<input name="access_method" defaultValue={selectedMachine?.access_method ?? ""} /></label>
                <label className="wide">E-mails do cliente<textarea name="emails" rows={3} defaultValue={selectedMachine?.machine_emails?.map((item) => item.email).join("; ") ?? ""} /></label>
              </div>
              {selectedMachine && <button type="button" className="button ghost" onClick={() => setEditingMachineId(selectedMachine.id)}>Alterar cadastro atual</button>}
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
                        <tr key={record.id}>
                          <td>{formatDate(record.service_date)}</td>
                          <td>{record.equipment || "-"}</td>
                          <td>{record.technician_name}</td>
                          <td>{record.request}</td>
                          <td>{record.diagnosis}</td>
                          <td>{record.service_done}</td>
                          <td><button className="button ghost" onClick={() => downloadServicePdf(selectedMachine, record)}>Baixar</button></td>
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
            <div className="section-header"><h2>Registrar atendimento</h2><button className="button primary">Salvar e gerar PDF</button></div>
            <div className="fields-grid">
              <label>Máquina<select name="machine_id" required defaultValue={selectedMachine?.id}>{machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.code} - {machine.model}</option>)}</select></label>
              <label>Equipamento<input name="equipment" placeholder="CLP, IHM, servo, inversor" /></label>
              <label>Técnico responsável<select name="technician_id" required>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label>
              <label>Data<input name="service_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
              <label className="wide">Solicitação do cliente / problema relatado<textarea name="request" rows={3} required /></label>
              <label className="wide">Diagnóstico<textarea name="diagnosis" rows={3} required /></label>
              <label className="wide">Serviço realizado<textarea name="service_done" rows={3} required /></label>
              <label className="wide">Observações<textarea name="observations" rows={3} /></label>
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
                  <tbody>{technicians.map((technician) => <tr key={technician.id}><td>{technician.name}</td><td>{technician.email || "-"}</td><td><button className="button ghost" onClick={() => deleteTechnician(technician.id)}>Excluir</button></td></tr>)}</tbody>
                </table>
              </div>
            </section>
          </section>
        )}
      </section>
    </main>
  );
}
