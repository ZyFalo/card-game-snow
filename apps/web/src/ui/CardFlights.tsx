import { useEffect, useRef } from 'react';
import { landFlight } from '../state/actions';
import { type CardFlight, useApp } from '../state/store';
import { ElementGlyph } from './common';

/*
 * Cartas robadas en vuelo (fase 4): salen del ninja en el tablero y aterrizan
 * en su lugar de la mano; si esa mano no está a la vista, en el panel del ninja.
 * La capa vive dentro del escenario, así que trabaja en coordenadas de 1280×720.
 */
export function CardFlights() {
  const flights = useApp((s) => s.flights);
  if (flights.length === 0) return null;
  return (
    <div className="flights" aria-hidden="true">
      {flights.map((f) => (
        <Flight key={f.id} f={f} />
      ))}
    </div>
  );
}

function Flight({ f }: { f: CardFlight }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const stage = el?.closest('.stage') as HTMLElement | null;
    if (!el || !stage) {
      landFlight(f);
      return;
    }
    const box = stage.getBoundingClientRect();
    const scale = box.width / 1280 || 1;
    const center = (r: DOMRect) => ({
      x: (r.left - box.left + r.width / 2) / scale,
      y: (r.top - box.top + r.height / 2) / scale,
    });
    const slot = document.querySelector(`[data-card-id="${f.cardId}"]`);
    const panel = document.querySelector(`[data-ninja-panel="${f.ninja}"] .np-top img`);
    const target = slot ?? panel;
    const to = target ? center(target.getBoundingClientRect()) : { x: 640, y: 640 };
    const inHand = Boolean(slot);
    const mid = { x: (f.from.x + to.x) / 2, y: Math.min(f.from.y, to.y) - 110 };
    const at = (p: { x: number; y: number }) => `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    const anim = el.animate(
      [
        { transform: `${at(f.from)} scale(0.3) rotate(-24deg)`, opacity: 0 },
        { transform: `${at({ x: f.from.x, y: f.from.y - 34 })} scale(0.72) rotate(-10deg)`, opacity: 1, offset: 0.2 },
        { transform: `${at(mid)} scale(0.95) rotate(8deg)`, opacity: 1, offset: 0.58 },
        { transform: `${at(to)} scale(${inHand ? 1 : 0.35}) rotate(0deg)`, opacity: inHand ? 1 : 0.15 },
      ],
      { duration: Math.max(160, f.ms), easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' },
    );
    anim.onfinish = () => landFlight(f);
    return () => anim.cancel();
  }, [f]);

  return (
    <div ref={ref} className={`flight el-${f.element}`}>
      <span className="band" />
      <b>{f.value}</b>
      <ElementGlyph el={f.element} className="glyph" />
    </div>
  );
}
