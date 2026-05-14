import type { Machine, ServiceRecord } from "./types";

function formatDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function clean(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "")
    .replace(/[()\\]/g, "\\$&");
}

function wrap(text: string, maxLength = 92) {
  const words = clean(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function makeLines(machine: Machine, record: ServiceRecord) {
  const emails = machine.machine_emails?.map((item) => item.email).join("; ") || "-";

  return [
    "RELATORIO DE ATENDIMENTO TOMASONI",
    "",
    `Cliente: ${machine.client}`,
    `Maquina: ${machine.code}`,
    `Modelo: ${machine.model}`,
    `Numero de serie: ${machine.serial || "-"}`,
    `Versao do software: ${machine.software_version || "-"}`,
    `Forma de acesso: ${machine.access_method || "-"}`,
    `E-mails do cliente: ${emails}`,
    "",
    `Data do atendimento: ${formatDate(record.service_date)}`,
    `Tecnico responsavel: ${record.technician_name}`,
    `E-mail do tecnico: ${record.technician_email || "-"}`,
    `Equipamento: ${record.equipment || "-"}`,
    "",
    "Solicitacao do cliente / problema relatado:",
    ...wrap(record.request),
    "",
    "Diagnostico:",
    ...wrap(record.diagnosis),
    "",
    "Servico realizado:",
    ...wrap(record.service_done),
    "",
    "Observacoes:",
    ...wrap(record.observations || "-")
  ];
}

function buildPdf(lines: string[]) {
  const lineHeight = 16;
  const top = 790;
  const bottom = 60;
  const linesPerPage = Math.floor((top - bottom) / lineHeight);
  const pages: string[][] = [];

  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`);

  pages.forEach((pageLines, pageIndex) => {
    const pageObject = 3 + pageIndex * 2;
    const contentObject = pageObject + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObject} 0 R >>`);

    const streamLines = ["BT", "/F1 10 Tf", "50 790 Td"];
    pageLines.forEach((line, lineIndex) => {
      streamLines.push(lineIndex === 0 && pageIndex === 0 ? "/F2 15 Tf" : "/F1 10 Tf");
      streamLines.push(`(${clean(line)}) Tj`);
      streamLines.push(`0 -${lineHeight} Td`);
    });
    streamLines.push("ET");

    const stream = streamLines.join("\n");
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
  const blob = buildPdf(makeLines(machine, record));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-atendimento-${machine.code}-${record.service_date}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
