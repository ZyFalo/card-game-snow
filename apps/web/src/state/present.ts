import { BALANCE, type GameEvent, type MatchState } from '@ventisca/core';

/**
 * Estado presentado (§11.3): aplica un evento al estado que se está mostrando.
 * Así el HUD y las barras de vida cambian al ritmo de la animación y no saltan
 * directamente al resultado final del turno.
 */
export function applyEvent(prev: MatchState, e: GameEvent): MatchState {
  const v = structuredClone(prev);
  const ninja = (id: string) => v.ninjas.find((n) => n.id === id);
  const enemy = (id: string) => v.enemies.find((x) => x.id === id);
  switch (e.t) {
    case 'turnStart':
      v.turn = e.turn - 1;
      break;
    case 'move': {
      const last = e.path[e.path.length - 1];
      const unit = ninja(e.unitId) ?? enemy(e.unitId);
      if (unit && last) unit.pos = { x: last.x, y: last.y };
      break;
    }
    case 'damage':
    case 'heal':
    case 'revive': {
      const unit = ninja(e.targetId) ?? enemy(e.targetId);
      if (unit) unit.hp = e.hp;
      break;
    }
    case 'ko':
      if (enemy(e.unitId)) v.enemies = v.enemies.filter((x) => x.id !== e.unitId);
      else {
        const n = ninja(e.unitId);
        if (n) {
          n.hp = 0;
          n.everKo = true;
        }
      }
      break;
    case 'meter': {
      const n = ninja(e.ninjaId);
      if (n) n.meter = e.value;
      break;
    }
    case 'draw': {
      const n = ninja(e.ninjaId);
      if (n) {
        n.hand.push(structuredClone(e.card));
        n.deck = n.deck.filter((c) => c.id !== e.card.id);
      }
      break;
    }
    case 'card': {
      const n = ninja(e.ninjaId);
      if (n) n.hand = n.hand.filter((c) => c.id !== e.card.id);
      break;
    }
    case 'status': {
      const n = ninja(e.unitId);
      const x = enemy(e.unitId);
      if (n && e.status === 'shield') n.shield = e.on;
      if (n && e.status === 'boost') n.boost = e.on;
      if (x && e.status === 'stun') x.stunned = e.on;
      if (x && e.status === 'burn') x.burnTicks = e.on ? BALANCE.burn.ticks : 0;
      break;
    }
    case 'roundStart':
      v.round = e.round;
      for (const x of e.enemies) if (!enemy(x.id)) v.enemies.push(structuredClone(x));
      break;
    case 'matchEnd':
      v.status = e.status;
      v.bonusOutcome = e.bonusOutcome;
      break;
    default:
      break;
  }
  return v;
}

/** Estado presentado antes de los eventos iniciales de la partida (aún sin enemigos). */
export function beforeIntro(state: MatchState): MatchState {
  const v = structuredClone(state);
  v.enemies = [];
  return v;
}
