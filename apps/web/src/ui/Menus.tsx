import { BALANCE, ELEMENTS, ENEMY_KINDS } from '@ventisca/core';
import { useEffect, useRef, useState } from 'react';
import { art } from '../art';
import { ENEMY_TEXT, ES, NINJA_TEXT } from '../i18n/es';
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
            label="Pasar al siguiente ninja"
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
      <p>
        Tres aprendices de papel contra gólems de escarcha en un tablero de 9×5. Supera tres rondas y, si cumples la
        condición de bonus, una cuarta. Pierdes si caen los tres a la vez.
      </p>

      <h3>Cada turno</h3>
      <ul>
        <li>Planea a cada ninja: primero a dónde se mueve (casillas azules) y luego qué hace.</li>
        <li>
          Haz clic en un gólem para atacarlo, en un aliado para curarlo (Escarcha) o revivirlo, o elige una carta y su
          casilla central.
        </li>
        <li>
          Confirma el turno. Se resuelve en orden: Brasa, Marea y Escarcha; después actúan los gólems, que siempre
          atacan si pueden.
        </li>
        <li>El reloj da 10 segundos por ninja. Si se acaba, se juega lo que hayas planeado.</li>
      </ul>

      <h3>Tu equipo</h3>
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
                Vida {st.hp}, daño {st.attack}, alcance {st.range}, paso {st.move}. {NINJA_TEXT[el].card}
              </div>
            </div>
          );
        })}
      </div>

      <h3>Los gólems</h3>
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
                Vida {st.hp}, alcance {st.range}, paso {st.move}. {ENEMY_TEXT[k].tip}
              </div>
            </div>
          );
        })}
      </div>

      <h3>Cartas y combos</h3>
      <ul>
        <li>El medidor sube con cada movimiento, acción o golpe recibido. Al llenarse, ganas una carta (máximo 4).</li>
        <li>Las cartas afectan un área de 3×3 y se colocan dentro del alcance de movimiento del ninja.</li>
        <li>
          Si dos o tres ninjas juegan carta el mismo turno, hay combo: Fuego quema, Agua da Potencia y Nieve da Escudo.
        </li>
      </ul>

      <h3>Caer y revivir</h3>
      <ul>
        <li>Un ninja caído no actúa, pero puede ser revivido desde una casilla vecina (también en diagonal).</li>
        <li>
          Revivir ocupa la acción. El caído se levanta al instante con 1 de vida, antes de que actúen los gólems: si lo
          alcanzan, puede volver a caer ese mismo turno.
        </li>
      </ul>

      <h3>Monedas, cajas y colección</h3>
      <ul>
        <li>
          Cada ronda superada paga monedas: 60, 120 y 120, más 120 si ganas el bonus. Se cobran aunque después pierdas.
          Con los 9 logros, las monedas se duplican.
        </li>
        <li>
          Con monedas compras cajas de 1, 2 o 3 cartas del elemento que elijas. Los números altos son menos comunes.
        </li>
        <li>
          Tu reserva en cada partida es toda tu colección de ese elemento, con repetidas: al llenarse el medidor sale
          una al azar. Más cartas, más combos.
        </li>
      </ul>

      <h3>Controles</h3>
      <div className="keys">
        <span className="kbd">Clic</span>
        <span>Seleccionar ninja, casilla u objetivo</span>
        <span className="kbd">Clic derecho · Esc</span>
        <span>Deshacer el último paso del plan</span>
        <span className="kbd">Tab</span>
        <span>Siguiente ninja (Shift + Tab: anterior)</span>
        <span className="kbd">1 a 4</span>
        <span>Elegir carta</span>
        <span className="kbd">Espacio</span>
        <span>Confirmar turno</span>
        <span className="kbd">S</span>
        <span>Sugerir jugada para el ninja activo</span>
        <span className="kbd">Mantén Espacio</span>
        <span>Acelerar la resolución del turno</span>
        <span className="kbd">P</span>
        <span>Pausa</span>
      </div>
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-primary" onClick={close}>
          {inBattle ? 'Volver a la pausa' : ES.close}
        </button>
      </div>
    </Modal>
  );
}
