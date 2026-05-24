// Módulo centralizado de formato visual - Estilo Beyonder v3

// ─── Cabecera de menú (Con barras y adornos) ─────────────────────────────────
const header = (titulo) => 
`        ⤹ ⊹ ୨୧ ${titulo.toUpperCase()} ⿻ ₊˚๑`;

// ─── Categoría (Centrada con adornos) ────────────────────────────────────────
const category = (nombre) =>
`\n                     𝄄 𓈒   ⁺ ${nombre}   𓏼\n`;

// ─── Línea de comando (Con sangría y descripción) ───────────────────────────
const cmdLine = (emoji, cmd, desc) =>
`       𝄄➥𓈒   ⁺ ${emoji}  *!${cmd}*
       𝄄   _${desc}_\n`;

// ─── Aviso / Error / Confirmación (El formato del rayo) ─────────────────────
const aviso = (mensaje) =>
`                 𑂯 ( ⚡ ) ⁺ 𓈒  ׁ     
 𝄄➥ ${mensaje}
       @𝐀𝗍𝗍𝖾 : ℬeyonder`;

// ─── Sección de lista (Staff / Miembros) ─────────────────────────────────────
const listSection = (titulo) =>
`                     𝄄 𓈒   ⁺ ${titulo}   𓏼\n`;

// ─── Línea de ítem de lista (Sin etiquetas @ para evitar flood de notificaciones) ───────
const listItem = (nombre, icono = "") => {
  return ` 𝄄➥ *${nombre}*${icono ? " " + icono : ""}\n`;
};

// ─── Lógica de Íconos de Inactividad ─────────────────────────────────────────
const inactividadIcon = (lastMessage) => {
  if (!lastMessage) return "▪️";
  const dias = (Date.now() - new Date(lastMessage).getTime()) / 86400000;
  if (dias >= 7) return "🔸";
  if (dias >= 3) return "🔹";
  return "";
};

// ─── Interfaz de Info / Perfil ───────────────────────────────────────────────
const infoHeader = () => {
  return ` ‎ ‎ ‎             𐔌 . ▧ˎˊ˗     ⿻๋࣭ ⭑    ♯.ᐟ ֹ ₊ ꒱ ‎ ‎`;
};

const infoField = (campo, valor) =>
`\n𝄄➥ ${campo}: ${valor}`;

// ─── Barra de Progreso Visual ────────────────────────────────────────────────
const renderBar = (actual, max, size = 10) => {
  const porcentaje = Math.max(0, Math.min(100, (actual / max) * 100));
  const completado = Math.round((size * porcentaje) / 100);
  const vacio = size - completado;
  const barra = "▰".repeat(completado) + "▱".repeat(vacio);
  return `[${barra}]`;
};

const progressBar = (porcentaje, tamano = 10) => {
  const completado = Math.round((tamano * porcentaje) / 100);
  const vacio = tamano - completado;
  const barra = "▰".repeat(completado) + "▱".repeat(vacio);
  return `[${barra}] ${porcentaje}%`;
};

const mention = (jid) => {
  if (!jid) return '';
  const num = jid.split('@')[0];
  return `@${num}`;
};

module.exports = {
  header,
  category,
  cmdLine,
  aviso,
  listSection,
  listItem,
  inactividadIcon,
  infoHeader,
  infoField,
  renderBar,
  progressBar,
  mention
};
