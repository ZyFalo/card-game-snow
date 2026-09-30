import { art } from '../art';
import { BONUS_TEXT, COMBO_EFFECT, ES, NINJA_TEXT, OVERLAY_TEXT } from '../i18n/es';
import { type Overlay, useApp } from '../state/store';

function RoundBanner({ o }: { o: Extract<NonNullable<Overlay>, { kind: 'round' }> }) {
  const steps: (1 | 2 | 3 | 'bonus')[] = [1, 2, 3, 'bonus'];
  const idx = steps.indexOf(o.round);
  let detail: string;
  if (o.round === 'bonus') detail = OVERLAY_TEXT.bonusRound;
  else if (o.round === 1) detail = BONUS_TEXT[o.condition](o.turnLimit);
  else if (o.condition === 'turnLimit') detail = ES.turnLimitProgress(o.turn, o.turnLimit);
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
        <h2 className="display">{o.met ? OVERLAY_TEXT.bonusMet : OVERLAY_TEXT.bonusMissed}</h2>
        <p>{o.met ? OVERLAY_TEXT.bonusMetDetail : OVERLAY_TEXT.bonusMissedDetail}</p>
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
