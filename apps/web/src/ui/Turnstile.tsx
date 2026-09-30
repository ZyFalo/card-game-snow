import { useEffect, useRef } from 'react';

/*
 * Captcha del registro (Cloudflare Turnstile). El script de Cloudflare se carga solo cuando se monta
 * este componente, es decir, solo en la vista de registro: lo promete el aviso de privacidad.
 */

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  remove(id: string): void;
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  const w = window as unknown as { turnstile?: TurnstileApi };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error('Turnstile no cargó')));
    script.onerror = () => {
      loading = null;
      reject(new Error('Turnstile no cargó'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** El token llega por `onToken`; vale una sola vez, así que el formulario remonta el widget tras enviarlo. */
export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;

  useEffect(() => {
    let id: string | undefined;
    let cancelled = false;
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !ref.current) return;
        id = ts.render(ref.current, {
          sitekey: siteKey,
          language: 'es',
          callback: (token: string) => callback.current(token),
          'expired-callback': () => callback.current(null),
          'error-callback': () => callback.current(null),
        });
      })
      .catch(() => callback.current(null));
    return () => {
      cancelled = true;
      const w = window as unknown as { turnstile?: TurnstileApi };
      if (id && w.turnstile) w.turnstile.remove(id);
    };
  }, [siteKey]);

  return <div ref={ref} className="turnstile" />;
}
