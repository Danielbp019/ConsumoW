import { jsPDF } from "jspdf";
import { dibujarTitulo, dibujarMeta, dibujarSeccion, textoDetalle, textoEnvoltura, nuevaPagina } from "./pdfEstilo";

export interface PruebaPantalla {
  id: string;
  nombre: string;
  tipo: "color" | "gradiente" | "sangrado";
  patron: string;
  instruccion: string;
  estado: "pendiente" | "correcto" | "defecto";
}

// Patrones de la batería; "patron" es la clase CSS aplicada a la zona de prueba.
export const PRUEBAS_PANTALLA: PruebaPantalla[] = [
  {
    id: "pixeles-rojo",
    nombre: "Píxeles muertos — Rojo",
    tipo: "color",
    patron: "pantalla-patron-rojo",
    instruccion: "Busca puntos que no cambien de color: píxeles atascados o muertos.",
    estado: "pendiente",
  },
  {
    id: "pixeles-verde",
    nombre: "Píxeles muertos — Verde",
    tipo: "color",
    patron: "pantalla-patron-verde",
    instruccion: "Busca puntos que no cambien de color: píxeles atascados o muertos.",
    estado: "pendiente",
  },
  {
    id: "pixeles-azul",
    nombre: "Píxeles muertos — Azul",
    tipo: "color",
    patron: "pantalla-patron-azul",
    instruccion: "Busca puntos que no cambien de color: píxeles atascados o muertos.",
    estado: "pendiente",
  },
  {
    id: "pixeles-blanco",
    nombre: "Píxeles muertos — Blanco",
    tipo: "color",
    patron: "pantalla-patron-blanco",
    instruccion: "Busca puntos oscuros o de otro color: píxeles atascados o muertos.",
    estado: "pendiente",
  },
  {
    id: "pixeles-negro",
    nombre: "Píxeles muertos — Negro",
    tipo: "color",
    patron: "pantalla-patron-negro",
    instruccion: "Busca puntos brillantes o de otro color que no deberían verse en negro.",
    estado: "pendiente",
  },
  {
    id: "banding",
    nombre: "Banding / Gradiente",
    tipo: "gradiente",
    patron: "pantalla-patron-gradiente",
    instruccion: "Observa el degradado: busca saltos o escalones de tono (bandas visibles).",
    estado: "pendiente",
  },
  {
    id: "sangrado",
    nombre: "Sangrado de luz",
    tipo: "sangrado",
    patron: "pantalla-patron-sangrado",
    instruccion:
      "Revisa los bordes y esquinas en busca de zonas más brillantes o nubes de luz. Sube el brillo del monitor si puedes.",
    estado: "pendiente",
  },
];

export interface PantallaResultado {
  resolucionNativa: string;
  dpr: number;
  profundidadColor: number;
  aspectRatio: string;
  refreshRate: number | null;
  intervaloRefresco: number;
  framesSaltados: number;
  framesMedidos: number;
  pruebasVisuales: PruebaPantalla[];
  veredicto: string;
}

export function obtenerInfoMonitor() {
  return {
    resolucionNativa: `${screen.width}x${screen.height}`,
    dpr: window.devicePixelRatio || 1,
    profundidadColor: screen.colorDepth,
    aspectRatio: (screen.width / screen.height).toFixed(2),
  };
}

export function estimarTasaRefresco(
  duracionMs: number,
): Promise<{ hz: number | null; intervaloMedio: number; framesSaltados: number; frames: number }> {
  return new Promise((resolve) => {
    const intervalos: number[] = [];
    let anterior: number | null = null;
    let frames = 0;
    const fin = performance.now() + duracionMs;
    const paso = (now: number) => {
      if (anterior !== null) {
        intervalos.push(now - anterior);
      }
      anterior = now;
      frames += 1;
      if (performance.now() < fin) {
        requestAnimationFrame(paso);
      } else {
        const ordenados = [...intervalos].sort((a, b) => a - b);
        const mediana = ordenados[Math.floor(ordenados.length / 2)] ?? 0;
        const hz = mediana > 0 ? Math.round(1000 / mediana) : null;
        const framesSaltados = intervalos.filter((g) => g > mediana * 1.8).length;
        resolve({
          hz,
          intervaloMedio: Math.round(mediana * 100) / 100,
          framesSaltados,
          frames,
        });
      }
    };
    requestAnimationFrame(paso);
  });
}

export function generarVeredicto(pruebas: PruebaPantalla[], refreshRate: number | null): string {
  const defectos = pruebas.filter((p) => p.estado === "defecto");
  const completadas = pruebas.filter((p) => p.estado !== "pendiente");
  let texto = "";
  if (defectos.length > 0) {
    const nombres = defectos.map((d) => d.nombre).join(", ");
    texto = `Se detectaron posibles defectos en: ${nombres}. Revisa con atención esas zonas y consulta la política de píxeles del fabricante.`;
  } else if (completadas.length === pruebas.length) {
    texto = "No se detectaron defectos evidentes en las pruebas visuales.";
  } else {
    texto = "La batería de pruebas no se completó.";
  }
  if (refreshRate !== null) {
    texto += ` La frecuencia de actualización estimada es de ${refreshRate} Hz.`;
  }
  return texto;
}

export function generarPDF(r: PantallaResultado): void {
  const doc = new jsPDF();
  const fecha = new Date();
  let y = dibujarTitulo(doc, "TimberTec - Diagnóstico de Pantalla", 20);
  y = dibujarMeta(doc, y, [
    ["Fecha", `${fecha.toLocaleDateString("es-ES")} — Hora: ${fecha.toLocaleTimeString("es-ES")}`],
  ]);

  y = dibujarSeccion(doc, y, "Resultados");
  textoDetalle(doc);
  const lineas = [
    `Resolución nativa: ${r.resolucionNativa}`,
    `Densidad de píxeles (dpr): ${r.dpr}`,
    `Profundidad de color: ${r.profundidadColor} bits`,
    `Relación de aspecto: ${r.aspectRatio}`,
    `Frecuencia de actualización estimada: ${r.refreshRate !== null ? `${r.refreshRate} Hz` : "No disponible"}`,
    `Intervalo medio entre frames: ${r.intervaloRefresco} ms`,
    `Frames saltados: ${r.framesSaltados} de ${r.framesMedidos}`,
  ];
  for (const linea of lineas) {
    doc.text(linea, 14, y);
    y += 7;
  }

  y += 4;
  y = dibujarSeccion(doc, y, "Pruebas visuales");
  textoDetalle(doc);
  const etiqueta = (estado: string) =>
    estado === "correcto" ? "Correcta" : estado === "defecto" ? "Con defecto" : "Pendiente";
  for (const prueba of r.pruebasVisuales) {
    if (y > 270) {
      nuevaPagina(doc);
      y = 20;
    }
    doc.text(`${prueba.nombre}: ${etiqueta(prueba.estado)}`, 16, y);
    y += 6;
  }

  y += 4;
  if (y > 265) {
    nuevaPagina(doc);
    y = 20;
  }
  y = dibujarSeccion(doc, y, "Veredicto");
  textoDetalle(doc);
  const veredicto = textoEnvoltura(doc, r.veredicto);
  for (const linea of veredicto) {
    if (y > 270) {
      nuevaPagina(doc);
      y = 20;
    }
    doc.text(linea, 14, y);
    y += 6;
  }

  doc.save("diagnostico-pantalla.pdf");
}
