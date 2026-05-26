import Phaser from 'phaser';
import { CARD_BY_ID, CARD_CATALOG, DEFAULT_DECK, getCardFrontUrl, getSavedDeck, saveDeck, type CardId } from './data/cards';
import { GameScene } from './scenes/GameScene';
import { NetworkClient, type NetworkDeployPayload, type NetworkSyncPayload } from './systems/network';
import {
  CHEST_DEFINITIONS,
  finishChestWithGold,
  formatDuration,
  getChestRemaining,
  getChestSpeedUpCost,
  getProgression,
  getShopCopyCost,
  getShopUnlockCost,
  getUpgradeRequirement,
  getXpRequired,
  grantBattleReward,
  openChest,
  purchaseCard,
  saveProgression,
  startChestUnlock,
  upgradeCard,
  type ChestSlot,
  type ProgressionState,
  type RewardBundle,
} from './systems/progression';
import './styles.css';

type ViewName = 'home' | 'deckbuilder' | 'shop' | 'battle';
type CardSurface = 'deck' | 'collection' | 'shop';

interface RewardRevealItem {
  title: string;
  amount: string;
  copy: string;
  image?: string;
  iconClass: string;
}

let progression = getProgression();
let activeLoadout = getActiveLoadoutIndex();
let loadouts = getSavedLoadouts();
let deckDraft = sanitizeDeck(loadouts[activeLoadout] ?? getSavedDeck(), progression);
let selectedDeckCard: CardId | undefined;
let selectedShopCard: CardId | undefined;
let revealQueue: RewardRevealItem[] = [];
let revealIndex = 0;
const network = new NetworkClient();

function setView(view: ViewName): void {
  document.getElementById('app')?.setAttribute('data-view', view);
  renderAll();
}

function renderAll(): void {
  renderPlayerStatus();
  renderChestSlots();
  renderHomeDeckPreview();
  renderDeckBuilder();
  renderShop();
}

function cardMarkup(cardId: CardId, extraClass = ''): string {
  const card = CARD_BY_ID[cardId];
  const art = getCardFrontUrl(cardId);
  const progress = progression.cards[cardId];
  const requirement = getUpgradeRequirement(progress.level);
  const progressText = requirement ? `${progress.copies}/${requirement.cards}` : 'Max';
  const lockedClass = progress.unlocked ? '' : ' is-locked';

  const selectedClass = selectedDeckCard === cardId || selectedShopCard === cardId ? ' is-highlighted' : '';
  return `<button class="collection-card ${extraClass}${lockedClass}${selectedClass}" data-card="${card.id}" type="button">
    <span class="collection-art" style="background-image: url('${art}')"></span>
    <span class="collection-name">${card.name}</span>
    <span class="collection-role">Lvl ${progress.level} ${card.role}</span>
    <span class="copy-track">${progress.unlocked ? progressText : 'Locked'}</span>
    <strong>${card.cost}</strong>
  </button>`;
}

function renderPlayerStatus(): void {
  const nextXp = getXpRequired(progression.level);
  setText('player-level', `Level ${progression.level}`);
  setText('player-xp', `${progression.xp} / ${nextXp} XP`);
  setText('trophies-count', String(progression.trophies));
  setText('gold-count', String(progression.gold));
  setText('gems-count', String(progression.gems));
  document.documentElement.style.setProperty('--xp-progress', `${Math.min(100, (progression.xp / nextXp) * 100)}%`);
}

function renderHomeDeckPreview(): void {
  const preview = document.getElementById('home-deck-preview');
  if (!preview) {
    return;
  }

  preview.innerHTML = (loadouts[activeLoadout] ?? getSavedDeck())
    .map((cardId) => {
      const card = CARD_BY_ID[cardId];
      const art = getCardFrontUrl(cardId);
      const progress = progression.cards[cardId];
      return `<div class="preview-card">
        <span style="background-image: url('${art}')"></span>
        <strong>${card.name}</strong>
        <small>Lvl ${progress.level}</small>
      </div>`;
    })
    .join('');
}

function renderChestSlots(): void {
  const row = document.getElementById('chest-row');
  if (!row) {
    return;
  }

  row.innerHTML = progression.chests.map((slot, index) => chestMarkup(slot, index)).join('');
  row.querySelectorAll<HTMLButtonElement>('[data-chest-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.chestIndex);
      const action = button.dataset.chestAction;
      if (action === 'start') {
        startChestUnlock(progression, index);
      }
      if (action === 'speed') {
        finishChestWithGold(progression, index);
      }
      if (action === 'open') {
        const reward = openChest(progression, index);
        if (reward) {
          startRewardReveal(reward);
        }
      }
      progression = getProgression();
      renderAll();
    });
  });
}

function chestMarkup(slot: ChestSlot | null, index: number): string {
  if (!slot) {
    return `<button class="chest-slot is-empty" type="button" disabled>
      <span class="chest-icon empty" aria-hidden="true"></span>
      <strong>Empty Slot</strong>
      <small>Win battles</small>
    </button>`;
  }

  const definition = CHEST_DEFINITIONS[slot.type];
  const remaining = getChestRemaining(slot);
  const isReady = remaining <= 0;
  const isOpening = Boolean(slot.unlockStartedAt) && !isReady;
  const action = isReady ? 'open' : isOpening ? 'speed' : 'start';
  const smallText = isReady ? 'Open' : isOpening ? `${formatDuration(remaining)} • ${getChestSpeedUpCost(slot)} gold` : formatDuration(definition.durationMs);

  return `<button class="chest-slot ${slot.type}${isReady ? ' is-ready' : ''}${isOpening ? ' is-opening' : ''}" data-chest-index="${index}" data-chest-action="${action}" type="button">
    <span class="chest-icon ${slot.type}" aria-hidden="true"></span>
    <strong>${definition.name}</strong>
    <small>${smallText}</small>
  </button>`;
}

function renderDeckBuilder(): void {
  const count = document.getElementById('deck-count');
  const loadoutTabs = document.getElementById('loadout-tabs');
  const selectedDeck = document.getElementById('selected-deck-list');
  const collection = document.getElementById('card-collection');
  const collectionCount = document.getElementById('collection-count');
  if (!count || !selectedDeck || !collection) {
    return;
  }

  const unlockedCount = CARD_CATALOG.filter((card) => progression.cards[card.id].unlocked).length;
  if (collectionCount) {
    collectionCount.textContent = `${unlockedCount} / ${CARD_CATALOG.length} Unlocked`;
  }
  count.textContent = `${deckDraft.length} / 8`;
  if (loadoutTabs) {
    loadoutTabs.innerHTML = loadouts
      .map(
        (_, index) =>
          `<button class="${index === activeLoadout ? 'is-active' : ''}" data-loadout-index="${index}" type="button">Deck ${index + 1}</button>`,
      )
      .join('');
  }
  selectedDeck.innerHTML = deckDraft
    .map((cardId) => `<div class="collection-item">${cardMarkup(cardId, 'is-in-deck')}${inlineCardActions(cardId, 'deck')}</div>`)
    .join('');
  collection.innerHTML = CARD_CATALOG.filter((card) => !deckDraft.includes(card.id))
    .map((card) => `<div class="collection-item">${cardMarkup(card.id)}${inlineCardActions(card.id, 'collection')}${upgradeMarkup(card.id)}</div>`)
    .join('');

  collection.querySelectorAll<HTMLButtonElement>('.collection-card').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.dataset.card as CardId | undefined;
      if (!card) {
        return;
      }

      selectedDeckCard = selectedDeckCard === card ? undefined : card;
      selectedShopCard = undefined;
      renderDeckBuilder();
    });
  });

  selectedDeck.querySelectorAll<HTMLButtonElement>('.collection-card').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.dataset.card as CardId | undefined;
      if (card) {
        selectedDeckCard = selectedDeckCard === card ? undefined : card;
        selectedShopCard = undefined;
        renderDeckBuilder();
      }
    });
  });

  loadoutTabs?.querySelectorAll<HTMLButtonElement>('[data-loadout-index]').forEach((button) => {
    button.addEventListener('click', () => {
      activeLoadout = Number(button.dataset.loadoutIndex);
      saveActiveLoadoutIndex(activeLoadout);
      deckDraft = sanitizeDeck(loadouts[activeLoadout], progression);
      selectedDeckCard = undefined;
      saveDeck(deckDraft);
      window.dispatchEvent(new CustomEvent('crownfall:deck-updated'));
      renderAll();
    });
  });

  collection.querySelectorAll<HTMLButtonElement>('[data-upgrade-card]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.dataset.upgradeCard as CardId | undefined;
      if (card && upgradeCard(progression, card)) {
        progression = getProgression();
        renderAll();
        window.dispatchEvent(new CustomEvent('crownfall:deck-updated'));
      }
    });
  });
  wireInlineCardActions();
}

function upgradeMarkup(cardId: CardId): string {
  const card = progression.cards[cardId];
  const requirement = getUpgradeRequirement(card.level);
  if (!card.unlocked) {
    return '<div class="upgrade-panel"><span>Find in chests or unlock in shop</span></div>';
  }
  if (!requirement) {
    return '<div class="upgrade-panel"><span>Max level reached</span></div>';
  }

  const canUpgrade = card.copies >= requirement.cards && progression.gold >= requirement.gold;
  return `<div class="upgrade-panel">
    <span>${card.copies}/${requirement.cards} cards • ${requirement.gold} gold</span>
    <button data-upgrade-card="${cardId}" type="button" ${canUpgrade ? '' : 'disabled'}>Upgrade</button>
  </div>`;
}

function renderShop(): void {
  const shopList = document.getElementById('shop-list');
  if (!shopList) {
    return;
  }

  const locked = CARD_CATALOG.filter((card) => !progression.cards[card.id].unlocked);
  const copies = CARD_CATALOG.filter((card) => progression.cards[card.id].unlocked).slice(0, 8);
  const offers = [...locked.slice(0, 8), ...copies].slice(0, 16);

  shopList.innerHTML = offers
    .map((card) => {
      const progress = progression.cards[card.id];
      const unlockCost = getShopUnlockCost(card.id);
      const copyCost = getShopCopyCost(card.id);
      const cost = progress.unlocked ? copyCost : unlockCost;
      return `<article class="shop-offer">
        <button class="shop-art-button ${selectedShopCard === card.id ? 'is-highlighted' : ''}" data-shop-select="${card.id}" type="button">
          <span class="shop-art" style="background-image: url('${getCardFrontUrl(card.id)}')"></span>
        </button>
        <div>
          <strong>${card.name}</strong>
          <span>${progress.unlocked ? '+8 copies' : 'Unlock card'} • ${card.role}</span>
        </div>
        <button data-buy-card="${card.id}" type="button" ${progression.gold >= cost ? '' : 'disabled'}>${cost} Gold</button>
        ${inlineCardActions(card.id, 'shop')}
      </article>`;
    })
    .join('');

  shopList.querySelectorAll<HTMLButtonElement>('[data-shop-select]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.dataset.shopSelect as CardId | undefined;
      selectedShopCard = selectedShopCard === card ? undefined : card;
      selectedDeckCard = undefined;
      renderShop();
    });
  });

  shopList.querySelectorAll<HTMLButtonElement>('[data-buy-card]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.dataset.buyCard as CardId | undefined;
      if (card && purchaseCard(progression, card)) {
        progression = getProgression();
        deckDraft = sanitizeDeck(deckDraft, progression);
        saveCurrentLoadout();
        renderAll();
      }
    });
  });
  wireInlineCardActions();
}

function sanitizeDeck(deck: CardId[], state: ProgressionState): CardId[] {
  const valid = deck.filter((card) => state.cards[card]?.unlocked);
  const fallback = CARD_CATALOG.map((card) => card.id).filter((card) => state.cards[card].unlocked);
  return [...valid, ...fallback.filter((card) => !valid.includes(card))].slice(0, 8);
}

function inlineCardActions(cardId: CardId, surface: CardSurface): string {
  const isSelected = surface === 'shop' ? selectedShopCard === cardId : selectedDeckCard === cardId;
  if (!isSelected) {
    return '';
  }
  const card = CARD_BY_ID[cardId];
  const progress = progression.cards[cardId];
  const inDeck = deckDraft.includes(cardId);
  const useLabel = surface === 'shop' ? (progress.unlocked ? 'Buy Copies' : 'Unlock') : surface === 'deck' || inDeck ? 'Remove' : 'Use';
  const useDisabled = surface !== 'shop' && (!progress.unlocked || (!inDeck && deckDraft.length >= 8));
  return `<div class="card-inline-actions">
    <strong>${card.name}</strong>
    <button data-card-info="${cardId}" type="button">Info</button>
    <button data-card-use="${cardId}" data-card-surface="${surface}" type="button" ${useDisabled ? 'disabled' : ''}>${useLabel}</button>
  </div>`;
}

function wireInlineCardActions(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-card-info]').forEach((button) => {
    button.onclick = () => {
      const card = button.dataset.cardInfo as CardId | undefined;
      if (card) {
        openCardInfo(card);
      }
    };
  });
  document.querySelectorAll<HTMLButtonElement>('[data-card-use]').forEach((button) => {
    button.onclick = () => {
      const card = button.dataset.cardUse as CardId | undefined;
      const surface = button.dataset.cardSurface as CardSurface | undefined;
      if (card && surface) {
        useSelectedCard(surface, card);
      }
    };
  });
}

function useSelectedCard(surface: CardSurface, cardId: CardId): void {
  if (surface === 'shop') {
    if (purchaseCard(progression, cardId)) {
      progression = getProgression();
      deckDraft = sanitizeDeck(deckDraft, progression);
      saveCurrentLoadout();
      renderAll();
    }
    return;
  }

  if (!progression.cards[cardId].unlocked) {
    return;
  }
  if (deckDraft.includes(cardId)) {
    deckDraft = deckDraft.filter((id) => id !== cardId);
  } else if (deckDraft.length < 8) {
    deckDraft = [...deckDraft, cardId];
  }
  renderAll();
}

function openCardInfo(cardId: CardId): void {
  const modal = document.getElementById('card-info-modal');
  const card = CARD_BY_ID[cardId];
  const progress = progression.cards[cardId];
  const levelMultiplier = 1 + (progress.level - 1) * 0.1;
  const stats = {
    Level: progress.level,
    Copies: progress.copies,
    Elixir: card.cost,
    HP: Math.round(card.hp * levelMultiplier),
    Damage: Math.round(card.damage * levelMultiplier),
    Range: card.range,
    Speed: card.speed,
    Cooldown: `${Math.round(card.cooldown / 10) / 100}s`,
    Movement: card.movement,
  };
  setText('card-info-name', card.name);
  setText('card-info-role', `${card.role} • ${progress.unlocked ? 'Unlocked' : 'Locked'}`);
  setText('card-info-description', card.description);
  const art = document.getElementById('card-info-art');
  if (art) {
    art.style.backgroundImage = `url('${getCardFrontUrl(cardId)}')`;
  }
  const statsNode = document.getElementById('card-info-stats');
  if (statsNode) {
    statsNode.innerHTML = Object.entries(stats)
      .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
      .join('');
  }
  modal?.classList.add('is-open');
  modal?.setAttribute('aria-hidden', 'false');
}

function closeModal(kind: 'card' | 'chest'): void {
  const id = kind === 'card' ? 'card-info-modal' : 'chest-reveal';
  const modal = document.getElementById(id);
  modal?.classList.remove('is-open');
  modal?.setAttribute('aria-hidden', 'true');
}

function startRewardReveal(reward: RewardBundle): void {
  revealQueue = rewardToRevealItems(reward);
  revealIndex = 0;
  showRewardReveal();
}

function showRewardReveal(): void {
  const modal = document.getElementById('chest-reveal');
  const item = revealQueue[revealIndex];
  if (!item) {
    closeModal('chest');
    progression = getProgression();
    renderAll();
    return;
  }

  setText('chest-reveal-title', item.title);
  setText('chest-reveal-amount', item.amount);
  setText('chest-reveal-copy', item.copy);
  const image = document.getElementById('chest-reveal-image');
  if (image) {
    image.className = `reward-image ${item.iconClass}`;
    image.style.backgroundImage = item.image ? `url('${item.image}')` : '';
  }
  const button = document.getElementById('chest-next-button');
  if (button) {
    button.textContent = revealIndex === revealQueue.length - 1 ? 'Done' : 'Next';
  }
  modal?.classList.add('is-open');
  modal?.setAttribute('aria-hidden', 'false');
}

function rewardToRevealItems(reward: RewardBundle): RewardRevealItem[] {
  const cardItems = Object.entries(reward.cards).map(([cardId, copies]) => {
    const card = CARD_BY_ID[cardId as CardId];
    return {
      title: card.name,
      amount: `x${copies}`,
      copy: `${card.role} card copies added to your collection.`,
      image: getCardFrontUrl(cardId as CardId),
      iconClass: 'card-reward',
    };
  });

  return [
    { title: 'Gold', amount: `+${reward.gold}`, copy: 'Spend gold in the shop or on card upgrades.', iconClass: 'gold-reward' },
    { title: 'XP', amount: `+${reward.xp}`, copy: 'XP moves your commander level forward.', iconClass: 'xp-reward' },
    ...cardItems,
  ];
}

function getSavedLoadouts(): CardId[][] {
  const saved = window.localStorage.getItem('crownfall.deck.loadouts');
  const fallback = [
    getSavedDeck(),
    DEFAULT_DECK,
    ['iron-sentinel', 'swiftblade', 'duelist', 'pathfinder', 'ember-archer', 'moss-mauler', 'storm-wisp', 'crackle-imp'],
    ['vanguard', 'banner-guard', 'frost-warden', 'longbow', 'storm-bow', 'stonebreaker', 'void-oracle', 'moon-sage'],
    ['brute', 'gate-crasher', 'rage-hammer', 'anvil-bearer', 'ranger', 'spark', 'sun-channeler', 'shade-runner'],
  ] as CardId[][];

  try {
    const parsed = saved ? (JSON.parse(saved) as string[][]) : [];
    return Array.from({ length: 5 }, (_, index) => sanitizeRawDeck((parsed[index] ?? fallback[index]) as string[]));
  } catch {
    return fallback.map(sanitizeRawDeck);
  }
}

function sanitizeRawDeck(deck: string[]): CardId[] {
  const valid = deck.filter((id): id is CardId => id in CARD_BY_ID);
  return [...valid, ...DEFAULT_DECK.filter((id) => !valid.includes(id))].slice(0, 8);
}

function saveCurrentLoadout(): void {
  loadouts[activeLoadout] = sanitizeDeck(deckDraft, progression);
  deckDraft = loadouts[activeLoadout];
  window.localStorage.setItem('crownfall.deck.loadouts', JSON.stringify(loadouts));
  saveDeck(deckDraft);
  window.dispatchEvent(new CustomEvent('crownfall:deck-updated'));
}

function getActiveLoadoutIndex(): number {
  return Math.min(4, Math.max(0, Number(window.localStorage.getItem('crownfall.deck.active') ?? 0)));
}

function saveActiveLoadoutIndex(index: number): void {
  window.localStorage.setItem('crownfall.deck.active', String(index));
}

function wireShell(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-view-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.viewTarget;
      if (target === 'home' || target === 'deckbuilder' || target === 'shop' || target === 'battle') {
        setView(target);
      }
    });
  });

  document.getElementById('quick-play-button')?.addEventListener('click', () => {
    setView('battle');
    document.getElementById('start-button')?.click();
  });

  document.getElementById('online-play-button')?.addEventListener('click', () => {
    network.connect();
  });

  document.getElementById('save-deck-button')?.addEventListener('click', () => {
    if (deckDraft.length !== 8) {
      document.getElementById('deck-count')!.textContent = `${deckDraft.length} / 8 required`;
      return;
    }

    saveCurrentLoadout();
    setView('home');
  });

  document.getElementById('chest-next-button')?.addEventListener('click', () => {
    revealIndex += 1;
    showRewardReveal();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-modal-close]').forEach((button) => {
    button.addEventListener('click', () => {
      const kind = button.dataset.modalClose;
      if (kind === 'card' || kind === 'chest') {
        closeModal(kind);
      }
    });
  });

  const devPanel = document.getElementById('dev-panel');
  const setDevOpen = (open: boolean) => {
    devPanel?.classList.toggle('is-open', open);
    devPanel?.setAttribute('aria-hidden', String(!open));
  };

  document.getElementById('dev-toggle')?.addEventListener('click', () => setDevOpen(!devPanel?.classList.contains('is-open')));
  document.getElementById('dev-close')?.addEventListener('click', () => setDevOpen(false));
  document.querySelectorAll<HTMLButtonElement>('[data-dev-action]').forEach((button) => {
    button.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('crownfall:dev-action', { detail: button.dataset.devAction }));
    });
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === '`') {
      setDevOpen(!devPanel?.classList.contains('is-open'));
    }
  });

  window.addEventListener('crownfall:dev-state', (event) => {
    const detail = (event as CustomEvent<{
      status: string;
      units: number;
      hand: string;
      towers: string;
      infiniteElixir: boolean;
    }>).detail;
    setText('dev-status', detail.status);
    setText('dev-units', String(detail.units));
    setText('dev-hand', detail.hand);
    setText('dev-towers', detail.towers);
    setText('dev-inf-elixir', `Inf Elixir: ${detail.infiniteElixir ? 'On' : 'Off'}`);
  });

  window.addEventListener('crownfall:battle-result', (event) => {
    const result = (event as CustomEvent<'won' | 'lost' | 'draw'>).detail;
    const reward = grantBattleReward(progression, result);
    progression = getProgression();
    showRewardToast(result === 'won' ? 'Victory Reward' : 'Battle Reward', formatReward(reward));
    renderAll();
  });

  window.addEventListener('crownfall:navigate-home', () => setView('home'));
  window.addEventListener('crownfall:network-status', (event) => {
    const status = (event as CustomEvent<string>).detail;
    setText('online-status', status);
  });
  window.addEventListener('crownfall:network-start', () => {
    setView('battle');
    window.dispatchEvent(new CustomEvent('crownfall:multiplayer-start'));
  });
  window.addEventListener('crownfall:network-opponent-left', () => {
    window.dispatchEvent(new CustomEvent('crownfall:multiplayer-stop'));
  });
  window.addEventListener('crownfall:network-deploy-local', (event) => {
    network.sendDeploy((event as CustomEvent<NetworkDeployPayload>).detail);
  });
  window.addEventListener('crownfall:network-sync-local', (event) => {
    network.sendSync((event as CustomEvent<NetworkSyncPayload>).detail);
  });
}

function formatReward(reward: RewardBundle): string {
  const cardCopies = Object.values(reward.cards).reduce((sum, count) => sum + (count ?? 0), 0);
  const chest = reward.chest ? ` • ${CHEST_DEFINITIONS[reward.chest].name}` : '';
  return `+${reward.gold} gold • +${reward.xp} XP${cardCopies ? ` • ${cardCopies} cards` : ''}${reward.trophies ? ` • ${reward.trophies > 0 ? '+' : ''}${reward.trophies} trophies` : ''}${chest}`;
}

function showRewardToast(title: string, body: string): void {
  const toast = document.getElementById('reward-toast');
  if (!toast) {
    return;
  }

  toast.innerHTML = `<strong>${title}</strong><span>${body}</span>`;
  toast.classList.add('is-visible');
  window.setTimeout(() => toast.classList.remove('is-visible'), 3200);
}

function setText(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#10131a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 540,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scene: [GameScene],
};

wireShell();
renderAll();
saveProgression(progression);
new Phaser.Game(config);
