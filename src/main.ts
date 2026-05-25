import Phaser from 'phaser';
import { CARD_BY_ID, CARD_CATALOG, getCardFrontUrl, getSavedDeck, saveDeck, type CardId } from './data/cards';
import { GameScene } from './scenes/GameScene';
import { NetworkClient, type NetworkDeployPayload } from './systems/network';
import './styles.css';

let deckDraft = getSavedDeck();
const network = new NetworkClient();

function setView(view: 'home' | 'deckbuilder' | 'battle'): void {
  document.getElementById('app')?.setAttribute('data-view', view);
  renderHomeDeckPreview();
  renderDeckBuilder();
}

function cardMarkup(cardId: CardId, extraClass = ''): string {
  const card = CARD_BY_ID[cardId];
  const art = getCardFrontUrl(cardId);
  return `<button class="collection-card ${extraClass}" data-card="${card.id}" type="button">
    <span class="collection-art" style="background-image: url('${art}')"></span>
    <span class="collection-name">${card.name}</span>
    <span class="collection-role">${card.role}</span>
    <strong>${card.cost}</strong>
  </button>`;
}

function renderHomeDeckPreview(): void {
  const preview = document.getElementById('home-deck-preview');
  if (!preview) {
    return;
  }

  preview.innerHTML = getSavedDeck()
    .map((cardId) => {
      const card = CARD_BY_ID[cardId];
      const art = getCardFrontUrl(cardId);
      return `<div class="preview-card">
        <span style="background-image: url('${art}')"></span>
        <strong>${card.name}</strong>
      </div>`;
    })
    .join('');
}

function renderDeckBuilder(): void {
  const count = document.getElementById('deck-count');
  const selectedDeck = document.getElementById('selected-deck-list');
  const collection = document.getElementById('card-collection');
  if (!count || !selectedDeck || !collection) {
    return;
  }

  count.textContent = `${deckDraft.length} / 8`;
  selectedDeck.innerHTML = deckDraft.map((cardId) => cardMarkup(cardId, 'is-in-deck')).join('');
  collection.innerHTML = CARD_CATALOG.map((card) => {
    const inDeck = deckDraft.includes(card.id);
    return cardMarkup(card.id, inDeck ? 'is-in-deck' : '');
  }).join('');

  collection.querySelectorAll<HTMLButtonElement>('.collection-card').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.dataset.card as CardId | undefined;
      if (!card) {
        return;
      }

      if (deckDraft.includes(card)) {
        deckDraft = deckDraft.filter((id) => id !== card);
      } else if (deckDraft.length < 8) {
        deckDraft = [...deckDraft, card];
      }

      renderDeckBuilder();
    });
  });

  selectedDeck.querySelectorAll<HTMLButtonElement>('.collection-card').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.dataset.card as CardId | undefined;
      if (card) {
        deckDraft = deckDraft.filter((id) => id !== card);
        renderDeckBuilder();
      }
    });
  });
}

function wireShell(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-view-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.viewTarget;
      if (target === 'home' || target === 'deckbuilder' || target === 'battle') {
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

    saveDeck(deckDraft);
    window.dispatchEvent(new CustomEvent('crownfall:deck-updated'));
    setView('home');
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
    document.getElementById('dev-status')!.textContent = detail.status;
    document.getElementById('dev-units')!.textContent = String(detail.units);
    document.getElementById('dev-hand')!.textContent = detail.hand;
    document.getElementById('dev-towers')!.textContent = detail.towers;
    document.getElementById('dev-inf-elixir')!.textContent = `Inf Elixir: ${detail.infiniteElixir ? 'On' : 'Off'}`;
  });

  window.addEventListener('crownfall:navigate-home', () => setView('home'));
  window.addEventListener('crownfall:network-status', (event) => {
    const status = (event as CustomEvent<string>).detail;
    const node = document.getElementById('online-status');
    if (node) {
      node.textContent = status;
    }
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
renderHomeDeckPreview();
renderDeckBuilder();
new Phaser.Game(config);
