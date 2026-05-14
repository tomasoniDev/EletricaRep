import type { Machine, ServiceRecord } from "./types";

type TextStyle = {
  color?: string;
  font?: "regular" | "bold";
  size?: number;
};

type PdfPage = {
  commands: string[];
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 42;
const BLUE = "1268D8";
const DARK = "111111";
const MUTED = "646A73";
const LINE = "D9E2EF";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
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

function clean(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/[()\\]/g, "\\$&")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function color(hex: string) {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

function wrapText(text: string, maxChars: number) {
  const words = clean(text || "-").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });

  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

function rect(page: PdfPage, x: number, y: number, width: number, height: number, stroke = LINE, fill?: string) {
  page.commands.push("q");
  if (fill) page.commands.push(`${color(fill)} rg`);
  page.commands.push(`${color(stroke)} RG`);
  page.commands.push(`${x} ${y} ${width} ${height} re`);
  page.commands.push(fill ? "B" : "S");
  page.commands.push("Q");
}

function line(page: PdfPage, x1: number, y1: number, x2: number, y2: number, stroke = LINE, width = 1) {
  page.commands.push("q");
  page.commands.push(`${width} w`);
  page.commands.push(`${color(stroke)} RG`);
  page.commands.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  page.commands.push("Q");
}

function text(page: PdfPage, value: unknown, x: number, y: number, style: TextStyle = {}) {
  const font = style.font === "bold" ? "F2" : "F1";
  const size = style.size ?? 9;
  page.commands.push("BT");
  page.commands.push(`/${font} ${size} Tf`);
  page.commands.push(`${color(style.color ?? DARK)} rg`);
  page.commands.push(`${x} ${y} Td`);
  page.commands.push(`(${clean(value)}) Tj`);
  page.commands.push("ET");
}

function labelValue(page: PdfPage, label: string, value: unknown, x: number, y: number, width: number) {
  text(page, label.toUpperCase(), x, y + 17, { color: MUTED, font: "bold", size: 7 });
  text(page, value || "-", x, y + 4, { color: DARK, size: 9 });
  line(page, x, y, x + width, y, LINE, 0.6);
}

function sectionTitle(page: PdfPage, title: string, y: number) {
  text(page, title.toUpperCase(), MARGIN, y, { color: BLUE, font: "bold", size: 9 });
  line(page, MARGIN, y - 7, PAGE_WIDTH - MARGIN, y - 7, BLUE, 1.2);
}

function paragraphBox(page: PdfPage, title: string, value: string | null, x: number, y: number, width: number, height: number) {
  rect(page, x, y, width, height, LINE, "FFFFFF");
  text(page, title.toUpperCase(), x + 10, y + height - 16, { color: MUTED, font: "bold", size: 7 });
  const lines = wrapText(value || "-", Math.floor((width - 20) / 4.8)).slice(0, Math.floor((height - 30) / 12));
  lines.forEach((item, index) => text(page, item, x + 10, y + height - 31 - index * 12, { size: 9 }));
}

function drawTomasoniWordmark(page: PdfPage) {
  text(page, "TOMASONI", MARGIN, 776, { color: BLUE, font: "bold", size: 28 });
  rect(page, 180, 770, 11, 8, "129A45", "129A45");
  text(page, "BR", 182, 772, { color: "FFFFFF", font: "bold", size: 4 });
}

function drawHeader(page: PdfPage, machine: Machine, record: ServiceRecord) {
  drawTomasoniWordmark(page);
  text(page, "Relatorio de Atendimento Tecnico", 210, 785, { color: BLUE, font: "bold", size: 16 });
  text(page, `No: ${reportCode(machine, record)}`, 342, 765, { color: MUTED, size: 8 });
  text(page, `Data: ${formatDate(record.service_date)}`, 430, 765, { color: MUTED, size: 8 });
  line(page, MARGIN, 738, PAGE_WIDTH - MARGIN, 738, BLUE, 2);
  text(page, "Documento tecnico gerado pelo sistema de relatorios Tomasoni", MARGIN, 719, { color: MUTED, size: 8 });
}

function drawMachineData(page: PdfPage, machine: Machine, y: number) {
  sectionTitle(page, "Dados da maquina", y);
  const top = y - 42;
  const col = (PAGE_WIDTH - MARGIN * 2 - 24) / 3;
  labelValue(page, "Cliente", machine.client, MARGIN, top, col);
  labelValue(page, "Unidade / Cidade", machine.unit_city || "-", MARGIN + col + 12, top, col);
  labelValue(page, "Modelo", machine.model, MARGIN + (col + 12) * 2, top, col);
  labelValue(page, "Codigo", machine.code, MARGIN, top - 39, col);
  labelValue(page, "Numero de serie", machine.serial, MARGIN + col + 12, top - 39, col);
}

function drawServiceData(page: PdfPage, record: ServiceRecord, y: number) {
  sectionTitle(page, "Dados do atendimento", y);
  const top = y - 42;
  const col = (PAGE_WIDTH - MARGIN * 2 - 12) / 2;
  labelValue(page, "Data do atendimento", formatDate(record.service_date), MARGIN, top, col);
  labelValue(page, "Equipamento", record.equipment, MARGIN + col + 12, top, col);
  paragraphBox(page, "Solicitacao do cliente / problema relatado", record.request, MARGIN, top - 102, PAGE_WIDTH - MARGIN * 2, 72);
  paragraphBox(page, "Diagnostico", record.diagnosis, MARGIN, top - 186, PAGE_WIDTH - MARGIN * 2, 72);
  paragraphBox(page, "Servico realizado", record.service_done, MARGIN, top - 270, PAGE_WIDTH - MARGIN * 2, 72);
  paragraphBox(page, "Observacoes", record.observations || "-", MARGIN, top - 354, PAGE_WIDTH - MARGIN * 2, 72);
}

function drawTechnicianData(page: PdfPage, record: ServiceRecord, y: number) {
  sectionTitle(page, "Tecnico responsavel", y);
  const top = y - 42;
  const col = (PAGE_WIDTH - MARGIN * 2 - 12) / 2;
  labelValue(page, "Nome", record.technician_name, MARGIN, top, col);
  labelValue(page, "E-mail", record.technician_email || "-", MARGIN + col + 12, top, col);
  labelValue(page, "Confirmacao", "Atendimento registrado automaticamente pelo sistema.", MARGIN, top - 42, PAGE_WIDTH - MARGIN * 2);
}

function drawFooter(page: PdfPage, pageNumber: number) {
  line(page, MARGIN, 42, PAGE_WIDTH - MARGIN, 42, BLUE, 1.2);
  text(page, "Tomasoni - Equipamentos para industria de papelao ondulado", MARGIN, 26, { color: MUTED, size: 8 });
  text(page, `Pagina ${pageNumber}`, PAGE_WIDTH - MARGIN - 45, 26, { color: MUTED, size: 8 });
}

function buildReportPage(machine: Machine, record: ServiceRecord) {
  const page: PdfPage = { commands: [] };
  rect(page, 0, 0, PAGE_WIDTH, PAGE_HEIGHT, "FFFFFF", "FFFFFF");
  drawHeader(page, machine, record);
  drawMachineData(page, machine, 685);
  drawServiceData(page, record, 568);
  drawTechnicianData(page, record, 148);
  drawFooter(page, 1);
  return page;
}

function buildPdf(machine: Machine, record: ServiceRecord) {
  const pages = [buildReportPage(machine, record)];
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`);

  pages.forEach((page, pageIndex) => {
    const pageObject = 3 + pageIndex * 2;
    const contentObject = pageObject + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObject} 0 R >>`);
    const stream = page.commands.join("\n");
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

export function downloadServicePdf(machine: Machine, record: ServiceRecord) {
  const blob = buildPdf(machine, record);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${reportCode(machine, record)}-${machine.code}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
