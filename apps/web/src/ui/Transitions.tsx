import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';

/** Al cambiar de pantalla, una hoja de papel barre el escenario y deja ver la nueva (fase 4). */
export function ScreenWipe() {
  const screen = useApp((s) => s.screen);
  const reduced = useApp((s) => s.settings.reducedMotion);
  const [wipe, setWipe] = useState(0);
  const prev = useRef(screen);
  useEffect(() => {
    if (prev.current === screen) return;
    prev.current = screen;
    if (!reduced) setWipe((w) => w + 1);
  }, [screen, reduced]);
  if (wipe === 0) return null;
  return (
    <div key={wipe} className="wipe" aria-hidden="true">
      <i className="edge" />
      <i className="sheet" />
    </div>
  );
}
