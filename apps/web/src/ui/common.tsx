import { ELEMENTS, type ElementKind } from '@ventisca/core';
import { type InputHTMLAttributes, type ReactNode, useEffect, useId, useState } from 'react';
import { art } from '../art';
import { ES } from '../i18n/es';

const INK = '#1F2440';

/** Glifo de elemento para las cartas (llama, ola, copo). */
export function ElementGlyph({ el, className }: { el: ElementKind; className?: string }) {
  if (el === 'fire') {
    return (
      <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
        <polygon
          points="16,2 26,15 25,25 16,30 7,25 6,15 11,19"
          fill="#E4572E"
          stroke={INK}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <polygon points="16,13 21,21 16,27 11,21" fill="#F2B84B" />
      </svg>
    );
  }
  if (el === 'water') {
    return (
      <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
        <path
          d="M2 22 Q8 10 16 12 Q24 14 22 6 Q30 10 30 22 Q23 27 16 23 Q9 27 2 22 Z"
          fill="#5B8FE6"
          stroke={INK}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path d="M6 22 Q12 18 16 20" fill="none" stroke="#CFE0FA" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      {[0, 60, 120].map((r) => (
        <g key={r} transform={`rotate(${r} 16 16)`}>
          <line x1="16" y1="3" x2="16" y2="29" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
          <line x1="16" y1="3" x2="16" y2="29" stroke="#7FDBCD" strokeWidth="2" strokeLinecap="round" />
        </g>
      ))}
      <circle cx="16" cy="16" r="4" fill="#4FC9B8" stroke={INK} strokeWidth="2" />
    </svg>
  );
}

export type IconName =
  | 'alert'
  | 'pause'
  | 'help'
  | 'bulb'
  | 'close'
  | 'restart'
  | 'home'
  | 'copy'
  | 'play'
  | 'medal'
  | 'check'
  | 'flake'
  | 'coin'
  | 'cards';

export function Icon({ name }: { name: IconName }) {
  const common = {
    fill: 'none',
    stroke: INK,
    strokeWidth: 2.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'alert':
      // Toma el color del texto: va en los mensajes de error, en --danger.
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.5 21.5 20h-19z" {...common} stroke="currentColor" />
          <path d="M12 10v4.5" {...common} stroke="currentColor" />
          <circle cx="12" cy="17.3" r="1.3" fill="currentColor" />
        </svg>
      );
    case 'pause':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1" fill={INK} />
          <rect x="14" y="5" width="4" height="14" rx="1" fill={INK} />
        </svg>
      );
    case 'help':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8.5 9a3.5 3.5 0 1 1 5.2 3c-1 .6-1.7 1.2-1.7 2.5V15" {...common} />
          <circle cx="12" cy="19" r="1.4" fill={INK} />
        </svg>
      );
    case 'bulb':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M9 17h6M10 20.5h4M12 3a6 6 0 0 0-3.5 10.9c.4.3.5.7.5 1.1V17h6v-2c0-.4.1-.8.5-1.1A6 6 0 0 0 12 3Z"
            {...common}
            fill="#F8D78C"
          />
        </svg>
      );
    case 'close':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" {...common} />
        </svg>
      );
    case 'restart':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4" {...common} />
        </svg>
      );
    case 'home':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" {...common} />
        </svg>
      );
    case 'copy':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="8" y="8" width="12" height="12" rx="2" {...common} />
          <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" {...common} />
        </svg>
      );
    case 'play':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
        </svg>
      );
    case 'medal':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="13" r="6" {...common} />
          <path d="M9 7.5L7 2h4l1 3M15 7.5L17 2h-4" {...common} />
        </svg>
      );
    case 'check':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7" {...common} />
        </svg>
      );
    case 'coin':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" fill="#F2B84B" stroke={INK} strokeWidth="2.2" />
          <circle cx="12" cy="12" r="6" fill="none" stroke="#B88A22" strokeWidth="1.4" />
          <rect x="10" y="10" width="4" height="4" rx="0.6" fill={INK} transform="rotate(45 12 12)" />
        </svg>
      );
    case 'cards':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="6" width="11" height="15" rx="2" {...common} fill="#F6F9FB" transform="rotate(-8 8 13)" />
          <rect x="9" y="3" width="11" height="15" rx="2" {...common} fill="#F6F9FB" transform="rotate(8 15 11)" />
        </svg>
      );
    case 'flake':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2" {...common} stroke="#2E9E8F" />
        </svg>
      );
  }
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      <span>{label}</span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; detail?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <fieldset className="seg" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          <b>{o.label}</b>
          {o.detail ? <span>{o.detail}</span> : null}
        </button>
      ))}
    </fieldset>
  );
}

export function Modal({
  children,
  className = '',
  onClose,
  label,
}: {
  children: ReactNode;
  className?: string;
  onClose?: () => void;
  label: string;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`modal paper ${className}`} role="dialog" aria-modal="true" aria-label={label}>
        {onClose ? (
          <button type="button" className="icon-btn close" onClick={onClose} aria-label={ES.close}>
            <Icon name="close" />
          </button>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** Número que cuenta hacia arriba (resultados). Sin animación, muestra el valor final. */
export function useCountUp(
  to: number,
  o: { from?: number; ms?: number; delay?: number; enabled?: boolean } = {},
): number {
  const { from = 0, ms = 800, delay = 0, enabled = true } = o;
  const [value, setValue] = useState(enabled ? from : to);
  useEffect(() => {
    if (!enabled) {
      setValue(to);
      return;
    }
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / ms));
      setValue(Math.round(from + (to - from) * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, from, ms, delay, enabled]);
  return value;
}

/* ---------- Formularios (docs/lineamientos-de-diseno.md, sección 4) ---------- */

/**
 * Campo con su etiqueta arriba, la ayuda debajo y, si hay error, el mensaje en lugar de la ayuda. La
 * ayuda y el error van aparte de la etiqueta (aria-describedby): el nombre del campo es solo la etiqueta.
 * `code` lo muestra en grande, para el código de 6 dígitos.
 */
export function Field({
  label,
  hint,
  error,
  code = false,
  ...input
}: { label: string; hint?: string; error?: string | null; code?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const described = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`field${code ? ' field-code' : ''}${error ? ' invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={described} {...input} />
      {error ? (
        <p id={`${id}-error`} className="field-error" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <small id={`${id}-hint`}>{hint}</small>
      ) : null}
    </div>
  );
}

/** Casilla de 22 px; marcada, tinta con la marca en papel. */
export function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="check-box">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 12.5l4.5 4.5L19 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>{children}</span>
    </label>
  );
}

export type NoticeTone = 'danger' | 'gold' | 'snow';

const NOTICE_ICON: Record<NoticeTone, IconName> = { danger: 'alert', gold: 'bulb', snow: 'check' };

/** Mensaje en un papel compacto con una franja de color. Los errores se anuncian al momento. */
export function Notice({ tone, children }: { tone: NoticeTone; children: ReactNode }) {
  return (
    <div className={`paper notice notice-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={NOTICE_ICON[tone]} />
      <span>{children}</span>
    </div>
  );
}

/**
 * Botón que envía un formulario. Ocupado, cambia su texto y queda deshabilitado; nunca un indicador de
 * carga suelto. `form` lo asocia a un formulario que está en otra parte de la pantalla.
 */
export function SubmitButton({
  label,
  busy,
  disabled,
  form,
  danger = false,
  large = false,
}: {
  label: string;
  busy: boolean;
  disabled?: boolean;
  form?: string;
  danger?: boolean;
  large?: boolean;
}) {
  return (
    <button
      type="submit"
      form={form}
      className={`btn ${danger ? 'btn-danger' : 'btn-primary'}${large ? ' btn-lg' : ''}`}
      disabled={busy || disabled}
    >
      {busy ? ES.sending : label}
    </button>
  );
}

/* ---------- Composición de pantallas (lineamientos, sección 5) ---------- */

/** El encabezado de una pantalla: el título y, debajo, una línea que la explica. */
export function ScreenHead({ title, intro, children }: { title: string; intro?: string; children?: ReactNode }) {
  return (
    <div className="screen-head">
      <h1 className="display">{title}</h1>
      {intro ? <p>{intro}</p> : null}
      {children}
    </div>
  );
}

/** La fila de acciones, abajo a la derecha: "Volver" a la izquierda del primario. */
export function ScreenActions({ children }: { children: ReactNode }) {
  return <div className="screen-actions">{children}</div>;
}

/** Los tres ninjas de pie, como en la portada. Decorativos. */
export function NinjaTrio() {
  return (
    <div className="ninja-trio" aria-hidden="true">
      {ELEMENTS.map((el) => (
        <img key={el} src={art.ninja(el)} alt="" />
      ))}
    </div>
  );
}

/** Dos o tres puntos concretos, con un ícono o un número de paso y, si hace falta, una etiqueta de estado. */
export function Points({ items }: { items: { mark: IconName | number; text: string; tag?: string }[] }) {
  return (
    <ul className="points">
      {items.map((item) => (
        <li key={item.text}>
          <span className="mark" aria-hidden="true">
            {typeof item.mark === 'number' ? item.mark : <Icon name={item.mark} />}
          </span>
          <span>{item.text}</span>
          {item.tag ? (
            <>
              {' '}
              <span className="tag">{item.tag}</span>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
