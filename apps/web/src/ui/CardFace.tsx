import type { BankCard } from '@ventisca/core';
import { NINJA_TEXT } from '../i18n/es';
import { ElementGlyph, Icon } from './common';

/** Cara de una carta del banco (§18): colección, camino y revelado de cajas. */
export function CardFace({
  card,
  qty = 1,
  locked = false,
  badge,
  size = 'md',
}: {
  card: BankCard;
  qty?: number;
  locked?: boolean;
  badge?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const t = NINJA_TEXT[card.element];
  if (locked) {
    return (
      <div
        className={`cface ${size} locked el-${card.element}`}
        role="img"
        aria-label={`Carta de ${t.element} de ${card.value} que aún no tienes`}
      >
        <span className="band">
          <span>{t.element}</span>
        </span>
        <span className="value">{card.value}</span>
        <span className="name">? ? ?</span>
      </div>
    );
  }
  return (
    <div
      className={`cface ${size} el-${card.element}`}
      role="img"
      aria-label={`${card.name}: carta de ${t.element} de ${card.value}${qty > 1 ? `, tienes ${qty}` : ''}`}
    >
      <span className="band">
        <span>{t.element}</span>
        {qty > 1 ? <span className="qty">×{qty}</span> : null}
      </span>
      <span className="value">{card.value}</span>
      <ElementGlyph el={card.element} className="glyph" />
      <span className="name">{card.name}</span>
      {badge ? <span className={`cbadge ${badge === 'Nueva' ? 'new' : ''}`}>{badge}</span> : null}
    </div>
  );
}

export function CoinChip({ amount, label }: { amount: number; label?: string }) {
  return (
    <span className="coin-chip">
      <Icon name="coin" />
      <b>{amount.toLocaleString('es')}</b>
      <span className="sr-only"> monedas</span>
      {label ? <span>{label}</span> : null}
    </span>
  );
}
