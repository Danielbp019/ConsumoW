import { jsPDF } from "jspdf";

export interface CamaraDispositivo {
  id: string;
  nombre: string;
}

export interface DiagnosticoResultado {
  nombreCamara: string;
  resolucionActual: string;
  resolucionMaxima: string;
  aspectRatio: string;
  facingMode: string;
  autofocus: boolean;
  zoom: boolean;
  torch: boolean;
  fpsSolicitados: number;
  fpsObtenidos: number;
  fpsCaidas: number;
  brillo: number;
  brilloEtiqueta: string;
  contraste: number;
  contrasteEtiqueta: string;
  nitidez: number;
  nitidezEtiqueta: string;
  exposicion: string;
  iluminacionNivel: "excelente" | "aceptable" | "insuficiente";
  iluminacionRecomendacion: string;
  estabilidadEstado: string;
  estabilidadFps: number;
  estabilidadFramesPerdidos: number;
  estabilidadCongelamientos: number;
  estandarMundial: "cumple" | "parcial" | "no recomendado";
  puntaje: number;
  clasificacion: string;
  resumen: string;
}

type MetadataFrames = {
  mediaTime?: number;
};

type VideoRVCB = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata?: MetadataFrames) => void) => number;
};

const RESOLUCIONES: ReadonlyArray<readonly [number, number]> = [
  [640, 480],
  [1280, 720],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
];

function redondear(valor: number): number {
  return Math.round(valor * 10) / 10;
}

export async function detectarCamaras(): Promise<CamaraDispositivo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  const dispositivos = await navigator.mediaDevices.enumerateDevices();
  const camaras = dispositivos.filter((d) => d.kind === "videoinput");
  return camaras.map((d, index) => ({
    id: d.deviceId,
    nombre: d.label || `Cámara ${index + 1}`,
  }));
}

export async function iniciarStream(camaraId?: string): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Tu navegador no soporta acceso a la cámara.");
  }
  const video: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  };
  if (camaraId) {
    video.deviceId = { exact: camaraId };
  }
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}

export function detenerStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

type CapabilitiesExtendidas = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: boolean | { min?: number; max?: number; step?: number };
  focusMode?: string[];
};

export function obtenerInfoTecnica(stream: MediaStream, video: HTMLVideoElement) {
  const track = stream.getVideoTracks()[0];
  let settings: MediaTrackSettings = {};
  let caps: CapabilitiesExtendidas = {};
  if (track) {
    try {
      settings = track.getSettings();
    } catch {
      // El navegador no expone la configuración actual.
    }
    try {
      caps = track.getCapabilities() as CapabilitiesExtendidas;
    } catch {
      // El navegador no expone las capacidades.
    }
  }
  const ancho = video.videoWidth || settings.width;
  const alto = video.videoHeight || settings.height;
  const zoomCapable = typeof caps.zoom === "object" && caps.zoom !== null && (caps.zoom.max ?? 1) > 1;
  return {
    resolucionActual: ancho && alto ? `${ancho}x${alto}` : "Desconocida",
    aspectRatio: settings.aspectRatio ? settings.aspectRatio.toFixed(2) : "—",
    facingMode: settings.facingMode ?? "Desconocido",
    autofocus: Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous"),
    zoom: zoomCapable || caps.zoom === true,
    torch: caps.torch === true,
  };
}

function esperarResolucion(video: HTMLVideoElement, w: number, h: number, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const inicio = performance.now();
    const comprobar = () => {
      if (video.videoWidth >= w && video.videoHeight >= h) {
        resolve(true);
        return;
      }
      if (performance.now() - inicio >= ms) {
        resolve(false);
        return;
      }
      requestAnimationFrame(comprobar);
    };
    comprobar();
  });
}

export async function probarResolucionMaxima(stream: MediaStream, video: HTMLVideoElement): Promise<string> {
  const track = stream.getVideoTracks()[0];
  let mejor = "";
  for (const [w, h] of RESOLUCIONES) {
    try {
      await track.applyConstraints({ width: { exact: w }, height: { exact: h } });
      const logrado = await esperarResolucion(video, w, h, 1500);
      if (logrado) {
        mejor = `${video.videoWidth}x${video.videoHeight}`;
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  if (!mejor) {
    mejor = `${video.videoWidth || "?"}x${video.videoHeight || "?"}`;
  }
  return mejor;
}

export function medirFPS(video: HTMLVideoElement, duracionMs: number): Promise<{ fps: number; caidas: number }> {
  return new Promise((resolve) => {
    const v = video as unknown as VideoRVCB;
    let frames = 0;
    let anterior: number | null = null;
    const gaps: number[] = [];
    const fin = performance.now() + duracionMs;
    const paso = (now: number) => {
      if (anterior !== null) {
        gaps.push(now - anterior);
      }
      anterior = now;
      frames += 1;
      if (performance.now() < fin) {
        if (typeof v.requestVideoFrameCallback === "function") {
          v.requestVideoFrameCallback(paso);
        } else {
          requestAnimationFrame(paso);
        }
      } else {
        const fps = frames / (duracionMs / 1000);
        const caidas = gaps.filter((g) => g > 100).length;
        resolve({ fps: redondear(fps), caidas });
      }
    };
    if (typeof v.requestVideoFrameCallback === "function") {
      v.requestVideoFrameCallback(paso);
    } else {
      requestAnimationFrame(paso);
    }
  });
}

export function medirEstabilidad(
  video: HTMLVideoElement,
  duracionMs: number,
): Promise<{ fps: number; framesPerdidos: number; congelamientos: number; tiempoRespuesta: number }> {
  return new Promise((resolve) => {
    const v = video as unknown as VideoRVCB;
    let frames = 0;
    let anterior: number | null = null;
    let mediaAnterior: number | null = null;
    const gaps: number[] = [];
    let congelamientos = 0;
    const fin = performance.now() + duracionMs;
    const paso = (now: number, metadata?: MetadataFrames) => {
      if (anterior !== null) {
        const gap = now - anterior;
        gaps.push(gap);
        if (gap > 300) {
          congelamientos += 1;
        }
      }
      if (metadata?.mediaTime !== undefined) {
        if (mediaAnterior !== null && metadata.mediaTime - mediaAnterior > 0.3) {
          congelamientos += 1;
        }
        mediaAnterior = metadata.mediaTime;
      }
      anterior = now;
      frames += 1;
      if (performance.now() < fin) {
        if (typeof v.requestVideoFrameCallback === "function") {
          v.requestVideoFrameCallback(paso);
        } else {
          requestAnimationFrame(paso);
        }
      } else {
        const fps = frames / (duracionMs / 1000);
        const framesPerdidos = gaps.filter((g) => g > 100).length;
        const tiempoRespuesta = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
        resolve({
          fps: redondear(fps),
          framesPerdidos,
          congelamientos,
          tiempoRespuesta: redondear(tiempoRespuesta),
        });
      }
    };
    if (typeof v.requestVideoFrameCallback === "function") {
      v.requestVideoFrameCallback(paso);
    } else {
      requestAnimationFrame(paso);
    }
  });
}

export function clasificarEstabilidad(fps: number, congelamientos: number): string {
  if (fps >= 28 && congelamientos === 0) return "Excelente";
  if (fps >= 20 && congelamientos <= 1) return "Buena";
  if (fps >= 10) return "Regular";
  return "Deficiente";
}

function varianzaLaplaciana(img: Float64Array, w: number, h: number): number {
  let suma = 0;
  let sumaCuad = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const acc =
        img[(y - 1) * w + x] + img[y * w + (x - 1)] + -4 * img[y * w + x] + img[y * w + (x + 1)] + img[(y + 1) * w + x];
      suma += acc;
      sumaCuad += acc * acc;
      n += 1;
    }
  }
  if (n === 0) return 0;
  const media = suma / n;
  return sumaCuad / n - media * media;
}

export function analizarCalidadImagen(video: HTMLVideoElement) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) {
    return {
      brillo: 0,
      brilloEtiqueta: "Sin señal",
      contraste: 0,
      contrasteEtiqueta: "Sin señal",
      nitidez: 0,
      nitidezEtiqueta: "Sin señal",
      exposicion: "Sin señal",
    };
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("No se pudo analizar la imagen.");
  }
  ctx.drawImage(video, 0, 0, w, h);
  const datos = ctx.getImageData(0, 0, w, h).data;
  const pixeles = w * h;
  const luminancia = new Float64Array(pixeles);
  let suma = 0;
  let sumaCuad = 0;
  for (let i = 0, j = 0; i < datos.length; i += 4, j += 1) {
    const l = 0.2126 * datos[i] + 0.7152 * datos[i + 1] + 0.0722 * datos[i + 2];
    luminancia[j] = l;
    suma += l;
    sumaCuad += l * l;
  }
  const promedio = suma / pixeles;
  const desviacion = Math.sqrt(Math.max(0, sumaCuad / pixeles - promedio * promedio));
  const brillo = Math.round((promedio / 255) * 100);
  const contraste = Math.round((desviacion / 255) * 100);
  const varLap = varianzaLaplaciana(luminancia, w, h);
  const nitidez = Math.min(100, Math.round((varLap / 80) * 100));
  return {
    brillo,
    brilloEtiqueta: brillo < 25 ? "Muy bajo" : brillo > 75 ? "Muy alto" : "Correcto",
    contraste,
    contrasteEtiqueta: contraste < 20 ? "Bajo" : contraste > 70 ? "Alto" : "Correcto",
    nitidez,
    nitidezEtiqueta: nitidez < 30 ? "Borrosa" : nitidez < 60 ? "Aceptable" : "Nítida",
    exposicion: promedio < 76 ? "Subexpuesta" : promedio > 191 ? "Sobreexpuesta" : "Correcta",
  };
}

export function evaluarIluminacion(brillo: number) {
  if (brillo >= 45 && brillo <= 75) {
    return {
      nivel: "excelente" as const,
      recomendacion: "Iluminación excelente. No se requieren cambios.",
    };
  }
  if (brillo >= 25 && brillo < 45) {
    return {
      nivel: "aceptable" as const,
      recomendacion: "Iluminación aceptable. Considera aumentar un poco la luz frontal.",
    };
  }
  if (brillo > 75 && brillo <= 90) {
    return {
      nivel: "aceptable" as const,
      recomendacion: "Exceso de luz. Reduce el brillo o evita luces directas a la cámara.",
    };
  }
  if (brillo > 90) {
    return {
      nivel: "insuficiente" as const,
      recomendacion: "Imagen demasiado brillante. Ajusta la exposición o la dirección de la luz.",
    };
  }
  return {
    nivel: "insuficiente" as const,
    recomendacion: "Iluminación insuficiente. Aumenta la iluminación frontal.",
  };
}

export function calcularEstandarMundial(
  resolucionMaxima: string,
  fps: number,
  autofocus: boolean,
): "cumple" | "parcial" | "no recomendado" {
  const ladoMayor = Math.max(
    ...resolucionMaxima
      .split("x")
      .map((p) => parseInt(p, 10))
      .filter((n) => !Number.isNaN(n)),
    0,
  );
  const alMenos720p = ladoMayor >= 720;
  const alMenos1080p = ladoMayor >= 1080;
  const alMenos20fps = fps >= 20;
  const alMenos30fps = fps >= 30;
  if (alMenos1080p && alMenos30fps) return "cumple";
  if (alMenos720p && alMenos20fps) return "parcial";
  return "no recomendado";
}

export function calcularPuntaje(resultado: {
  resolucionMaxima: string;
  fpsObtenidos: number;
  nitidez: number;
  contraste: number;
  brillo: number;
  estabilidadEstado: string;
}) {
  const ladoMayor = Math.max(
    ...resultado.resolucionMaxima
      .split("x")
      .map((p) => parseInt(p, 10))
      .filter((n) => !Number.isNaN(n)),
    0,
  );
  let ptsResolucion = 0;
  if (ladoMayor >= 1080) ptsResolucion = 30;
  else if (ladoMayor >= 720) ptsResolucion = 20;
  else if (ladoMayor >= 480) ptsResolucion = 10;

  let ptsFps = 0;
  if (resultado.fpsObtenidos >= 30) ptsFps = 20;
  else if (resultado.fpsObtenidos >= 20) ptsFps = 14;
  else if (resultado.fpsObtenidos >= 15) ptsFps = 8;
  else ptsFps = 2;

  const ptsNitidez = Math.round((20 * Math.max(0, Math.min(100, resultado.nitidez))) / 100);
  const ptsContraste = Math.round((10 * Math.max(0, Math.min(100, resultado.contraste))) / 100);
  const brilloPuntos = Math.max(0, Math.min(10, Math.round((10 * (100 - Math.abs(resultado.brillo - 50) * 2)) / 100)));

  const mapaEstabilidad: Record<string, number> = { Excelente: 10, Buena: 7, Regular: 4, Deficiente: 1 };
  const ptsEstabilidad = mapaEstabilidad[resultado.estabilidadEstado] ?? 1;

  const total = ptsResolucion + ptsFps + ptsNitidez + ptsContraste + brilloPuntos + ptsEstabilidad;
  let clasificacion = "Mejorable";
  if (total >= 85) clasificacion = "Excelente";
  else if (total >= 70) clasificacion = "Muy buena";
  else if (total >= 50) clasificacion = "Aceptable";
  return { total, clasificacion };
}

export function generarResumen(estandarMundial: string, iluminacion: { nivel: string; recomendacion: string }): string {
  let texto = "";
  if (estandarMundial === "cumple") {
    texto = "La cámara cumple el estándar mundial.";
  } else if (estandarMundial === "parcial") {
    texto = "La cámara cumple parcialmente el estándar mundial.";
  } else {
    texto = "La cámara no cumple el estándar mundial.";
  }
  if (iluminacion.nivel !== "excelente") {
    texto += ` ${iluminacion.recomendacion}`;
  }
  return texto;
}

export function etiquetaIluminacion(nivel: string): string {
  if (nivel === "excelente") return "Excelente";
  if (nivel === "aceptable") return "Aceptable";
  return "Insuficiente";
}

export function etiquetaEstandarMundial(valor: string): string {
  if (valor === "cumple") return "Cumple el estándar";
  if (valor === "parcial") return "Cumple parcialmente";
  return "No cumple el estándar";
}

export function etiquetaEstandarMundialClase(valor: string): "success" | "warning" | "danger" {
  if (valor === "cumple") return "success";
  if (valor === "parcial") return "warning";
  return "danger";
}

export function tareasSegunCamara(resolucionMaxima: string, fps: number): string[] {
  const ladoMayor = Math.max(
    ...resolucionMaxima
      .split("x")
      .map((p) => parseInt(p, 10))
      .filter((n) => !Number.isNaN(n)),
    0,
  );
  const tareas: string[] = [];
  if (ladoMayor >= 1080 && fps >= 30) {
    tareas.push("videollamadas Full HD y reuniones profesionales");
    tareas.push("streaming y grabación de contenido en alta calidad");
  } else if (ladoMayor >= 720 && fps >= 20) {
    tareas.push("videollamadas estándar y reuniones de trabajo");
    tareas.push("clases y educación en línea");
  } else {
    tareas.push("videollamadas básicas y mensajes de video");
    tareas.push("interacción casual en aplicaciones de mensajería");
  }
  tareas.push("videollamadas familiares y con amigos");
  return tareas;
}

export function generarPDF(r: DiagnosticoResultado): void {
  const doc = new jsPDF();
  const fecha = new Date();
  doc.setFontSize(16);
  doc.text("TimberTec - Diagnóstico de Cámara", 14, 20);
  doc.setFontSize(10);
  doc.text(`Fecha: ${fecha.toLocaleDateString("es-ES")}`, 14, 28);
  doc.text(`Hora: ${fecha.toLocaleTimeString("es-ES")}`, 14, 34);
  doc.text(`Cámara: ${r.nombreCamara}`, 14, 40);

  doc.setFontSize(12);
  doc.text("Resultados", 14, 52);
  doc.setFontSize(10);
  const lineas = [
    `Resolución actual: ${r.resolucionActual}`,
    `Resolución máxima real: ${r.resolucionMaxima}`,
    `FPS obtenidos: ${r.fpsObtenidos} (solicitados: ${r.fpsSolicitados})`,
    `Brillo: ${r.brillo}% (${r.brilloEtiqueta})`,
    `Contraste: ${r.contraste}% (${r.contrasteEtiqueta})`,
    `Nitidez: ${r.nitidez}/100 (${r.nitidezEtiqueta})`,
    `Exposición: ${r.exposicion}`,
    `Iluminación: ${etiquetaIluminacion(r.iluminacionNivel)}`,
    `Estabilidad: ${r.estabilidadEstado}`,
    `Estándar mundial: ${etiquetaEstandarMundial(r.estandarMundial)}`,
    `Puntaje general: ${r.puntaje}/100 (${r.clasificacion})`,
  ];
  let y = 58;
  for (const linea of lineas) {
    doc.text(linea, 14, y);
    y += 7;
  }

  const nuevoResumen = () => {
    doc.addPage();
    y = 20;
  };

  doc.setFontSize(12);
  doc.text("Resumen", 14, y + 8);
  doc.setFontSize(10);
  y += 16;

  const estado = doc.splitTextToSize(`Tu cámara: ${r.resumen}`, 180);
  if (y + estado.length * 5 > 270) nuevoResumen();
  doc.text(estado, 14, y);
  y += estado.length * 5 + 8;

  doc.setFontSize(11);
  doc.text("¿Qué es el estándar mundial?", 14, y);
  doc.setFontSize(10);
  y += 5;
  const estandar = doc.splitTextToSize(
    "El estándar mundial para cámaras web de uso cotidiano recomienda 1080p a 30 FPS con autofocus y considera 720p a 20 FPS como el mínimo aceptable. La resolución define la nitidez de la imagen y los FPS (fotogramas por segundo) la fluidez del movimiento.",
    180,
  );
  if (y + estandar.length * 5 > 270) nuevoResumen();
  doc.text(estandar, 14, y);
  y += estandar.length * 5 + 8;

  doc.setFontSize(11);
  doc.text("¿Para qué se usan esas resoluciones y FPS?", 14, y);
  doc.setFontSize(10);
  y += 5;
  const usos = doc.splitTextToSize(
    "720p es suficiente para videollamadas estándar, reuniones y clases en línea. 1080p (Full HD) ofrece imagen nítida para videollamadas de alta calidad, streaming y grabación de contenido. Los 30 FPS garantizan movimiento fluido y natural, y el autofocus mantiene el enfoque automático al moverte.",
    180,
  );
  if (y + usos.length * 5 > 270) nuevoResumen();
  doc.text(usos, 14, y);
  y += usos.length * 5 + 8;

  doc.setFontSize(11);
  doc.text("Tu cámara actual está bien para:", 14, y);
  doc.setFontSize(10);
  y += 5;
  for (const tarea of tareasSegunCamara(r.resolucionMaxima, r.fpsObtenidos)) {
    if (y > 270) nuevoResumen();
    doc.text(`- ${tarea}`, 16, y);
    y += 5;
  }
  doc.save("diagnostico-camara.pdf");
}
