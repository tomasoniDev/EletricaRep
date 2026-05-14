import type { Machine, ServiceRecord } from "./types";

type TextStyle = {
  color?: string;
  font?: "regular" | "bold";
  size?: number;
};

type PdfPage = {
  commands: string[];
};

type PdfImage = {
  data: Uint8Array;
  height: number;
  width: number;
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
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfText(value: unknown) {
  const content = `\uFEFF${clean(value)}`;
  return `<${Array.from(content)
    .map((char) => char.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("")}>`;
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

function image(page: PdfPage, name: string, x: number, y: number, width: number, height: number) {
  page.commands.push("q");
  page.commands.push(`${width} 0 0 ${height} ${x} ${y} cm`);
  page.commands.push(`/${name} Do`);
  page.commands.push("Q");
}

function text(page: PdfPage, value: unknown, x: number, y: number, style: TextStyle = {}) {
  const font = style.font === "bold" ? "F2" : "F1";
  const size = style.size ?? 9;
  page.commands.push("BT");
  page.commands.push(`/${font} ${size} Tf`);
  page.commands.push(`${color(style.color ?? DARK)} rg`);
  page.commands.push(`${x} ${y} Td`);
  page.commands.push(`${pdfText(value)} Tj`);
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

function drawHeader(page: PdfPage, machine: Machine, record: ServiceRecord, hasLogo: boolean) {
  if (hasLogo) {
    image(page, "Logo", MARGIN, 766, 152, 41);
  } else {
    text(page, "TOMASONI", MARGIN, 778, { color: BLUE, font: "bold", size: 25 });
  }
  text(page, "Relatório de Atendimento Técnico", 210, 785, { color: BLUE, font: "bold", size: 16 });
  text(page, `Nº: ${reportCode(machine, record)}`, 342, 765, { color: MUTED, size: 8 });
  text(page, `Data: ${formatDate(record.service_date)}`, 430, 765, { color: MUTED, size: 8 });
  line(page, MARGIN, 738, PAGE_WIDTH - MARGIN, 738, BLUE, 2);
  text(page, "Documento técnico gerado pelo sistema de relatórios Tomasoni", MARGIN, 719, { color: MUTED, size: 8 });
}

function drawMachineData(page: PdfPage, machine: Machine, y: number) {
  sectionTitle(page, "Dados da máquina", y);
  const top = y - 42;
  const col = (PAGE_WIDTH - MARGIN * 2 - 24) / 3;
  labelValue(page, "Cliente", machine.client, MARGIN, top, col);
  labelValue(page, "Unidade / Cidade", machine.unit_city || "-", MARGIN + col + 12, top, col);
  labelValue(page, "Modelo", machine.model, MARGIN + (col + 12) * 2, top, col);
  labelValue(page, "Código", machine.code, MARGIN, top - 39, col);
  labelValue(page, "Número de série", machine.serial, MARGIN + col + 12, top - 39, col);
}

function drawServiceData(page: PdfPage, record: ServiceRecord, y: number) {
  sectionTitle(page, "Dados do atendimento", y);
  const top = y - 42;
  const col = (PAGE_WIDTH - MARGIN * 2 - 12) / 2;
  labelValue(page, "Data do atendimento", formatDate(record.service_date), MARGIN, top, col);
  labelValue(page, "Equipamento", record.equipment, MARGIN + col + 12, top, col);
  paragraphBox(page, "Solicitação do cliente / problema relatado", record.request, MARGIN, top - 102, PAGE_WIDTH - MARGIN * 2, 72);
  paragraphBox(page, "Diagnóstico", record.diagnosis, MARGIN, top - 186, PAGE_WIDTH - MARGIN * 2, 72);
  paragraphBox(page, "Serviço realizado", record.service_done, MARGIN, top - 270, PAGE_WIDTH - MARGIN * 2, 72);
  paragraphBox(page, "Observações", record.observations || "-", MARGIN, top - 354, PAGE_WIDTH - MARGIN * 2, 72);
}

function drawTechnicianData(page: PdfPage, record: ServiceRecord, y: number) {
  sectionTitle(page, "Técnico responsável", y);
  const top = y - 42;
  const col = (PAGE_WIDTH - MARGIN * 2 - 12) / 2;
  labelValue(page, "Nome", record.technician_name, MARGIN, top, col);
  labelValue(page, "E-mail", record.technician_email || "-", MARGIN + col + 12, top, col);
  labelValue(page, "Confirmação", "Atendimento registrado automaticamente pelo sistema.", MARGIN, top - 42, PAGE_WIDTH - MARGIN * 2);
}

function drawFooter(page: PdfPage, pageNumber: number) {
  line(page, MARGIN, 42, PAGE_WIDTH - MARGIN, 42, BLUE, 1.2);
  text(page, "Tomasoni - Equipamentos para indústria de papelão ondulado", MARGIN, 26, { color: MUTED, size: 8 });
  text(page, `Página ${pageNumber}`, PAGE_WIDTH - MARGIN - 45, 26, { color: MUTED, size: 8 });
}

function buildReportPage(machine: Machine, record: ServiceRecord, hasLogo: boolean) {
  const page: PdfPage = { commands: [] };
  rect(page, 0, 0, PAGE_WIDTH, PAGE_HEIGHT, "FFFFFF", "FFFFFF");
  drawHeader(page, machine, record, hasLogo);
  drawMachineData(page, machine, 685);
  drawServiceData(page, record, 568);
  drawTechnicianData(page, record, 148);
  drawFooter(page, 1);
  return page;
}

function ascii(value: string) {
  return new TextEncoder().encode(value);
}

function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function loadLogoImage() {
  return new Promise<PdfImage | null>((resolve) => {
    const logo = new Image();
    logo.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = logo.naturalWidth;
      canvas.height = logo.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(null);
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(logo, 0, 0);
      resolve({
        data: dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.92)),
        height: canvas.height,
        width: canvas.width
      });
    };
    logo.onerror = () => resolve(null);
    logo.src = "/tomasoni-logo-reference.png";
  });
}

function buildPdf(machine: Machine, record: ServiceRecord, logo: PdfImage | null) {
  const pages = [buildReportPage(machine, record, Boolean(logo))];
  const objects: Uint8Array[] = [];
  objects.push(ascii("<< /Type /Catalog /Pages 2 0 R >>"));
  objects.push(ascii(`<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`));
  const imageObjectNumber = 3 + pages.length * 2;

  pages.forEach((page, pageIndex) => {
    const pageObject = 3 + pageIndex * 2;
    const contentObject = pageObject + 1;
    const xObject = logo ? `/XObject << /Logo ${imageObjectNumber} 0 R >>` : "";
    objects.push(ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> ${xObject} >> /Contents ${contentObject} 0 R >>`));
    const stream = page.commands.join("\n");
    const streamBytes = ascii(stream);
    objects.push(ascii(`<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream`));
  });

  if (logo) {
    objects.push(concatBytes([
      ascii(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.data.length} >>\nstream\n`),
      logo.data,
      ascii("\nendstream")
    ]));
  }

  const parts: Uint8Array[] = [ascii("%PDF-1.4\n")];
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(parts.reduce((sum, part) => sum + part.length, 0));
    parts.push(ascii(`${index + 1} 0 obj\n`));
    parts.push(object instanceof Uint8Array ? object : ascii(object));
    parts.push(ascii("\nendobj\n"));
  });

  const xrefStart = parts.reduce((sum, part) => sum + part.length, 0);
  let trailer = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    trailer += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  trailer += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  parts.push(ascii(trailer));

  const pdfBytes = concatBytes(parts);
  const pdfBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
  return new Blob([pdfBuffer], { type: "application/pdf" });
}

export async function downloadServicePdf(machine: Machine, record: ServiceRecord) {
  const blob = buildPdf(machine, record, await loadLogoImage());
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${reportCode(machine, record)}-${machine.code}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
