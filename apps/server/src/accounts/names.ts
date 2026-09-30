import type { NameProblem } from '@ventisca/protocol';

/*
 * Nombres visibles (PRD de v2, "Cuentas"): de 3 a 16 caracteres, únicos sin distinguir mayúsculas ni
 * tildes, y con filtro de palabras. Las listas y la regla las aprobó el dueño de producto el 2026-09-30.
 *
 * Cómo se compara:
 * 1. NFKC (las letras de ancho completo pasan a su forma normal) y minúsculas.
 * 2. Las entradas numéricas (1488) se buscan antes de traducir números.
 * 3. Sin tildes salvo la ñ, y con los reemplazos 0→o, 3→e, 4→a, 5→s, 7→t, @→a, $→s. El 1 se prueba
 *    leído como i y como l: basta con que una lectura coincida. Un grupo de dígitos con alguno sin
 *    lectura de letra (2, 6, 8, 9) es un número, no letras: "Ana1848" no se lee "Anal…", y "cu1o" sí
 *    se lee "culo".
 * 4. Sin juntar letras: cada entrada pide al menos las letras repetidas que trae ("perra" es
 *    p+e+r{2,}a+), así "perrrra" coincide y "pera" no.
 * 5. Lista A: subcadena, después de quitar las excepciones. Lista B: palabra completa.
 */

const LIST_A = [
  // Español
  'puta',
  'puto',
  'mierda',
  'pendej',
  'cabron',
  'maric',
  'malparid',
  'hijueputa',
  'hijodeputa',
  'gonorrea',
  'culero',
  'chinga',
  'verga',
  'mamahuevo',
  'mamaguevo',
  'conchatumadre',
  'conchetumare',
  'sudaca',
  'negrata',
  'sidoso',
  'subnormal',
  'mongolic',
  'violador',
  'pedofil',
  'pederast',
  'zoofil',
  'necrofil',
  'porno',
  'vagina',
  // Inglés
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'faggot',
  'nigg',
  'retard',
  'rapist',
  'porn',
  'dildo',
  'whore',
  'slut',
  'killyourself',
  // Odio
  'nazi',
  'hitler',
  'kkk',
  'siegheil',
];

/** Palabras inocentes que contienen una raíz de la lista A; se quitan antes de buscar. */
const EXCEPTIONS = [
  'computa',
  'disputa',
  'reputa',
  'imputa',
  'diputa',
  'amputa',
  'vergara',
  'scunthorpe',
  'therapist',
  'nazir',
];

/** Se buscan en el nombre sin espacios, guiones ni puntos, antes de traducir los números. */
const NUMERIC = ['1488'];

const LIST_B = [
  // Español
  'culo',
  'coño',
  'perra',
  'zorra',
  'joto',
  'pinche',
  'pene',
  'teta',
  'tetas',
  'paja',
  'pajero',
  'mamada',
  'huevon',
  'guevon',
  'chucha',
  'concha',
  'hdp',
  'ctm',
  'sexo',
  'sida',
  'retrasado',
  'mongol',
  'travelo',
  'bollera',
  'tortillera',
  'violar',
  // Inglés
  'dick',
  'cock',
  'pussy',
  'fag',
  'rape',
  'sex',
  'anal',
  'anus',
  'cum',
  'kys',
  'tits',
];

const RESERVED = [
  'admin',
  'administrador',
  'moderador',
  'mod',
  'soporte',
  'ayuda',
  'oficial',
  'staff',
  'sistema',
  'ventisca',
  'bot',
  'anonimo',
  'invitado',
  'null',
  'undefined',
  'root',
  // La interfaz muestra el nombre del ninja junto al de la persona.
  'brasa',
  'marea',
  'escarcha',
];

const LEET: Record<string, string> = { 0: 'o', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };

const escapeRegex = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Cada racha de una misma letra pide al menos ese largo: "perra" es p{1,}e{1,}r{2,}a{1,}. */
function runs(word: string): string {
  let out = '';
  for (const m of word.matchAll(/(.)\1*/gu)) out += `${escapeRegex(m[1] as string)}{${m[0].length},}`;
  return out;
}

const LIST_A_RE = LIST_A.map((w) => new RegExp(runs(w), 'u'));
const LIST_B_RE = LIST_B.map((w) => new RegExp(`^${runs(w)}$`, 'u'));

/** Marcador para conservar la ñ al quitar las tildes (un carácter de uso privado). */
const KEEP_ENYE = '\uE000';

/** Minúsculas sin tildes; la ñ se conserva. */
const stripMarks = (s: string) =>
  s.toLowerCase().replaceAll('ñ', KEEP_ENYE).normalize('NFD').replace(/\p{M}/gu, '').replaceAll(KEEP_ENYE, 'ñ');

/** Solo letras, con los números leídos como letras; el 1 según la lectura pedida. */
function letters(s: string, one: 'i' | 'l'): string {
  const mapped = [...stripMarks(s)].map((c) => (c === '1' ? one : (LEET[c] ?? c))).join('');
  return mapped.replace(/[^\p{L}]/gu, '');
}

/** Clave de unicidad: sin distinguir mayúsculas, tildes ni variantes de ancho. */
export function nameKey(name: string): string {
  return stripMarks(name.normalize('NFKC').trim());
}

/** El nombre tal como se guarda y se muestra: sin espacios en los bordes y en NFC. */
export const cleanName = (name: string) => name.trim().normalize('NFC');

const ALLOWED = /^[\p{L}\p{Nd} _-]+$/u;

/** Devuelve el problema del nombre, o null si se puede usar. */
export function checkName(input: string): NameProblem | null {
  const name = cleanName(input);
  const length = [...name].length;
  if (length < 3 || length > 16) return 'length';
  if (!ALLOWED.test(name)) return 'characters';
  // Los espacios de los bordes se quitan solos (cleanName); los dobles se rechazan.
  if (/ {2}/.test(name)) return 'spaces';

  // Un grupo de dígitos con alguno sin lectura de letra se toma como número y separa palabras.
  const nfkc = name.normalize('NFKC').replace(/\p{Nd}+/gu, (run) => (/[2689]/.test(run) ? ' ' : run));
  const readings = ['i', 'l'] as const;
  if (readings.some((one) => RESERVED.includes(letters(nfkc, one)))) return 'reserved';

  const compact = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_\-.]/g, '');
  if (NUMERIC.some((n) => compact.includes(n))) return 'offensive';

  for (const one of readings) {
    let rest = letters(nfkc, one);
    for (const e of EXCEPTIONS) rest = rest.replaceAll(e, '·');
    if (LIST_A_RE.some((re) => re.test(rest))) return 'offensive';

    const words = nfkc
      .split(/[\s_\-.]+|(?<=\p{Ll})(?=\p{Lu})|[^\p{L}\p{N}@$]+/u)
      .map((w) => letters(w, one))
      .filter(Boolean);
    if (words.some((w) => LIST_B_RE.some((re) => re.test(w)))) return 'offensive';
  }
  return null;
}
