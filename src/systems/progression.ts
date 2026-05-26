import { CARD_BY_ID, CARD_CATALOG, DEFAULT_DECK, type CardId } from '../data/cards';

const STORAGE_KEY = 'crownfall.progression.v1';
const MAX_CARD_LEVEL = 11;

export type ChestType = 'silver' | 'gold' | 'crown';

export interface CardProgress {
  unlocked: boolean;
  copies: number;
  level: number;
}

export interface ChestSlot {
  id: string;
  type: ChestType;
  unlockStartedAt?: number;
}

export interface RewardBundle {
  gold: number;
  xp: number;
  trophies: number;
  cards: Partial<Record<CardId, number>>;
  chest?: ChestType;
}

export interface ProgressionState {
  level: number;
  xp: number;
  gold: number;
  gems: number;
  trophies: number;
  cards: Record<CardId, CardProgress>;
  chests: Array<ChestSlot | null>;
  battleWins: number;
}

interface ChestDefinition {
  name: string;
  durationMs: number;
  speedUpGoldPerHour: number;
  gold: [number, number];
  xp: [number, number];
  cards: [number, number];
}

export const CHEST_DEFINITIONS: Record<ChestType, ChestDefinition> = {
  silver: {
    name: 'Silver Chest',
    durationMs: 3 * 60 * 60 * 1000,
    speedUpGoldPerHour: 120,
    gold: [65, 120],
    xp: [18, 34],
    cards: [5, 9],
  },
  gold: {
    name: 'Gold Chest',
    durationMs: 8 * 60 * 60 * 1000,
    speedUpGoldPerHour: 150,
    gold: [160, 290],
    xp: [44, 82],
    cards: [12, 22],
  },
  crown: {
    name: 'Crown Chest',
    durationMs: 12 * 60 * 60 * 1000,
    speedUpGoldPerHour: 180,
    gold: [320, 620],
    xp: [90, 160],
    cards: [26, 46],
  },
};

export function getXpRequired(level: number): number {
  return Math.round(80 + level * 52 + Math.pow(level, 1.55) * 18);
}

export function getUpgradeRequirement(level: number): { cards: number; gold: number } | null {
  if (level >= MAX_CARD_LEVEL) {
    return null;
  }

  const cards = [2, 4, 10, 20, 50, 100, 200, 400, 800, 1000][level - 1] ?? 1200;
  const gold = [25, 50, 150, 400, 1000, 2000, 4000, 8000, 20000, 50000][level - 1] ?? 75000;
  return { cards, gold };
}

export function getProgression(): ProgressionState {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    const fresh = createInitialProgression();
    saveProgression(fresh);
    return fresh;
  }

  try {
    return normalizeProgression(JSON.parse(saved) as Partial<ProgressionState>);
  } catch {
    const fresh = createInitialProgression();
    saveProgression(fresh);
    return fresh;
  }
}

export function saveProgression(progression: ProgressionState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progression));
}

export function grantBattleReward(progression: ProgressionState, result: 'won' | 'lost' | 'draw'): RewardBundle {
  const reward: RewardBundle =
    result === 'won'
      ? { gold: 85, xp: 45, trophies: 28, cards: {}, chest: chooseBattleChest(progression.battleWins + 1) }
      : result === 'draw'
        ? { gold: 35, xp: 18, trophies: 0, cards: {} }
        : { gold: 18, xp: 10, trophies: -18, cards: {} };

  progression.battleWins += result === 'won' ? 1 : 0;
  progression.gold += reward.gold;
  progression.trophies = Math.max(0, progression.trophies + reward.trophies);
  addXp(progression, reward.xp);

  if (reward.chest) {
    reward.chest = addChest(progression, reward.chest) ? reward.chest : undefined;
  }

  saveProgression(progression);
  return reward;
}

export function addXp(progression: ProgressionState, amount: number): void {
  progression.xp += amount;
  while (progression.xp >= getXpRequired(progression.level)) {
    progression.xp -= getXpRequired(progression.level);
    progression.level += 1;
    progression.gold += 120 + progression.level * 20;
  }
}

export function purchaseCard(progression: ProgressionState, cardId: CardId): boolean {
  const card = progression.cards[cardId];
  const wasUnlocked = card.unlocked;
  const cost = card.unlocked ? getShopCopyCost(cardId) : getShopUnlockCost(cardId);
  if (progression.gold < cost) {
    return false;
  }

  progression.gold -= cost;
  card.unlocked = true;
  card.copies += wasUnlocked ? 8 : 1;
  addXp(progression, wasUnlocked ? 5 : 12);
  saveProgression(progression);
  return true;
}

export function upgradeCard(progression: ProgressionState, cardId: CardId): boolean {
  const card = progression.cards[cardId];
  const requirement = getUpgradeRequirement(card.level);
  if (!requirement || !card.unlocked || card.copies < requirement.cards || progression.gold < requirement.gold) {
    return false;
  }

  card.copies -= requirement.cards;
  card.level += 1;
  progression.gold -= requirement.gold;
  addXp(progression, 20 + card.level * 8);
  saveProgression(progression);
  return true;
}

export function addChest(progression: ProgressionState, type: ChestType): boolean {
  const slotIndex = progression.chests.findIndex((slot) => !slot);
  if (slotIndex === -1) {
    return false;
  }

  progression.chests[slotIndex] = {
    id: `${type}-${Date.now()}-${Math.round(Math.random() * 100000)}`,
    type,
  };
  saveProgression(progression);
  return true;
}

export function startChestUnlock(progression: ProgressionState, index: number): boolean {
  const chest = progression.chests[index];
  if (!chest || chest.unlockStartedAt || progression.chests.some((slot) => slot?.unlockStartedAt && getChestRemaining(slot) > 0)) {
    return false;
  }

  chest.unlockStartedAt = Date.now();
  saveProgression(progression);
  return true;
}

export function finishChestWithGold(progression: ProgressionState, index: number): boolean {
  const chest = progression.chests[index];
  if (!chest) {
    return false;
  }

  const cost = getChestSpeedUpCost(chest);
  if (progression.gold < cost) {
    return false;
  }

  progression.gold -= cost;
  chest.unlockStartedAt = Date.now() - CHEST_DEFINITIONS[chest.type].durationMs;
  saveProgression(progression);
  return true;
}

export function openChest(progression: ProgressionState, index: number): RewardBundle | undefined {
  const chest = progression.chests[index];
  if (!chest || getChestRemaining(chest) > 0) {
    return undefined;
  }

  const reward = rollChestReward(progression, chest.type);
  progression.chests[index] = null;
  progression.gold += reward.gold;
  progression.trophies += reward.trophies;
  Object.entries(reward.cards).forEach(([cardId, copies]) => {
    const card = progression.cards[cardId as CardId];
    card.unlocked = true;
    card.copies += copies ?? 0;
  });
  addXp(progression, reward.xp);
  saveProgression(progression);
  return reward;
}

export function getChestRemaining(chest: ChestSlot): number {
  if (!chest.unlockStartedAt) {
    return CHEST_DEFINITIONS[chest.type].durationMs;
  }

  return Math.max(0, CHEST_DEFINITIONS[chest.type].durationMs - (Date.now() - chest.unlockStartedAt));
}

export function getChestSpeedUpCost(chest: ChestSlot): number {
  const remainingHours = Math.max(1 / 6, getChestRemaining(chest) / (60 * 60 * 1000));
  return Math.ceil(remainingHours * CHEST_DEFINITIONS[chest.type].speedUpGoldPerHour);
}

export function formatDuration(ms: number): string {
  if (ms <= 0) {
    return 'Ready';
  }

  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function getShopUnlockCost(cardId: CardId): number {
  return 220 + CARD_BY_ID[cardId].cost * 35;
}

export function getShopCopyCost(cardId: CardId): number {
  return 35 + CARD_BY_ID[cardId].cost * 10;
}

function createInitialProgression(): ProgressionState {
  const cards = Object.fromEntries(
    CARD_CATALOG.map((card) => [
      card.id,
      {
        unlocked: DEFAULT_DECK.includes(card.id),
        copies: DEFAULT_DECK.includes(card.id) ? 4 : 0,
        level: 1,
      },
    ]),
  ) as Record<CardId, CardProgress>;

  return {
    level: 7,
    xp: 140,
    gold: 1800,
    gems: 64,
    trophies: 2840,
    cards,
    chests: [
      { id: 'starter-silver', type: 'silver' },
      { id: 'starter-gold', type: 'gold' },
      { id: 'starter-crown', type: 'crown', unlockStartedAt: Date.now() - CHEST_DEFINITIONS.crown.durationMs },
      null,
    ],
    battleWins: 0,
  };
}

function normalizeProgression(saved: Partial<ProgressionState>): ProgressionState {
  const fresh = createInitialProgression();
  const merged: ProgressionState = {
    ...fresh,
    ...saved,
    cards: { ...fresh.cards, ...(saved.cards ?? {}) },
    chests: Array.from({ length: 4 }, (_, index) => saved.chests?.[index] ?? fresh.chests[index] ?? null),
  };

  CARD_CATALOG.forEach((card) => {
    const progress = merged.cards[card.id] ?? fresh.cards[card.id];
    merged.cards[card.id] = {
      unlocked: Boolean(progress.unlocked),
      copies: Math.max(0, Math.floor(progress.copies)),
      level: Math.min(MAX_CARD_LEVEL, Math.max(1, Math.floor(progress.level))),
    };
  });

  return merged;
}

function chooseBattleChest(wins: number): ChestType {
  if (wins % 8 === 0) {
    return 'crown';
  }
  if (wins % 3 === 0) {
    return 'gold';
  }
  return 'silver';
}

function rollChestReward(progression: ProgressionState, type: ChestType): RewardBundle {
  const definition = CHEST_DEFINITIONS[type];
  const cardTotal = randomBetween(definition.cards[0], definition.cards[1]);
  const cards: Partial<Record<CardId, number>> = {};
  const eligible = CARD_CATALOG.filter((card) => progression.cards[card.id].unlocked || Math.random() > 0.58);

  for (let i = 0; i < cardTotal; i += 1) {
    const card = eligible[Math.floor(Math.random() * eligible.length)] ?? CARD_CATALOG[0];
    cards[card.id] = (cards[card.id] ?? 0) + 1;
  }

  return {
    gold: randomBetween(definition.gold[0], definition.gold[1]),
    xp: randomBetween(definition.xp[0], definition.xp[1]),
    trophies: 0,
    cards,
  };
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
