import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { audio } from './audio/audio';
import { STAGE_H, STAGE_W } from './game/layout';
import { PhaserStage, phaserRef } from './game/PhaserStage';
import { initAccount } from './state/account';
import {
  closeDemo,
  closeHelpDemo,
  confirmTurn,
  cycleNinja,
  learnTip,
  selectCardIndex,
  setBoost,
  setHelp,
  suggest,
  togglePause,
  undo,
} from './state/actions';
import { sceneReady } from './state/bridge';
import { askLeave, resumeIfPlaying } from './state/online';
import { canUndo } from './state/steps';
import { type Screen, store, useApp } from './state/store';
import { momentTip } from './state/tips';
import { AccountScreen } from './ui/Account';
import { BattleHud } from './ui/BattleHud';
import { CardFlights } from './ui/CardFlights';
import { BREAKPOINTS } from './ui/grid';
import { HelpModal, PauseMenu } from './ui/Menus';
import { NotebookScreen } from './ui/Notebook';
import { OnlineDialogs, OnlineScreen } from './ui/Online';
import { OnlineLoading, OnlineResults } from './ui/OnlineMatch';
import { Overlays } from './ui/Overlays';
import { CreditsScreen, LoadingScreen, NoWebGLScreen, ResultsScreen, TeamScreen, TitleScreen } from './ui/Screens';
import { ScreenWipe } from './ui/Transitions';

interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
}

function computeFrame(el: HTMLElement | null): Frame {
  const w = el?.clientWidth ?? window.innerWidth;
  const h = el?.clientHeight ?? window.innerHeight;
  const scale = Math.max(0.1, Math.min(w / STAGE_W, h / STAGE_H));
  const width = Math.round(STAGE_W * scale);
  const height = Math.round(STAGE_H * scale);
  return { left: Math.round((w - width) / 2), top: Math.round((h - height) / 2), width, height, scale };
}

/** El escenario conserva 16:9 y se centra; el resto de la ventana queda como franja. */
function useStageFrame(ref: React.RefObject<HTMLDivElement | null>): Frame {
  const [frame, setFrame] = useState<Frame>(() => computeFrame(null));
  useLayoutEffect(() => {
    const update = () => setFrame(computeFrame(ref.current));
    update();
    const ro = new ResizeObserver(update);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref]);
  useEffect(() => {
    // Phaser mide el canvas con getBoundingClientRect: tras cambiar el marco hay que refrescar.
    const game = phaserRef.game;
    if (!game || frame.width <= 0) return;
    game.scale.getParentBounds();
    game.scale.refresh();
  }, [frame]);
  return frame;
}

/** Desde este ancho de ventana las pantallas van en el escenario de 1280×720, sobre la grilla de 12 columnas. */
const WIDE = BREAKPOINTS[0]?.min ?? 1024;

/**
 * ¿Es angosta la ventana? En ese caso las pantallas adaptables (las del juego en línea fuera del combate, y
 * la Libreta) no van en el escenario a escala, sino a lo ancho de la ventana, con 8 o 4 columnas.
 */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.innerWidth < WIDE);
  useEffect(() => {
    const update = () => setNarrow(window.innerWidth < WIDE);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return narrow;
}

/**
 * El tablero solo se renderiza cuando se ve (carga y combate). En los menús, que lo
 * tapan por completo, el bucle de Phaser duerme: menos CPU, GPU y batería.
 */
function useRenderLoopByScreen(): void {
  useEffect(() => {
    const sync = (screen: Screen) => {
      const game = phaserRef.game;
      if (!game) return;
      // Los resultados en línea van sobre la batalla, que se sigue viendo detrás del pergamino.
      const overBattle = screen === 'results' && store.getState().online.end !== null;
      if (screen === 'battle' || screen === 'loading' || overBattle) game.loop.wake();
      else game.loop.sleep();
    };
    let cancelled = false;
    void sceneReady.then(() => {
      if (!cancelled) sync(store.getState().screen);
    });
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.screen !== prev.screen) sync(s.screen);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
}

function useKeyboard(): void {
  useEffect(() => {
    // Espacio que sigue pulsado desde antes (por ejemplo, acelerando la resolución):
    // no confirma el turno siguiente hasta que se suelte.
    let spaceDown = false;
    const onKey = (ev: KeyboardEvent) => {
      const st = store.getState();
      const k = ev.key.toLowerCase();
      // Pulsación nueva: ni autorrepetición del teclado ni un Espacio que nunca se soltó.
      const fresh = !ev.repeat && !(k === ' ' && spaceDown);
      if (k === ' ') spaceDown = true;
      if (st.helpOpen) {
        if (k === 'escape' && fresh) {
          ev.preventDefault();
          // Con una demostración abierta sobre la ayuda (D-82), Esc cierra primero la demostración.
          if (st.helpDemo) closeHelpDemo();
          else setHelp(false);
        }
        return;
      }
      if (st.screen !== 'battle' || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      // Con "¿Salir de la partida?" a la vista, Esc lo cierra ("Seguir jugando") y las teclas del juego esperan.
      if (st.online.leaving) {
        if (k === 'escape' && fresh) {
          ev.preventDefault();
          askLeave(false);
        }
        if (k === ' ' || k === 'tab') ev.preventDefault();
        return;
      }
      // Con una demostración abierta (D-81), Esc la cierra y las demás teclas del juego esperan: lo que
      // harían quedaría detrás de la burbuja.
      if (st.demo && !st.paused) {
        if (k === 'escape' && fresh) closeDemo();
        if (k === 'escape' || k === ' ' || k === 'enter' || k === 'tab') ev.preventDefault();
        return;
      }
      // Mantener Espacio acelera la resolución, también con la autorrepetición.
      if (st.phase === 'resolving' && !st.paused && k === ' ') {
        ev.preventDefault();
        setBoost(true);
        return;
      }
      // Las demás teclas actúan una vez por pulsación: mantenerlas no confirma ni alterna nada.
      if (!fresh) {
        if (k === ' ' || k === 'enter' || k === 'tab') ev.preventDefault();
        return;
      }
      if (k === 'p') {
        ev.preventDefault();
        // En línea no hay pausa (R-36).
        togglePause();
        return;
      }
      if (st.paused) {
        if (k === 'escape') {
          ev.preventDefault();
          togglePause(false);
        }
        return;
      }
      if (st.phase !== 'planning') return;
      // Con un consejo en pantalla, Enter es su "Entendido" (D-80); sin él, confirma el turno como Espacio.
      const tip = k === 'enter' ? momentTip(st) : null;
      if (tip) {
        ev.preventDefault();
        learnTip(tip.id);
        return;
      }
      if (k === 'tab') {
        ev.preventDefault();
        cycleNinja(ev.shiftKey ? -1 : 1);
      } else if (k === ' ' || k === 'enter') {
        ev.preventDefault();
        void confirmTurn();
      } else if (k === 'escape' || k === 'backspace') {
        ev.preventDefault();
        // Sin un paso que deshacer, Esc abre la pausa. En línea no hay pausa: pregunta si salir (R-39).
        if (canUndo(st)) undo();
        else if (st.local) togglePause(true);
        else if (k === 'escape') askLeave(true);
      } else if (k === 's') {
        suggest();
      } else if (k >= '1' && k <= '4') {
        selectCardIndex(Number(k) - 1);
      }
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.key !== ' ') return;
      spaceDown = false;
      setBoost(false);
    };
    const onBlur = () => {
      spaceDown = false;
      setBoost(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
}

export function App() {
  const viewport = useRef<HTMLDivElement>(null);
  const frame = useStageFrame(viewport);
  const screen = useApp((s) => s.screen);
  const paused = useApp((s) => s.paused);
  const helpOpen = useApp((s) => s.helpOpen);
  const reduced = useApp((s) => s.settings.reducedMotion);
  const webglMissing = useApp((s) => s.webglMissing);
  const online = useApp((s) => !s.local && s.online.match !== null);
  const onlineEnd = useApp((s) => s.online.end !== null);
  const narrow = useNarrow();
  useKeyboard();
  useRenderLoopByScreen();

  // ¿Hay servidor y sesión? Sin servidor (build de un solo archivo) se juega sin cuenta. Con sesión, quien
  // se había desconectado de una partida en línea vuelve derecho a ella (R-38).
  useEffect(() => {
    void initAccount().then(resumeIfPlaying);
  }, []);

  useEffect(() => {
    const { settings } = store.getState();
    audio.setSfx(settings.sfx);
    audio.setMusic(settings.music);
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // Si la pestaña se oculta en pleno combate, se pausa: el reloj no corre sin ti.
    const onVisibility = () => {
      if (document.hidden) togglePause(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div ref={viewport} className="viewport">
      <div
        className="stage-frame"
        style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
      >
        <PhaserStage />
        <div className={`stage ${reduced ? 'reduced' : ''}`} style={{ transform: `scale(${frame.scale})` }}>
          {screen === 'battle' ? <BattleHud /> : null}
          <CardFlights />
          <Overlays />
          {screen === 'title' ? <TitleScreen /> : null}
          {screen === 'team' ? <TeamScreen /> : null}
          {screen === 'loading' ? online ? <OnlineLoading /> : <LoadingScreen /> : null}
          {screen === 'results' && !onlineEnd ? <ResultsScreen /> : null}
          {screen === 'results' && onlineEnd && !narrow ? (
            <div className="online-root">
              <OnlineResults />
            </div>
          ) : null}
          {screen === 'account' ? <AccountScreen /> : null}
          {screen === 'credits' ? <CreditsScreen /> : null}
          {screen === 'online' && !narrow ? <OnlineScreen /> : null}
          {screen === 'notebook' && !narrow ? <NotebookScreen /> : null}
          {/* En el combate, los avisos de la conexión van sobre el tablero. */}
          {online && screen !== 'online' && screen !== 'results' ? <OnlineDialogs /> : null}
          <ScreenWipe />
          {webglMissing ? <NoWebGLScreen /> : null}
          {paused && screen === 'battle' ? <PauseMenu /> : null}
          {helpOpen ? <HelpModal /> : null}
        </div>
      </div>
      {/* La capa adaptable: en ventanas angostas, las pantallas en línea fuera del combate van a lo ancho. */}
      {narrow && (screen === 'online' || screen === 'notebook' || (screen === 'results' && onlineEnd)) ? (
        <div className={`fluid ${reduced ? 'reduced' : ''}`} data-fluid={screen}>
          {screen === 'online' ? <OnlineScreen /> : null}
          {screen === 'notebook' ? <NotebookScreen /> : null}
          {screen === 'results' ? (
            <div className="online-root">
              <OnlineResults />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
