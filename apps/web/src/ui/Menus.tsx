import { BALANCE, ELEMENTS, ENEMY_KINDS } from '@ventisca/core';
import { Fragment, useEffect, useRef, useState } from 'react';
import { art } from '../art';
import { ENEMY_TEXT, ES, HELP, NINJA_TEXT } from '../i18n/es';
import { quitToMenu, replayJson, restartMatch, setHelp, togglePause, updateSettings } from '../state/actions';
import { store, useApp } from '../state/store';
import { Icon, Modal, Toggle } from './common';

export function PauseMenu() {
  const settings = useApp((s) => s.settings);
  const seed = useApp((s) => s.seed);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [fallback, setFallback] = useState<string | null>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
  // Al abrir la pausa, el foco va a "Continuar" (accesible con teclado).
  useEffect(() => resumeRef.current?.focus(), []);

  const copy = async () => {
    const json = replayJson();
    try {
      await navigator.clipboard.writeText(json);
      setCopyState('ok');
    } catch {
      setCopyState('fail');
      setFallback(json);
    }
  };

  return (
    <Modal label={ES.pause} onClose={() => togglePause(false)}>
      <h2 className="display">{ES.pause}</h2>
      <div className="pause-grid">
        <div className="pause-actions">
          <button ref={resumeRef} type="button" className="btn btn-primary" onClick={() => togglePause(false)}>
            <Icon name="play" /> {ES.resume}
          </button>
          <button type="button" className="btn" onClick={restartMatch}>
            <Icon name="restart" /> {ES.restart}
          </button>
          <button type="button" className="btn" onClick={() => setHelp(true)}>
            <Icon name="help" /> {ES.howToPlay}
          </button>
          <button type="button" className="btn" onClick={quitToMenu}>
            <Icon name="home" /> {ES.quit}
          </button>
        </div>
        <div>
          <h3 className="opt-title">{ES.settings}</h3>
          <Toggle label={ES.sound} checked={settings.sfx} onChange={(sfx) => updateSettings({ sfx })} />
          <Toggle label={ES.music} checked={settings.music} onChange={(music) => updateSettings({ music })} />
          <Toggle
            label={ES.reducedMotion}
            checked={settings.reducedMotion}
            onChange={(reducedMotion) => updateSettings({ reducedMotion })}
          />
          <Toggle label={ES.tipsMode} checked={settings.tips} onChange={(tips) => updateSettings({ tips })} />
          <Toggle
            label={ES.autoAdvance}
            checked={settings.autoAdvance}
            onChange={(autoAdvance) => updateSettings({ autoAdvance })}
          />
          <Toggle
            label={ES.fastAnimations}
            checked={settings.fastAnimations}
            onChange={(fastAnimations) => updateSettings({ fastAnimations })}
          />
          <div className="pause-seed">
            {ES.seed}: {seed}
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn" onClick={() => void copy()}>
                <Icon name="copy" /> {copyState === 'ok' ? ES.copied : ES.copyReplay}
              </button>
            </div>
            {copyState === 'fail' && fallback ? (
              <>
                <div style={{ marginTop: 6 }}>{ES.copyFailed}</div>
                <textarea
                  readOnly
                  value={fallback}
                  style={{ width: '100%', height: 70, marginTop: 6, font: '12px monospace', userSelect: 'text' }}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function HelpModal() {
  const close = () => setHelp(false);
  const inBattle = store.getState().screen === 'battle';
  return (
    <Modal label={ES.howToPlay} className="help" onClose={close}>
      <h2 className="display">{ES.howToPlay}</h2>
      <p>{HELP.intro}</p>

      <h3>{HELP.turnTitle}</h3>
      <ul>
        {HELP.turn.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <h3>{HELP.teamTitle}</h3>
      <div className="help-cols">
        {ELEMENTS.map((el) => {
          const st = BALANCE.ninjas[el];
          return (
            <div key={el} className="help-unit">
              <img src={art.bust(el)} alt="" />
              <div>
                <b>
                  {NINJA_TEXT[el].name} · {NINJA_TEXT[el].element}
                </b>
                {HELP.ninjaStats(st.hp, st.attack, st.range, st.move)} {NINJA_TEXT[el].card}
              </div>
            </div>
          );
        })}
      </div>

      <h3>{HELP.golemsTitle}</h3>
      <div className="help-cols">
        {ENEMY_KINDS.map((k) => {
          const st = BALANCE.enemies[k];
          return (
            <div key={k} className="help-unit">
              <img src={art.golem(k)} alt="" />
              <div>
                <b>
                  {ENEMY_TEXT[k].name} · {ENEMY_TEXT[k].role}
                </b>
                {HELP.golemStats(st.hp, st.range, st.move)} {ENEMY_TEXT[k].tip}
              </div>
            </div>
          );
        })}
      </div>

      <h3>{HELP.cardsTitle}</h3>
      <ul>
        {HELP.cards.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <h3>{HELP.koTitle}</h3>
      <ul>
        {HELP.ko.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <h3>{HELP.keysTitle}</h3>
      <div className="keys">
        {HELP.keys.map(([key, what]) => (
          <Fragment key={key}>
            <span className="kbd">{key}</span>
            <span>{what}</span>
          </Fragment>
        ))}
      </div>
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-primary" onClick={close}>
          {inBattle ? HELP.backToPause : ES.close}
        </button>
      </div>
    </Modal>
  );
}
