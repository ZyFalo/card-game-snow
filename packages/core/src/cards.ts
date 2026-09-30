import { BALANCE, ELEMENTS } from './balance';
import type { ElementKind } from './types';

/*
 * Banco de cartas (§18, R-25 y R-27): 20 cartas distintas por elemento, con
 * nombres propios. Los valores vienen de balance.json (de menor a mayor).
 * Todas las cartas de un elemento hacen lo mismo; solo cambia el número (D-19).
 */

export interface BankCard {
  id: string;
  element: ElementKind;
  value: number;
  name: string;
}

const NAMES: Record<ElementKind, readonly string[]> = {
  fire: [
    'Chispa',
    'Pavesa',
    'Rescoldo',
    'Ascua',
    'Tizón',
    'Candil',
    'Farolillo',
    'Linterna',
    'Fogata',
    'Hoguera',
    'Antorcha',
    'Llamarada',
    'Farol de papel',
    'Fuego fatuo',
    'Estrella fugaz',
    'Sol poniente',
    'Cometa roja',
    'Fénix plegado',
    'Corona de llamas',
    'Sol naciente',
  ],
  water: [
    'Gota',
    'Rocío',
    'Llovizna',
    'Charco',
    'Arroyo',
    'Manantial',
    'Bruma',
    'Oleaje',
    'Bajamar',
    'Cascada',
    'Remolino',
    'Corriente',
    'Aguacero',
    'Tromba',
    'Pleamar',
    'Diluvio',
    'Barco de papel',
    'Ola plegada',
    'Abismo azul',
    'Luna de las mareas',
  ],
  snow: [
    'Copo',
    'Nevisca',
    'Cristalito',
    'Rocío helado',
    'Aguanieve',
    'Polvo de nieve',
    'Brisa fría',
    'Nevada',
    'Viento del norte',
    'Estrella de hielo',
    'Grulla de nieve',
    'Alud menor',
    'Luna fría',
    'Aurora',
    'Glaciar',
    'Avalancha',
    'Tormenta blanca',
    'Copo milenario',
    'Invierno eterno',
    'Luna helada',
  ],
};

const pad = (n: number): string => String(n).padStart(2, '0');

export const BANK: readonly BankCard[] = ELEMENTS.flatMap((element) =>
  BALANCE.bank.valuesPerElement.map((value, i) => ({
    id: `${element}-${pad(i + 1)}`,
    element,
    value,
    name: NAMES[element][i] ?? `${element} ${i + 1}`,
  })),
);

const BY_ID = new Map(BANK.map((c) => [c.id, c]));

export const bankCard = (id: string): BankCard | undefined => BY_ID.get(id);
export const bankFor = (element: ElementKind): BankCard[] => BANK.filter((c) => c.element === element);

/** Carta de camino (R-30): la primera carta de 12 de cada elemento. */
export const CAMINO_CARDS: Record<ElementKind, string> = Object.fromEntries(
  ELEMENTS.map((el) => [el, bankFor(el).find((c) => c.value === 12)?.id ?? `${el}-18`]),
) as Record<ElementKind, string>;

/** Carta inicial de cada elemento (R-30): la primera de la categoría más baja. */
export const STARTER_CARDS: Record<ElementKind, string> = Object.fromEntries(
  ELEMENTS.map((el) => [el, bankFor(el).find((c) => c.value === BALANCE.starter.value)?.id ?? `${el}-01`]),
) as Record<ElementKind, string>;
