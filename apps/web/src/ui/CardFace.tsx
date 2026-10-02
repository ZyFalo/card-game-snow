import type { BankCard } from '@ventisca/core';
import { NINJA_TEXT, PROGRESS_TEXT as P } from '../i18n/es';
import { ElementGlyph, Icon } from './common';

/**
 * Cara de una carta del banco (PRD §18): en la colección, al elegir el camino y al abrir una caja.
 * `locked` la muestra como silueta, para las que faltan. `fresh` le pone la marca de nueva o repetida.
 */
export function CardFace({
  card,
  qty = 1,
  locked = false,
  fresh,
  size = 'md',
}: {
  card: BankCard;
  qty?: number;
  locked?: boolean;
  fresh?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const t = NINJA_TEXT[card.element];
  if (locked) {
    return (
      <span
        className={`cface ${size} locked el-${card.element}`}
        role="img"
        aria-label={P.cardMissing(t.element, card.value)}
      >
        <span className="band">
          <span>{t.element}</span>
        </span>
        <span className="value">{card.value}</span>
        <span className="name">{P.missingName}</span>
      </span>
    );
  }
  const mark = fresh === undefined ? null : fresh ? P.fresh : P.repeated;
  return (
    <span
      className={`cface ${size} el-${card.element}`}
      role="img"
      aria-label={`${P.cardOwned(card.name, t.element, card.value, qty)}${mark ? `. ${mark}` : ''}`}
    >
      <span className="band">
        <span>{t.element}</span>
        {qty > 1 ? <span className="qty">×{qty}</span> : null}
      </span>
      <span className="value">{card.value}</span>
      <ElementGlyph el={card.element} className="glyph" />
      <span className="name">{card.name}</span>
      {mark ? <span className={`cbadge${fresh ? ' new' : ''}`}>{mark}</span> : null}
    </span>
  );
}

/** Una cantidad de monedas: el ícono y el número. Con `chip`, como dato suelto en su propio chip. */
export function Coins({ amount, chip = false }: { amount: number; chip?: boolean }) {
  return (
    <span className={`coins${chip ? ' coin-chip' : ''}`}>
      <Icon name="coin" />
      <b>{amount.toLocaleString('es')}</b>
      <span className="sr-only"> {P.coinsWord(amount)}</span>
    </span>
  );
}
