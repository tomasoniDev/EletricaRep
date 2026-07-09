import { jsPDF } from "jspdf";
import type { Machine, ServiceRecord } from "./types";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 70;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BLUE = "#1268D8";
const DARK = "#111111";
const MUTED = "#566170";
const LINE = "#CAD6E6";
const CONTENT_BOTTOM = PAGE_HEIGHT - 76;

function formatDate(value?: string | null) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatMonthYear(value?: string | null) {
  if (!value) return "-";
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  return `${month}/${year}`;
}

function reportCode(machine: Machine, record: ServiceRecord) {
  const [year, month, day] = record.service_date.split("-");
  const prefix = `RAT-${year.slice(2)}${month}${day}`;
  const sameDayRecords = [
    ...(machine.service_records?.filter((item) => item.service_date === record.service_date) ?? []),
    record
  ];
  const uniqueRecords = Array.from(new Map(sameDayRecords.map((item) => [item.id, item])).values());
  const sortedRecords = uniqueRecords.sort((a, b) => {
    const created = a.created_at.localeCompare(b.created_at);
    return created || a.id.localeCompare(b.id);
  });
  const index = Math.max(sortedRecords.findIndex((item) => item.id === record.id), 0) + 1;
  return `${prefix}-${String(index).padStart(2, "0")}`;
}

function valueOrDash(value?: string | null) {
  const normalized = String(value ?? "").trim();
  return normalized || "-";
}

function displayMachineCode(machine: Machine) {
  return machine.code?.trim() || machine.model?.trim() || machine.client?.trim() || "maquina-sem-codigo";
}

function setText(doc: jsPDF, color = DARK, size = 9, weight: "normal" | "bold" = "normal") {
  doc.setTextColor(color);
  doc.setFont("helvetica", weight);
  doc.setFontSize(size);
}

function line(doc: jsPDF, x1: number, y1: number, x2: number, y2: number, color = LINE, width = 0.7) {
  doc.setDrawColor(color);
  doc.setLineWidth(width);
  doc.line(x1, y1, x2, y2);
}

function labelValue(doc: jsPDF, label: string, value: string | null | undefined, x: number, y: number, width: number) {
  setText(doc, MUTED, 7, "bold");
  doc.text(label.toUpperCase(), x, y);
  setText(doc, DARK, 9);
  doc.text(valueOrDash(value), x, y + 16);
  line(doc, x, y + 22, x + width, y + 22, LINE, 0.55);
}

function sectionTitle(doc: jsPDF, title: string, y: number) {
  setText(doc, BLUE, 10, "bold");
  doc.text(title.toUpperCase(), MARGIN, y);
  line(doc, MARGIN, y + 9, PAGE_WIDTH - MARGIN, y + 9, BLUE, 1.2);
}

function paragraphBox(doc: jsPDF, title: string, value: string | null, x: number, y: number, width: number, height: number) {
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.75);
  doc.roundedRect(x, y, width, height, 1.5, 1.5);
  setText(doc, MUTED, 7, "bold");
  doc.text(title.toUpperCase(), x + 10, y + 16);
  setText(doc, DARK, 9);
  const lines = doc.splitTextToSize(valueOrDash(value), width - 20).slice(0, Math.floor((height - 30) / 12));
  doc.text(lines, x + 10, y + 34, { lineHeightFactor: 1.35 });
}

function addContentPage(doc: jsPDF) {
  doc.addPage("a4", "portrait");
  return 78;
}

function ensurePageSpace(doc: jsPDF, y: number, height: number) {
  if (y + height <= CONTENT_BOTTOM) return y;
  return addContentPage(doc);
}

function flowTextSection(doc: jsPDF, title: string, value: string | null, y: number) {
  const lines = doc.splitTextToSize(valueOrDash(value), CONTENT_WIDTH);
  const lineHeight = 12;
  y = ensurePageSpace(doc, y, 34);
  setText(doc, MUTED, 7, "bold");
  doc.text(title.toUpperCase(), MARGIN, y);
  y += 18;
  setText(doc, DARK, 9);

  for (const textLine of lines) {
    y = ensurePageSpace(doc, y, lineHeight + 8);
    doc.text(textLine, MARGIN, y);
    y += lineHeight;
  }

  line(doc, MARGIN, y + 7, PAGE_WIDTH - MARGIN, y + 7, LINE, 0.55);
  return y + 26;
}

function imageToDataUrl(path: string) {
  return new Promise<string | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(null);
        return;
      }
      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => resolve(null);
    image.src = path;
  });
}

async function drawLogo(doc: jsPDF) {
  const logo = await imageToDataUrl("/tomasoni-logo-reference.png");
  if (logo) {
    doc.addImage(logo, "PNG", MARGIN, 72, 170, 52);
    return;
  }

  setText(doc, BLUE, 28, "bold");
  doc.text("TOMASONI", MARGIN, 104);
}

async function drawHeader(doc: jsPDF, machine: Machine, record: ServiceRecord) {
  await drawLogo(doc);
  setText(doc, BLUE, 17, "bold");
  doc.text("Relatório de Atendimento Técnico", 258, 92);
  setText(doc, MUTED, 8);
  doc.text(`Nº: ${reportCode(machine, record)}`, 376, 114);
  doc.text(`Data: ${formatDate(record.service_date)}`, 459, 114);
  line(doc, MARGIN, 142, PAGE_WIDTH - MARGIN, 142, BLUE, 2);
  setText(doc, MUTED, 8);
  doc.text("Documento técnico gerado pelo sistema de relatórios Tomasoni", MARGIN, 162);
}

function drawMachineData(doc: jsPDF, machine: Machine) {
  sectionTitle(doc, "Dados da máquina", 203);
  const col = (CONTENT_WIDTH - 24) / 3;
  labelValue(doc, "Cliente", machine.client, MARGIN, 234, col);
  labelValue(doc, "Unidade / Cidade", machine.unit_city, MARGIN + col + 12, 234, col);
  labelValue(doc, "Modelo", machine.model, MARGIN + (col + 12) * 2, 234, col);
  labelValue(doc, "Código", machine.code, MARGIN, 273, col);
  labelValue(doc, "Número de série", machine.serial, MARGIN + col + 12, 273, col);
  labelValue(doc, "Fabricação", formatMonthYear(machine.manufacture_month), MARGIN + (col + 12) * 2, 273, col);
}

function drawServiceData(doc: jsPDF, record: ServiceRecord) {
  sectionTitle(doc, "Dados do atendimento", 337);
  const col = (CONTENT_WIDTH - 24) / 3;
  labelValue(doc, "Data do atendimento", formatDate(record.service_date), MARGIN, 368, col);
  labelValue(doc, "Tipo de atendimento", record.service_type ?? "Acesso remoto", MARGIN + col + 12, 368, col);
  labelValue(doc, "Equipamento", record.equipment, MARGIN + (col + 12) * 2, 368, col);
  labelValue(doc, "Motivo breve", record.issue_summary, MARGIN, 407, CONTENT_WIDTH);

  let y = 464;
  y = flowTextSection(doc, "Solicitação do cliente / problema relatado", record.request, y);
  y = flowTextSection(doc, "Diagnóstico", record.diagnosis, y);
  y = flowTextSection(doc, "Serviço realizado", record.service_done, y);
  y = flowTextSection(doc, "Observações", record.observations, y);
  return y;
}

function drawTechnicianData(doc: jsPDF, record: ServiceRecord, y: number) {
  y = ensurePageSpace(doc, y, 70);
  sectionTitle(doc, "Técnico responsável", y);
  const col = (CONTENT_WIDTH - 12) / 2;
  labelValue(doc, "Nome", record.technician_name, MARGIN, y + 31, col);
  labelValue(doc, "E-mail", record.technician_email, MARGIN + col + 12, y + 31, col);
  return y + 68;
}

function drawFooter(doc: jsPDF, pageNumber: number, totalPages: number) {
  line(doc, MARGIN, PAGE_HEIGHT - 45, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 45, BLUE, 1.2);
  setText(doc, MUTED, 7);
  doc.text("Tomasoni - Equipamentos para indústria de papelão ondulado", MARGIN, PAGE_HEIGHT - 29);
  doc.text(`Página ${pageNumber} de ${totalPages}`, PAGE_WIDTH - MARGIN - 58, PAGE_HEIGHT - 29);
}

function drawAllFooters(doc: jsPDF) {
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawFooter(doc, page, totalPages);
  }
}

function drawSignaturePage(doc: jsPDF, record: ServiceRecord) {
  doc.addPage("a4", "portrait");
  sectionTitle(doc, "Assinatura do cliente", 90);
  const col = (CONTENT_WIDTH - 12) / 2;
  labelValue(doc, "Tipo de atendimento", record.service_type ?? "Visita técnica", MARGIN, 122, col);
  labelValue(doc, "Cliente / representante", record.customer_name, MARGIN + col + 12, 122, col);

  if (record.customer_signature) {
    const signatureWidth = 260;
    const signatureHeight = 72;
    const signatureX = MARGIN + (CONTENT_WIDTH - signatureWidth) / 2;
    const signatureY = 196;
    doc.addImage(record.customer_signature, "PNG", signatureX, signatureY, signatureWidth, signatureHeight);
    line(doc, signatureX, signatureY + signatureHeight + 12, signatureX + signatureWidth, signatureY + signatureHeight + 12, MUTED, 0.55);
    setText(doc, MUTED, 7, "bold");
    doc.text("ASSINATURA DO CLIENTE / REPRESENTANTE", signatureX + signatureWidth / 2, signatureY + signatureHeight + 28, { align: "center" });
    setText(doc, DARK, 8);
    doc.text(valueOrDash(record.customer_name), signatureX + signatureWidth / 2, signatureY + signatureHeight + 43, { align: "center" });
  } else {
    const signatureWidth = 260;
    const signatureX = MARGIN + (CONTENT_WIDTH - signatureWidth) / 2;
    line(doc, signatureX, 280, signatureX + signatureWidth, 280, MUTED, 0.55);
    setText(doc, MUTED, 7, "bold");
    doc.text("ASSINATURA DO CLIENTE / REPRESENTANTE", signatureX + signatureWidth / 2, 296, { align: "center" });
  }

}

async function createServicePdf(machine: Machine, record: ServiceRecord) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  doc.setProperties({
    title: `${reportCode(machine, record)} - ${displayMachineCode(machine)}`,
    subject: "Relatório de Atendimento Técnico",
    author: "Tomasoni"
  });

  await drawHeader(doc, machine, record);
  drawMachineData(doc, machine);
  const nextY = drawServiceData(doc, record);
  drawTechnicianData(doc, record, nextY);
  if (record.service_type === "Visita técnica") drawSignaturePage(doc, record);
  drawAllFooters(doc);

  return doc;
}

export function servicePdfFileName(machine: Machine, record: ServiceRecord) {
  return `${reportCode(machine, record)}-${displayMachineCode(machine)}.pdf`;
}

export async function servicePdfBase64(machine: Machine, record: ServiceRecord) {
  const doc = await createServicePdf(machine, record);
  const dataUri = doc.output("datauristring");
  return dataUri.split(",")[1] ?? "";
}

export async function downloadServicePdf(machine: Machine, record: ServiceRecord) {
  const doc = await createServicePdf(machine, record);
  doc.save(servicePdfFileName(machine, record));
}
