/*
 * Límites de abuso (PRD de v2, "Cuentas"): viven en memoria, porque hay una sola instancia (se
 * reinician con el servidor). Se cuentan por clave, sin mirar si la cuenta existe (D-59).
 */

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly now: () => Date,
  ) {}

  private recent(key: string): number[] {
    const since = this.now().getTime() - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  /** Si la clave ya llegó al límite en la ventana. */
  blocked(key: string): boolean {
    return this.recent(key).length >= this.limit;
  }

  /** Segundos hasta que se libere un intento, para la cabecera Retry-After. */
  retryAfter(key: string): number {
    const oldest = this.recent(key)[0];
    if (oldest === undefined) return 0;
    return Math.max(1, Math.ceil((oldest + this.windowMs - this.now().getTime()) / 1000));
  }

  hit(key: string): void {
    const list = this.recent(key);
    list.push(this.now().getTime());
    this.hits.set(key, list);
    if (this.hits.size > 50_000) this.prune();
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private prune(): void {
    for (const key of [...this.hits.keys()]) this.recent(key);
  }
}

const MINUTE = 60_000;

/** Los límites del PRD de v2. */
export function accountLimits(now: () => Date) {
  return {
    /** Hasta 5 intentos fallidos de inicio de sesión cada 15 min por cuenta (el correo escrito)… */
    loginByAccount: new RateLimiter(5, 15 * MINUTE, now),
    /** …y por IP. */
    loginByIp: new RateLimiter(5, 15 * MINUTE, now),
    /** Hasta 3 correos por hora por dirección. Pasado el límite no se envía, sin avisar (D-59). */
    mailByAddress: new RateLimiter(3, 60 * MINUTE, now),
  };
}
export type AccountLimits = ReturnType<typeof accountLimits>;
