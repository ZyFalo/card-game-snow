import { BALANCE, createMatch, type Enemy, type EnemyKind, type MatchState, type Ninja, type Plan } from '../src';

/** Estado controlado para pruebas: sin rocas, sin enemigos y con los ninjas en la columna 0. */
export function blank(opts: { bonus?: MatchState['bonusCondition']; rocks?: boolean } = {}): MatchState {
  const { state } = createMatch({ seed: 1234, mapId: 'cumbre', bonusCondition: opts.bonus ?? 'noKo' });
  state.enemies = [];
  if (!opts.rocks) state.rocks = [];
  place(state, 'fire', 0, 0);
  place(state, 'water', 0, 2);
  place(state, 'snow', 0, 4);
  return state;
}

export function ninja(s: MatchState, id: Ninja['id']): Ninja {
  const n = s.ninjas.find((x) => x.id === id);
  if (!n) throw new Error(id);
  return n;
}

export function place(s: MatchState, id: Ninja['id'], x: number, y: number, patch: Partial<Ninja> = {}): Ninja {
  const n = ninja(s, id);
  n.pos = { x, y };
  Object.assign(n, patch);
  return n;
}

export function addEnemy(s: MatchState, kind: EnemyKind, x: number, y: number, patch: Partial<Enemy> = {}): Enemy {
  const st = BALANCE.enemies[kind];
  const e: Enemy = {
    id: `t${s.nextEnemySeq++}`,
    kind,
    pos: { x, y },
    hp: st.hp,
    maxHp: st.hp,
    stunned: false,
    burnTicks: 0,
    ...patch,
  };
  s.enemies.push(e);
  return e;
}

export const idle = (): Plan[] => [];
