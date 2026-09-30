import type { ElementKind } from '@ventisca/core';
import { art } from '../art';
import { BONUS_TEXT, ES, NINJA_TEXT } from '../i18n/es';
import { type Overlay, useApp } from '../state/store';

const COMBO_EFFECT: Record<ElementKind, string> = {
  fire: 'Quemadura: 3 de daño por turno durante 3 turnos',
  water: 'Potencia para todo el equipo',
  snow: 'Escudo para todo el equipo',
};

function RoundBanner({ o }: { o: Extract<NonNullable<Overlay>, { kind: 'round' }> }) {
  const steps: (1 | 2 | 3 | 'bonus')[] = [1, 2, 3, 'bonus'];
  const idx = steps.indexOf(o.round);
  let detail: string;
  if (o.round === 'bonus') detail = 'Última oleada. Pase lo que pase, la victoria ya es suya.';
  else if (o.round === 1) detail = BONUS_TEXT[o.condition](o.turnLimit);
  else if (o.condition === 'turnLimit') detail = `Van ${o.turn} turnos. El bonus pide ${o.turnLimit} o menos.`;
  else detail = BONUS_TEXT[o.condition](o.turnLimit);
  return (
    <div className="overlay">
      <div className="banner paper" role="status" style={{ animationDuration: `${o.ms}ms` }}>
        <h2 className="display">{ES.roundBanner(o.round)}</h2>
        <div className="pips" aria-hidden="true">
          {steps.map((st, i) => (
            <i key={String(st)} className={i < idx ? 'done' : i === idx ? 'now' : ''}>
              {st === 'bonus' ? 'B' : st}
            </i>
          ))}
        </div>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function ComboCinematic({ o }: { o: Extract<NonNullable<Overlay>, { kind: 'combo' }> }) {
  return (
    <div className="combo" role="status" aria-label={ES.combo} style={{ animationDuration: `${o.ms}ms` }}>
      <div className="combo-panels">
        {o.elements.map((el, i) => (
          <div key={el} className={`combo-panel el-${el}`} style={{ animationDelay: `${i * 0.14}s` }}>
            <img src={art.bust(el)} alt="" />
            <b>{NINJA_TEXT[el].name}</b>
            <span>{COMBO_EFFECT[el]}</span>
          </div>
        ))}
      </div>
      <div className="combo-word display">{ES.combo}</div>
    </div>
  );
}

function BonusBanner({ o }: { o: Extract<NonNullable<Overlay>, { kind: 'bonus' }> }) {
  return (
    <div className="overlay">
      <div className="banner paper" role="status" style={{ animationDuration: `${o.ms}ms` }}>
        <h2 className="display">{o.met ? '¡Bonus desbloqueado!' : 'Sin ronda bonus'}</h2>
        <p>{o.met ? 'Llega una última oleada de gólems.' : 'No se cumplió la condición. Será para la próxima.'}</p>
      </div>
    </div>
  );
}

export function Overlays() {
  const overlay = useApp((s) => s.overlay);
  if (!overlay) return null;
  switch (overlay.kind) {
    case 'round':
      return <RoundBanner key={overlay.key} o={overlay} />;
    case 'combo':
      return <ComboCinematic key={overlay.key} o={overlay} />;
    case 'bonus':
      return <BonusBanner key={overlay.key} o={overlay} />;
  }
}
