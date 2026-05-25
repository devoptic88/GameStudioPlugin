export type CardArchetype = 'vanguard' | 'ranger' | 'brute' | 'spark';
export type MovementType = 'ground' | 'flying';

export interface CardDefinition {
  id: string;
  name: string;
  role: string;
  cost: number;
  hp: number;
  damage: number;
  range: number;
  speed: number;
  cooldown: number;
  spriteSize: number;
  movement: MovementType;
  archetype: CardArchetype;
  tint: number;
  description: string;
}

const CARD_ART = import.meta.glob<string>('../assets/cards/*.png', { eager: true, query: '?url', import: 'default' });

export const CARD_CATALOG = [
  {
    id: 'vanguard',
    name: 'Vanguard',
    role: 'Guard',
    cost: 3,
    hp: 130,
    damage: 18,
    range: 28,
    speed: 58,
    cooldown: 850,
    spriteSize: 92,
    movement: 'ground',
    archetype: 'vanguard',
    tint: 0xffffff,
    description: 'Balanced shield fighter for steady bridge pressure.',
  },
  {
    id: 'ranger',
    name: 'Ranger',
    role: 'Marksman',
    cost: 4,
    hp: 80,
    damage: 15,
    range: 150,
    speed: 50,
    cooldown: 700,
    spriteSize: 86,
    movement: 'ground',
    archetype: 'ranger',
    tint: 0xffffff,
    description: 'Ranged scout that chips safely from behind allies.',
  },
  {
    id: 'brute',
    name: 'Brute',
    role: 'Tank',
    cost: 5,
    hp: 230,
    damage: 32,
    range: 32,
    speed: 38,
    cooldown: 1100,
    spriteSize: 108,
    movement: 'ground',
    archetype: 'brute',
    tint: 0xffffff,
    description: 'Slow hammer unit with heavy tower damage.',
  },
  {
    id: 'spark',
    name: 'Spark',
    role: 'Flying Mage',
    cost: 2,
    hp: 58,
    damage: 20,
    range: 95,
    speed: 85,
    cooldown: 780,
    spriteSize: 88,
    movement: 'flying',
    archetype: 'spark',
    tint: 0xffffff,
    description: 'Flying caster that crosses the river directly.',
  },
  {
    id: 'iron-sentinel',
    name: 'Iron Sentinel',
    role: 'Guard',
    cost: 4,
    hp: 170,
    damage: 20,
    range: 30,
    speed: 46,
    cooldown: 900,
    spriteSize: 96,
    movement: 'ground',
    archetype: 'vanguard',
    tint: 0xc9d8ff,
    description: 'Armored lane holder with extra staying power.',
  },
  {
    id: 'swiftblade',
    name: 'Swiftblade',
    role: 'Striker',
    cost: 2,
    hp: 86,
    damage: 15,
    range: 26,
    speed: 92,
    cooldown: 620,
    spriteSize: 84,
    movement: 'ground',
    archetype: 'vanguard',
    tint: 0xb9fff2,
    description: 'Fast melee unit for quick bridge pressure.',
  },
  {
    id: 'banner-guard',
    name: 'Banner Guard',
    role: 'Support Guard',
    cost: 3,
    hp: 118,
    damage: 13,
    range: 34,
    speed: 54,
    cooldown: 680,
    spriteSize: 90,
    movement: 'ground',
    archetype: 'vanguard',
    tint: 0xffe3a3,
    description: 'Cheap guard with reliable attack speed.',
  },
  {
    id: 'frost-warden',
    name: 'Frost Warden',
    role: 'Guard',
    cost: 4,
    hp: 145,
    damage: 24,
    range: 35,
    speed: 44,
    cooldown: 1000,
    spriteSize: 94,
    movement: 'ground',
    archetype: 'vanguard',
    tint: 0xabe7ff,
    description: 'Tough defender with a heavy single strike.',
  },
  {
    id: 'duelist',
    name: 'Duelist',
    role: 'Striker',
    cost: 3,
    hp: 96,
    damage: 26,
    range: 28,
    speed: 76,
    cooldown: 760,
    spriteSize: 86,
    movement: 'ground',
    archetype: 'vanguard',
    tint: 0xffd0d0,
    description: 'Quick melee attacker with sharp burst damage.',
  },
  {
    id: 'longbow',
    name: 'Longbow',
    role: 'Marksman',
    cost: 5,
    hp: 72,
    damage: 22,
    range: 190,
    speed: 42,
    cooldown: 900,
    spriteSize: 86,
    movement: 'ground',
    archetype: 'ranger',
    tint: 0xd8f0ff,
    description: 'Very long range tower chipper.',
  },
  {
    id: 'pathfinder',
    name: 'Pathfinder',
    role: 'Scout',
    cost: 3,
    hp: 74,
    damage: 13,
    range: 130,
    speed: 72,
    cooldown: 620,
    spriteSize: 80,
    movement: 'ground',
    archetype: 'ranger',
    tint: 0xcaffb7,
    description: 'Mobile ranged unit that rotates quickly.',
  },
  {
    id: 'ember-archer',
    name: 'Ember Archer',
    role: 'Marksman',
    cost: 4,
    hp: 76,
    damage: 24,
    range: 142,
    speed: 48,
    cooldown: 980,
    spriteSize: 84,
    movement: 'ground',
    archetype: 'ranger',
    tint: 0xffb174,
    description: 'Slow firing archer with high impact shots.',
  },
  {
    id: 'shade-runner',
    name: 'Shade Runner',
    role: 'Scout',
    cost: 2,
    hp: 52,
    damage: 10,
    range: 112,
    speed: 98,
    cooldown: 520,
    spriteSize: 76,
    movement: 'ground',
    archetype: 'ranger',
    tint: 0xb8b1ff,
    description: 'Fragile but extremely fast ranged pressure.',
  },
  {
    id: 'storm-bow',
    name: 'Storm Bow',
    role: 'Marksman',
    cost: 5,
    hp: 88,
    damage: 17,
    range: 165,
    speed: 54,
    cooldown: 520,
    spriteSize: 88,
    movement: 'ground',
    archetype: 'ranger',
    tint: 0xa6f5ff,
    description: 'Rapid ranged attacker with steady damage.',
  },
  {
    id: 'stonebreaker',
    name: 'Stonebreaker',
    role: 'Tank',
    cost: 6,
    hp: 310,
    damage: 42,
    range: 34,
    speed: 30,
    cooldown: 1250,
    spriteSize: 116,
    movement: 'ground',
    archetype: 'brute',
    tint: 0xd8d2c4,
    description: 'Massive siege unit built to crush towers.',
  },
  {
    id: 'moss-mauler',
    name: 'Moss Mauler',
    role: 'Tank',
    cost: 4,
    hp: 195,
    damage: 26,
    range: 34,
    speed: 42,
    cooldown: 980,
    spriteSize: 104,
    movement: 'ground',
    archetype: 'brute',
    tint: 0xb9ff9e,
    description: 'Mid-cost bruiser for stubborn lane pushes.',
  },
  {
    id: 'anvil-bearer',
    name: 'Anvil Bearer',
    role: 'Bruiser',
    cost: 5,
    hp: 250,
    damage: 21,
    range: 34,
    speed: 34,
    cooldown: 650,
    spriteSize: 108,
    movement: 'ground',
    archetype: 'brute',
    tint: 0xc7c7ff,
    description: 'Heavy body with surprisingly quick swings.',
  },
  {
    id: 'rage-hammer',
    name: 'Rage Hammer',
    role: 'Bruiser',
    cost: 5,
    hp: 205,
    damage: 45,
    range: 35,
    speed: 46,
    cooldown: 1320,
    spriteSize: 106,
    movement: 'ground',
    archetype: 'brute',
    tint: 0xff9a8f,
    description: 'Risky bruiser with huge hit damage.',
  },
  {
    id: 'gate-crasher',
    name: 'Gate Crasher',
    role: 'Siege',
    cost: 7,
    hp: 360,
    damage: 52,
    range: 36,
    speed: 28,
    cooldown: 1500,
    spriteSize: 120,
    movement: 'ground',
    archetype: 'brute',
    tint: 0xffd38a,
    description: 'Very slow win condition for tower takedowns.',
  },
  {
    id: 'storm-wisp',
    name: 'Storm Wisp',
    role: 'Flying Mage',
    cost: 3,
    hp: 64,
    damage: 17,
    range: 120,
    speed: 92,
    cooldown: 620,
    spriteSize: 82,
    movement: 'flying',
    archetype: 'spark',
    tint: 0xaeefff,
    description: 'Fast flying caster with steady ranged damage.',
  },
  {
    id: 'void-oracle',
    name: 'Void Oracle',
    role: 'Flying Mage',
    cost: 5,
    hp: 92,
    damage: 34,
    range: 132,
    speed: 62,
    cooldown: 1150,
    spriteSize: 94,
    movement: 'flying',
    archetype: 'spark',
    tint: 0xd1a4ff,
    description: 'Slow flying spellcaster with heavy bolts.',
  },
  {
    id: 'crackle-imp',
    name: 'Crackle Imp',
    role: 'Flying Swarm',
    cost: 2,
    hp: 42,
    damage: 12,
    range: 86,
    speed: 112,
    cooldown: 460,
    spriteSize: 70,
    movement: 'flying',
    archetype: 'spark',
    tint: 0xfff0a8,
    description: 'Tiny flier that races over the river.',
  },
  {
    id: 'moon-sage',
    name: 'Moon Sage',
    role: 'Flying Mage',
    cost: 4,
    hp: 78,
    damage: 21,
    range: 150,
    speed: 68,
    cooldown: 760,
    spriteSize: 88,
    movement: 'flying',
    archetype: 'spark',
    tint: 0xbec7ff,
    description: 'Long range flier for controlled pressure.',
  },
  {
    id: 'sun-channeler',
    name: 'Sun Channeler',
    role: 'Flying Mage',
    cost: 6,
    hp: 118,
    damage: 30,
    range: 145,
    speed: 58,
    cooldown: 820,
    spriteSize: 96,
    movement: 'flying',
    archetype: 'spark',
    tint: 0xffd68a,
    description: 'Durable flying caster with strong tower reach.',
  },
] as const satisfies readonly CardDefinition[];

export type CardId = (typeof CARD_CATALOG)[number]['id'];

export const DEFAULT_DECK: CardId[] = ['vanguard', 'ranger', 'brute', 'spark', 'swiftblade', 'longbow', 'moss-mauler', 'storm-wisp'];

export const CARD_BY_ID = Object.fromEntries(CARD_CATALOG.map((card) => [card.id, card])) as Record<CardId, CardDefinition>;

function getCardArtUrl(card: CardId, side: 'front' | 'back'): string {
  return CARD_ART[`../assets/cards/${card}-${side}.png`];
}

export function getCardFrontUrl(card: CardId): string {
  return getCardArtUrl(card, 'front');
}

export function getCardBackUrl(card: CardId): string {
  return getCardArtUrl(card, 'back');
}

export function getCardFrontTexture(card: CardId): string {
  return `card-${card}-front`;
}

export function getCardBackTexture(card: CardId): string {
  return `card-${card}-back`;
}

export function getSavedDeck(): CardId[] {
  const saved = window.localStorage.getItem('crownfall.deck');
  if (!saved) {
    return [...DEFAULT_DECK];
  }

  try {
    const parsed = JSON.parse(saved) as string[];
    const valid = parsed.filter((id): id is CardId => id in CARD_BY_ID);
    return valid.length === 8 ? valid : [...DEFAULT_DECK];
  } catch {
    return [...DEFAULT_DECK];
  }
}

export function saveDeck(deck: CardId[]): void {
  window.localStorage.setItem('crownfall.deck', JSON.stringify(deck));
}
