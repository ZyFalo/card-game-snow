/**
 * Multiplicador global de duración de animaciones leído de la URL (?speed=0.2).
 * Sirve para pruebas automáticas y demos rápidas; por defecto es 1.
 */
function readSpeed(): number {
  try {
    const raw = Number(new URLSearchParams(window.location.search).get('speed'));
    return Number.isFinite(raw) && raw > 0 ? Math.min(2, Math.max(0.05, raw)) : 1;
  } catch {
    return 1;
  }
}

export const URL_SPEED = readSpeed();
