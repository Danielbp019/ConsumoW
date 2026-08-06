import type { jsPDF } from "jspdf";

const MARGEN_X = 14;
const ANCHO_TEXTO = 180;
const NEGRO: [number, number, number] = [0, 0, 0];
const GRIS_SECUNDARIO: [number, number, number] = [100, 100, 100];

function anchoPagina(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth();
}

export function dibujarTitulo(doc: jsPDF, texto: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NEGRO);
  doc.text(texto, MARGEN_X, y);
  doc.setDrawColor(...NEGRO);
  doc.setLineWidth(1);
  doc.line(MARGEN_X, y + 3, anchoPagina(doc) - MARGEN_X, y + 3);
  return y + 12;
}

export function dibujarMeta(doc: jsPDF, y: number, pares: [string, string][]): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GRIS_SECUNDARIO);
  for (const [clave, valor] of pares) {
    doc.text(`${clave}: ${valor}`, MARGEN_X, y);
    y += 5;
  }
  return y + 2;
}

export function dibujarSeccion(doc: jsPDF, y: number, texto: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...NEGRO);
  doc.text(texto, MARGEN_X, y);
  doc.setDrawColor(...NEGRO);
  doc.setLineWidth(0.5);
  doc.line(MARGEN_X, y + 2, anchoPagina(doc) - MARGEN_X, y + 2);
  return y + 9;
}

export function textoDetalle(doc: jsPDF, size = 10): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  doc.setTextColor(...NEGRO);
}

export function textoEnvoltura(doc: jsPDF, texto: string): string[] {
  return doc.splitTextToSize(texto, ANCHO_TEXTO);
}

export function nuevaPagina(doc: jsPDF): void {
  doc.addPage();
  textoDetalle(doc);
}
