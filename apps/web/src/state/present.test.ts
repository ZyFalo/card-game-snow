import { createMatch, planTeam, resolveTurn } from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { applyEvent, beforeIntro } from './present';

/* El estado presentado, tras aplicar todos los eventos, debe coincidir con el autoritativo. */
const essentials = (s: ReturnType<typeof createMatch>['state']) => ({
  round: s.round,
  status: s.status,
  ninjas: s.ninjas.map((n) => ({
    id: n.id,
    pos: n.pos,
    hp: n.hp,
    meter: n.meter,
    hand: n.hand,
    shield: n.shield,
    boost: n.boost,
  })),
  enemies: s.enemies.map((e) => ({ id: e.id, pos: e.pos, hp: e.hp, stunned: e.stunned, burning: e.burnTicks > 0 })),
});

describe('Estado presentado', () => {
  it('reproduce el estado autoritativo evento por evento', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const created = createMatch({ seed, difficulty: seed % 2 ? 'classic' : 'storm' });
      let view = beforeIntro(created.state);
      for (const e of created.events) view = applyEvent(view, e);
      expect(essentials(view)).toEqual(essentials(created.state));
      let state = created.state;
      for (let turn = 0; turn < 40 && state.status === 'playing'; turn++) {
        const r = resolveTurn(state, planTeam(state));
        for (const e of r.events) view = applyEvent(view, e);
        expect(essentials(view)).toEqual(essentials(r.state));
        state = r.state;
        view = r.state;
      }
    }
  });
});
