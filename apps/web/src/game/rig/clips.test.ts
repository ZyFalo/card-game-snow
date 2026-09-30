import { ELEMENTS, ENEMY_KINDS } from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { artEntries } from '../../art';
import { golemRig, ninjaRig, partKey, type RigDef, rigParts } from '../../art/rigs';
import { GOLEM_CLIPS, NINJA_CLIPS } from './clips';
import type { Clip } from './Rig';

function checkRig(rig: RigDef, clips: Record<string, Clip>, textures: Set<string>) {
  const parts = new Set(rigParts(rig));
  // La jerarquía solo nombra piezas que existen y cada pieza aparece una vez.
  const seen: string[] = [];
  for (const [owner, kids] of Object.entries(rig.children)) {
    if (owner !== 'root') expect(parts.has(owner), `${rig.id}: ${owner}`).toBe(true);
    for (const k of kids) if (k !== 'self') seen.push(k);
  }
  expect([...seen].sort()).toEqual([...parts].sort());
  for (const part of parts) expect(textures.has(partKey(rig, part)), `${rig.id}: textura ${part}`).toBe(true);
  for (const [name, clip] of Object.entries(clips)) {
    expect(clip.frames.length, `${rig.id}.${name}`).toBeGreaterThan(0);
    if (clip.loop)
      expect(
        clip.frames.some((f) => f.ms > 0),
        `${rig.id}.${name} en bucle sin duración`,
      ).toBe(true);
    for (const f of clip.frames) {
      for (const key of Object.keys(f.pose)) {
        // Una pose puede mencionar piezas que este esqueleto no tiene (clips compartidos), pero no nombres inventados.
        expect(
          key === 'root' ||
            ['tails', 'armBack', 'legBack', 'legFront', 'torso', 'head', 'armFront', 'weapon', 'pack'].includes(key),
          `${rig.id}.${name}: ${key}`,
        ).toBe(true);
      }
    }
  }
  expect(
    clips.attack?.frames.some((f) => f.marker === 'release'),
    `${rig.id}: el ataque necesita el marcador release`,
  ).toBe(true);
}

describe('Animación por esqueletos (fase 1)', () => {
  const textures = new Set(artEntries().map((e) => e.key));

  it('los ninjas tienen todos sus estados, marcadores y texturas', () => {
    for (const el of ELEMENTS) {
      const clips = NINJA_CLIPS[el];
      expect(Object.keys(clips).sort()).toEqual(
        ['attack', 'celebrate', 'heal', 'hit', 'idle', 'koStart', 'move', 'power', 'revived', 'reviveOther'].sort(),
      );
      expect(clips.power.frames.some((f) => f.marker === 'release')).toBe(true);
      expect(clips.heal.frames.some((f) => f.marker === 'release')).toBe(true);
      checkRig(ninjaRig(el), clips, textures);
    }
  });

  it('los gólems tienen todos sus estados, marcadores y texturas', () => {
    for (const kind of ENEMY_KINDS) {
      expect(Object.keys(GOLEM_CLIPS[kind]).sort()).toEqual(
        ['attack', 'dazed', 'dazedTurn', 'hit', 'idle', 'move', 'spawn'].sort(),
      );
      checkRig(golemRig(kind), GOLEM_CLIPS[kind], textures);
    }
  });
});
