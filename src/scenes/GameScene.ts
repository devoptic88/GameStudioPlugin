import Phaser from 'phaser';
import {
  CARD_BY_ID,
  CARD_CATALOG,
  getCardBackTexture,
  getCardBackUrl,
  getCardFrontTexture,
  getCardFrontUrl,
  getSavedDeck,
  type CardDefinition,
  type CardId,
  type MovementType,
} from '../data/cards';
import { AudioDirector } from '../systems/audio';
import { BattleSnapshot, BattleState, BattleStatus } from '../systems/gameState';
import type { NetworkDeployPayload, NetworkSyncPayload } from '../systems/network';
import { getProgression } from '../systems/progression';
import arenaUrl from '../assets/environment/arena-epic.png';
import enemyCitadelUrl from '../assets/towers/enemy-citadel.svg';
import enemyOutpostUrl from '../assets/towers/enemy-outpost.svg';
import playerCitadelUrl from '../assets/towers/player-citadel.svg';
import playerOutpostUrl from '../assets/towers/player-outpost.svg';
import combatVfxUrl from '../assets/effects/combat-vfx-sheet.png';

const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 540;
const RIVER_Y = 270;
const PLAYER_SIDE_MIN_Y = RIVER_Y + 32;
const BRIDGE_CENTERS = [308, 652];
const BRIDGE_HALF_WIDTH = 48;
const BRIDGE_CLEARANCE = 32;

type Side = 'player' | 'enemy';

interface BattleUnit {
  id: number;
  side: Side;
  card: CardId;
  hp: number;
  maxHp: number;
  damage: number;
  range: number;
  speed: number;
  cooldown: number;
  nextAttackAt: number;
  movement: MovementType;
  directTargetId?: string;
  networkId?: string;
  baseScaleX: number;
  baseScaleY: number;
  bobSeed: number;
  sprite: Phaser.Physics.Arcade.Sprite;
  hpBar: Phaser.GameObjects.Rectangle;
}

interface Tower {
  id: string;
  side: Side;
  name: string;
  hp: number;
  maxHp: number;
  range: number;
  damage: number;
  cooldown: number;
  nextAttackAt: number;
  sprite: Phaser.GameObjects.Image;
  hpText: Phaser.GameObjects.Text;
}

export class GameScene extends Phaser.Scene {
  private state = new BattleState();
  private selectedCard: CardId = getSavedDeck()[0];
  private activeDeck: CardId[] = getSavedDeck();
  private readonly handSize = 4;
  private status: BattleStatus = 'ready';
  private units: BattleUnit[] = [];
  private towers: Tower[] = [];
  private audio = new AudioDirector();
  private nextUnitId = 1;
  private nextNetworkUnitId = 1;
  private nextPositionSyncAt = 0;
  private enemyPlanAt = 0;
  private notice?: Phaser.GameObjects.Text;
  private multiplayer = false;

  constructor() {
    super('game');
  }

  preload(): void {
    this.load.image('arena-epic', arenaUrl);
    this.load.image('tower-player-outpost', playerOutpostUrl);
    this.load.image('tower-player-citadel', playerCitadelUrl);
    this.load.image('tower-enemy-outpost', enemyOutpostUrl);
    this.load.image('tower-enemy-citadel', enemyCitadelUrl);
    this.load.spritesheet('combat-vfx', combatVfxUrl, { frameWidth: 512, frameHeight: 512 });
    CARD_CATALOG.forEach((card) => {
      this.load.image(getCardFrontTexture(card.id), getCardFrontUrl(card.id));
      this.load.image(getCardBackTexture(card.id), getCardBackUrl(card.id));
    });
  }

  create(): void {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.addArena();
    this.createTowers();
    this.wireDomControls();
    document.addEventListener('pointerdown', (event) => this.tryDeployFromCanvas(event));
    document.addEventListener('mousedown', (event) => this.tryDeployFromCanvas(event));
    document.addEventListener('keydown', (event) => this.handleKeyboard(event));
    window.addEventListener('crownfall:dev-action', (event) => this.handleDevAction((event as CustomEvent<string>).detail));
    window.addEventListener('crownfall:multiplayer-start', () => this.startMultiplayerBattle());
    window.addEventListener('crownfall:multiplayer-stop', () => this.stopMultiplayerBattle());
    window.addEventListener('crownfall:network-deploy-remote', (event) =>
      this.deployRemoteCard((event as CustomEvent<NetworkDeployPayload>).detail),
    );
    window.addEventListener('crownfall:network-sync-remote', (event) => this.applyRemoteSync((event as CustomEvent<NetworkSyncPayload>).detail));
    this.notice = this.add
      .text(WORLD_WIDTH / 2, RIVER_Y + 4, 'Deploy on your half', {
        color: '#f6f2e8',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '15px',
        fontStyle: '700',
      })
      .setOrigin(0.5)
      .setDepth(8)
      .setAlpha(0);
    this.updateHud(this.state.snapshot());
    this.publishDevState();
  }

  update(time: number, delta: number): void {
    if (this.status !== 'playing') {
      return;
    }

    const deltaSeconds = delta / 1000;
    const snapshot = this.state.update(deltaSeconds);
    this.updateHud(snapshot);
    if (!this.multiplayer) {
      this.planEnemyDeploy(time);
    }
    this.updateUnits(time, deltaSeconds);
    this.publishPositionSync(time);
    this.updateTowers(time);
    this.cleanupDefeated();
    this.checkBattleEnd(snapshot.status);
    this.publishDevState();
  }

  private startBattle(): void {
    this.multiplayer = false;
    void this.audio.startMusic();
    this.activeDeck = getSavedDeck();
    this.selectedCard = this.activeDeck.includes(this.selectedCard) ? this.selectedCard : this.activeDeck[0];
    this.renderBattleDeck();
    this.clearUnits();
    this.towers.forEach((tower) => {
      tower.hp = tower.maxHp;
      tower.nextAttackAt = 0;
      tower.sprite.setAlpha(1);
      this.updateTowerText(tower);
    });
    this.enemyPlanAt = 1800;
    this.status = 'playing';
    this.setMessageVisible(false);
    this.updateHud(this.state.start());
    this.publishDevState();
  }

  private startMultiplayerBattle(): void {
    this.multiplayer = true;
    void this.audio.startMusic();
    this.activeDeck = getSavedDeck();
    this.selectedCard = this.activeDeck[0];
    this.renderBattleDeck();
    this.clearUnits();
    this.towers.forEach((tower) => {
      tower.hp = tower.maxHp;
      tower.nextAttackAt = 0;
      tower.sprite.setAlpha(1);
      this.updateTowerText(tower);
    });
    this.status = 'playing';
    this.setMessageVisible(false);
    this.updateHud(this.state.start());
    this.showNotice('Opponent connected');
    this.publishDevState();
  }

  private stopMultiplayerBattle(): void {
    if (!this.multiplayer) {
      return;
    }

    this.multiplayer = false;
    this.showNotice('Opponent left');
    this.finishBattle('won');
  }

  private tryDeploy(x: number, y: number): void {
    if (this.status !== 'playing') {
      return;
    }

    const clickedEnemyTower = this.findClickedEnemyTower(x, y);
    if (clickedEnemyTower) {
      this.deploySelectedCard(x, WORLD_HEIGHT - 132, clickedEnemyTower.id);
      return;
    }

    if (y < PLAYER_SIDE_MIN_Y || y > WORLD_HEIGHT - 54) {
      this.showNotice('Deploy below the river');
      return;
    }

    this.deploySelectedCard(x, y);
  }

  private deploySelectedCard(x: number, y: number, directTargetId?: string): void {
    const stats = CARD_BY_ID[this.selectedCard];
    if (!this.state.canSpend(stats.cost)) {
      this.showNotice('Need more elixir');
      return;
    }

    const card = this.selectedCard;
    const unitId = this.createNetworkUnitId();
    this.state.spend(stats.cost);
    this.spawnUnit('player', card, x, y, directTargetId, unitId);
    if (this.multiplayer) {
      window.dispatchEvent(new CustomEvent<NetworkDeployPayload>('crownfall:network-deploy-local', { detail: { unitId, card, x, y, directTargetId } }));
    }
    this.rotateUsedCard(card);
    this.updateHud(this.state.snapshot());
  }

  private deployRemoteCard(payload: NetworkDeployPayload): void {
    if (!this.multiplayer || this.status !== 'playing' || !(payload.card in CARD_BY_ID)) {
      return;
    }

    this.spawnUnit('enemy', payload.card, WORLD_WIDTH - payload.x, WORLD_HEIGHT - payload.y, this.mirrorTowerId(payload.directTargetId), payload.unitId);
  }

  private createNetworkUnitId(): string {
    const id = `unit-${Date.now()}-${this.nextNetworkUnitId}`;
    this.nextNetworkUnitId += 1;
    return id;
  }

  private mirrorTowerId(towerId?: string): string | undefined {
    const mirrors: Record<string, string> = {
      'enemy-left': 'player-right',
      'enemy-right': 'player-left',
      'enemy-king': 'player-king',
      'player-left': 'enemy-right',
      'player-right': 'enemy-left',
      'player-king': 'enemy-king',
    };
    return towerId ? mirrors[towerId] : undefined;
  }

  private rotateUsedCard(card: CardId): void {
    const hand = this.getVisibleHand();
    const queue = this.activeDeck.slice(this.handSize);
    const handIndex = hand.indexOf(card);
    if (handIndex === -1) {
      return;
    }

    const nextCard = queue.shift();
    if (nextCard) {
      hand[handIndex] = nextCard;
      queue.push(card);
    }

    this.activeDeck = [...hand, ...queue];
    this.selectedCard = nextCard ?? hand[0];
    this.renderBattleDeck();
    this.publishDevState();
  }

  private tryDeployFromCanvas(event: PointerEvent | MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) {
      return;
    }

    const rect = this.game.canvas.getBoundingClientRect();
    const isInsideCanvas =
      event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!isInsideCanvas) {
      return;
    }

    const x = ((event.clientX - rect.left) / rect.width) * WORLD_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * WORLD_HEIGHT;
    this.tryDeploy(x, y);
  }

  private planEnemyDeploy(time: number): void {
    if (time < this.enemyPlanAt) {
      return;
    }

    const options = CARD_CATALOG.map((card) => card.id);
    const affordable = options.filter((card) => this.state.canEnemySpend(CARD_BY_ID[card].cost));
    if (affordable.length > 0) {
      const card = Phaser.Utils.Array.GetRandom(affordable);
      const laneX = Phaser.Math.RND.pick([308, 480, 652]);
      this.state.spendEnemy(CARD_BY_ID[card].cost);
      this.spawnUnit('enemy', card, laneX + Phaser.Math.Between(-24, 24), Phaser.Math.Between(104, 210));
    }

    this.enemyPlanAt = time + Phaser.Math.Between(1600, 2800);
  }

  private handleDevAction(action?: string): void {
    switch (action) {
      case 'start':
      case 'reset':
        this.startBattle();
        break;
      case 'elixir':
        this.updateHud(this.state.addElixir(10));
        break;
      case 'enemy-elixir':
        this.updateHud(this.state.addEnemyElixir(10));
        break;
      case 'infinite-elixir':
        this.updateHud(this.state.setInfiniteElixir(!this.state.hasInfiniteElixir()));
        break;
      case 'spawn-player':
        if (this.status !== 'playing') {
          this.startBattle();
        }
        this.spawnUnit('player', this.selectedCard, WORLD_WIDTH / 2, WORLD_HEIGHT - 132);
        break;
      case 'spawn-enemy': {
        if (this.status !== 'playing') {
          this.startBattle();
        }
        const card = Phaser.Utils.Array.GetRandom(CARD_CATALOG.map((item) => item.id));
        this.spawnUnit('enemy', card, WORLD_WIDTH / 2, 150);
        break;
      }
      case 'clear-units':
        this.clearUnits();
        break;
      case 'win':
        if (this.status !== 'playing') {
          this.startBattle();
        }
        this.finishBattle('won');
        break;
    }

    this.publishDevState();
  }

  private spawnUnit(side: Side, card: CardId, x: number, y: number, directTargetId?: string, networkId?: string): void {
    const stats = CARD_BY_ID[card];
    const cardLevel = getProgression().cards[card]?.level ?? 1;
    const levelMultiplier = 1 + (cardLevel - 1) * 0.1;
    const hp = Math.round(stats.hp * levelMultiplier);
    const damage = Math.round(stats.damage * levelMultiplier);
    const sprite = this.physics.add.sprite(x, y, side === 'player' ? getCardBackTexture(card) : getCardFrontTexture(card));
    sprite.setDepth(5);
    sprite.setTint(side === 'player' ? 0xffffff : this.blendTint(0xffffff, 0xff7f7f, 0.18));
    sprite.setDisplaySize(stats.spriteSize, stats.spriteSize);
    sprite.setCircle(38, 26, 48);
    sprite.setCollideWorldBounds(true);

    const hpBar = this.add.rectangle(x, y - stats.spriteSize * 0.34, 40, 5, side === 'player' ? 0x7cd3ff : 0xf25f5c).setDepth(7);
    this.units.push({
      id: this.nextUnitId,
      side,
      card,
      hp,
      maxHp: hp,
      damage,
      range: stats.range,
      speed: stats.speed,
      cooldown: stats.cooldown,
      nextAttackAt: 0,
      movement: stats.movement,
      directTargetId,
      networkId,
      baseScaleX: sprite.scaleX,
      baseScaleY: sprite.scaleY,
      bobSeed: Phaser.Math.FloatBetween(0, Math.PI * 2),
      sprite,
      hpBar,
    });
    this.nextUnitId += 1;
    void this.audio.playSpawn(card);
  }

  private updateUnits(time: number, deltaSeconds: number): void {
    this.units.forEach((unit) => {
      if (this.isNetworkControlledEnemy(unit)) {
        this.updateNetworkControlledEnemy(unit, time);
        return;
      }

      const target = this.findNearestTarget(unit);
      if (!target) {
        unit.sprite.setVelocity(0, 0);
        return;
      }

      const movementPoint = this.getMovementTargetPoint(unit, target);
      const actualTargetPoint = this.getTargetPoint(target);
      const attackDistance = Phaser.Math.Distance.Between(unit.sprite.x, unit.sprite.y, actualTargetPoint.x, actualTargetPoint.y);
      if (attackDistance <= unit.range) {
        unit.sprite.setVelocity(0, 0);
        if (time >= unit.nextAttackAt) {
          unit.nextAttackAt = time + unit.cooldown;
          this.resolveUnitAttack(unit, target, actualTargetPoint);
        }
      } else {
        const angle = Phaser.Math.Angle.Between(unit.sprite.x, unit.sprite.y, movementPoint.x, movementPoint.y);
        this.physics.velocityFromRotation(angle, unit.speed, unit.sprite.body?.velocity);
      }

      this.updateUnitAnimation(unit, time);
      unit.hpBar.setPosition(unit.sprite.x, unit.sprite.y - CARD_BY_ID[unit.card].spriteSize * 0.34);
      unit.hpBar.width = Math.max(2, 40 * (unit.hp / unit.maxHp));
    });
  }

  private isNetworkControlledEnemy(unit: BattleUnit): boolean {
    return this.multiplayer && unit.side === 'enemy' && Boolean(unit.networkId);
  }

  private updateNetworkControlledEnemy(unit: BattleUnit, time: number): void {
    unit.sprite.setVelocity(0, 0);
    const target = this.findNearestTarget(unit);
    if (target) {
      const targetPoint = this.getTargetPoint(target);
      const attackDistance = Phaser.Math.Distance.Between(unit.sprite.x, unit.sprite.y, targetPoint.x, targetPoint.y);
      if (attackDistance <= unit.range && time >= unit.nextAttackAt) {
        unit.nextAttackAt = time + unit.cooldown;
        this.resolveUnitAttack(unit, target, targetPoint);
      }
    }

    this.updateUnitAnimation(unit, time);
    unit.hpBar.setPosition(unit.sprite.x, unit.sprite.y - CARD_BY_ID[unit.card].spriteSize * 0.34);
    unit.hpBar.width = Math.max(2, 40 * (unit.hp / unit.maxHp));
  }

  private publishPositionSync(time: number): void {
    if (!this.multiplayer || time < this.nextPositionSyncAt) {
      return;
    }

    const units = this.units
      .filter((unit) => unit.side === 'player' && unit.networkId && unit.hp > 0)
      .map((unit) => ({
        unitId: unit.networkId!,
        x: Math.round(unit.sprite.x * 10) / 10,
        y: Math.round(unit.sprite.y * 10) / 10,
        hp: Math.round(unit.hp * 10) / 10,
      }));

    window.dispatchEvent(new CustomEvent<NetworkSyncPayload>('crownfall:network-sync-local', { detail: { units } }));
    this.nextPositionSyncAt = time + 80;
  }

  private applyRemoteSync(payload: NetworkSyncPayload): void {
    if (!this.multiplayer) {
      return;
    }

    payload.units.forEach((snapshot) => {
      const unit = this.units.find((candidate) => candidate.side === 'enemy' && candidate.networkId === snapshot.unitId);
      if (!unit) {
        return;
      }

      unit.hp = snapshot.hp;
      unit.sprite.setPosition(WORLD_WIDTH - snapshot.x, WORLD_HEIGHT - snapshot.y);
      unit.sprite.setVelocity(0, 0);
      unit.hpBar.setPosition(unit.sprite.x, unit.sprite.y - CARD_BY_ID[unit.card].spriteSize * 0.34);
      unit.hpBar.width = Math.max(2, 40 * (unit.hp / unit.maxHp));
    });
  }

  private updateUnitAnimation(unit: BattleUnit, time: number): void {
    const velocity = unit.sprite.body?.velocity;
    const isMoving = velocity ? velocity.lengthSq() > 4 : false;
    const phase = time * (unit.movement === 'flying' ? 0.006 : 0.011) + unit.bobSeed;
    const bob = Math.sin(phase);
    const squash = isMoving ? 0.045 : 0.018;
    const hover = unit.movement === 'flying' ? 0.055 : 0;

    unit.sprite.setScale(unit.baseScaleX * (1 + squash * bob), unit.baseScaleY * (1 - squash * bob + hover * Math.sin(phase * 0.7)));
    unit.sprite.setAngle(isMoving ? Math.sin(phase * 0.8) * 2.4 : Math.sin(phase * 0.5) * 1.2);
    unit.sprite.setAlpha(unit.movement === 'flying' ? 0.96 + Math.sin(phase) * 0.04 : 1);
  }

  private playAttackAnimation(unit: BattleUnit, targetPoint: { x: number; y: number }): void {
    const originalTint = unit.side === 'player' ? 0xffffff : 0xffa3a3;
    const direction = new Phaser.Math.Vector2(targetPoint.x - unit.sprite.x, targetPoint.y - unit.sprite.y).normalize();
    const startX = unit.sprite.x;
    const startY = unit.sprite.y;

    this.tweens.add({
      targets: unit.sprite,
      x: startX + direction.x * 8,
      y: startY + direction.y * 8,
      alpha: 0.72,
      duration: 70,
      yoyo: true,
      ease: 'Quad.easeOut',
      onStart: () => unit.sprite.setTint(0xffffff),
      onComplete: () => {
        unit.sprite.setTint(originalTint);
        unit.sprite.setPosition(startX, startY);
      },
    });
  }

  private resolveUnitAttack(unit: BattleUnit, target: BattleUnit | Tower, targetPoint: { x: number; y: number }): void {
    this.playAttackAnimation(unit, targetPoint);
    const card = CARD_BY_ID[unit.card];
    if (card.range > 72 || card.movement === 'flying') {
      this.addUnitProjectile(unit, target, targetPoint);
      void this.audio.playProjectile(unit.card);
      return;
    }

    this.damageTarget(target, unit.damage);
    void this.audio.playHit(unit.card);
    this.showHit(targetPoint.x, targetPoint.y, unit.side, card.archetype === 'brute' ? 'slam' : 'slash');
  }

  private addUnitProjectile(unit: BattleUnit, target: BattleUnit | Tower, targetPoint: { x: number; y: number }): void {
    const card = CARD_BY_ID[unit.card];
    const frame = card.archetype === 'spark' ? 2 : card.archetype === 'brute' ? 1 : 0;
    const impact = card.archetype === 'spark' ? 'electric' : 'burst';
    const shot = this.add.image(unit.sprite.x, unit.sprite.y, 'combat-vfx', frame).setDepth(9);
    const angle = Phaser.Math.Angle.Between(unit.sprite.x, unit.sprite.y, targetPoint.x, targetPoint.y);
    shot.setDisplaySize(card.archetype === 'spark' ? 34 : 42, card.archetype === 'spark' ? 34 : 42);
    shot.setRotation(angle);
    this.tweens.add({
      targets: shot,
      x: targetPoint.x,
      y: targetPoint.y,
      scale: 0.18,
      duration: card.archetype === 'spark' ? 190 : 240,
      ease: 'Quad.easeIn',
      onComplete: () => {
        shot.destroy();
        this.damageTarget(target, unit.damage);
        void this.audio.playHit(unit.card);
        this.showHit(targetPoint.x, targetPoint.y, unit.side, impact);
      },
    });
  }

  private updateTowers(time: number): void {
    this.towers
      .filter((tower) => tower.hp > 0)
      .forEach((tower) => {
        const target = this.findTowerTarget(tower);
        if (!target || time < tower.nextAttackAt) {
          return;
        }

        target.hp -= tower.damage;
        tower.nextAttackAt = time + tower.cooldown;
        void this.audio.playTowerShot();
        void this.audio.playProjectile('vanguard');
        this.addProjectile(tower.sprite.x, tower.sprite.y, target.sprite.x, target.sprite.y, tower.side);
      });
  }

  private findNearestTarget(unit: BattleUnit): BattleUnit | Tower | undefined {
    const enemyUnits = this.units.filter((candidate) => candidate.side !== unit.side && candidate.hp > 0);
    const directTarget = unit.directTargetId
      ? this.towers.find((tower) => tower.id === unit.directTargetId && tower.side !== unit.side && tower.hp > 0)
      : undefined;
    if (directTarget) {
      return directTarget;
    }

    const enemyTowers = this.getLegalTowerTargets(unit);
    const candidates: Array<BattleUnit | Tower> = [...enemyUnits, ...enemyTowers];

    return candidates.sort((a, b) => {
      const aPoint = this.getTargetPoint(a);
      const bPoint = this.getTargetPoint(b);
      return (
        Phaser.Math.Distance.Between(unit.sprite.x, unit.sprite.y, aPoint.x, aPoint.y) -
        Phaser.Math.Distance.Between(unit.sprite.x, unit.sprite.y, bPoint.x, bPoint.y)
      );
    })[0];
  }

  private getLegalTowerTargets(unit: BattleUnit): Tower[] {
    const enemySide = unit.side === 'player' ? 'enemy' : 'player';
    const enemyTowers = this.towers.filter((tower) => tower.side === enemySide && tower.hp > 0);
    const sideTowers = enemyTowers.filter((tower) => tower.name === 'Outpost');
    const localSideTower = sideTowers.find((tower) => this.isSameLane(unit.sprite.x, tower.sprite.x));

    if (localSideTower) {
      return [localSideTower];
    }

    return enemyTowers;
  }

  private isSameLane(unitX: number, towerX: number): boolean {
    return (unitX < WORLD_WIDTH / 2 && towerX < WORLD_WIDTH / 2) || (unitX >= WORLD_WIDTH / 2 && towerX >= WORLD_WIDTH / 2);
  }

  private findTowerTarget(tower: Tower): BattleUnit | undefined {
    return this.units
      .filter((unit) => unit.side !== tower.side && unit.hp > 0)
      .filter((unit) => Phaser.Math.Distance.Between(tower.sprite.x, tower.sprite.y, unit.sprite.x, unit.sprite.y) <= tower.range)
      .sort(
        (a, b) =>
          Phaser.Math.Distance.Between(tower.sprite.x, tower.sprite.y, a.sprite.x, a.sprite.y) -
          Phaser.Math.Distance.Between(tower.sprite.x, tower.sprite.y, b.sprite.x, b.sprite.y),
      )[0];
  }

  private getMovementTargetPoint(unit: BattleUnit, target: BattleUnit | Tower): { x: number; y: number } {
    const targetPoint = this.getTargetPoint(target);
    if (unit.movement === 'flying') {
      return targetPoint;
    }

    const unitIsBelowRiver = unit.sprite.y > RIVER_Y;
    const targetIsBelowRiver = targetPoint.y > RIVER_Y;
    if (unitIsBelowRiver === targetIsBelowRiver) {
      return targetPoint;
    }

    const bridgeX = this.getNearestBridgeX(targetPoint.x);
    const onBridgeLane = Math.abs(unit.sprite.x - bridgeX) <= BRIDGE_HALF_WIDTH;
    const hasCrossedRiver = unitIsBelowRiver ? unit.sprite.y < RIVER_Y - BRIDGE_CLEARANCE : unit.sprite.y > RIVER_Y + BRIDGE_CLEARANCE;

    if (!onBridgeLane) {
      return { x: bridgeX, y: unit.sprite.y };
    }

    if (!hasCrossedRiver) {
      return { x: bridgeX, y: unitIsBelowRiver ? RIVER_Y - BRIDGE_CLEARANCE : RIVER_Y + BRIDGE_CLEARANCE };
    }

    return targetPoint;
  }

  private getNearestBridgeX(x: number): number {
    return BRIDGE_CENTERS.reduce((best, bridgeX) => (Math.abs(bridgeX - x) < Math.abs(best - x) ? bridgeX : best), BRIDGE_CENTERS[0]);
  }

  private findClickedEnemyTower(x: number, y: number): Tower | undefined {
    return this.towers.find((tower) => {
      if (tower.side !== 'enemy' || tower.hp <= 0) {
        return false;
      }

      const size = tower.name === 'Citadel' ? 72 : 58;
      return Math.abs(tower.sprite.x - x) <= size / 2 && Math.abs(tower.sprite.y - y) <= size / 2;
    });
  }

  private damageTarget(target: BattleUnit | Tower, damage: number): void {
    target.hp -= damage;
    if ('hpText' in target) {
      this.updateTowerText(target);
      target.sprite.setAlpha(target.hp > 0 ? 1 : 0.35);
    }
  }

  private cleanupDefeated(): void {
    this.units = this.units.filter((unit) => {
      if (unit.hp > 0) {
        return true;
      }

      unit.sprite.destroy();
      unit.hpBar.destroy();
      return false;
    });
  }

  private checkBattleEnd(snapshotStatus: BattleStatus): void {
    const playerKing = this.towers.find((tower) => tower.id === 'player-king');
    const enemyKing = this.towers.find((tower) => tower.id === 'enemy-king');

    if (enemyKing && enemyKing.hp <= 0) {
      this.finishBattle('won');
      return;
    }
    if (playerKing && playerKing.hp <= 0) {
      this.finishBattle('lost');
      return;
    }
    if (snapshotStatus === 'draw') {
      const playerHp = this.towers.filter((tower) => tower.side === 'player').reduce((sum, tower) => sum + Math.max(0, tower.hp), 0);
      const enemyHp = this.towers.filter((tower) => tower.side === 'enemy').reduce((sum, tower) => sum + Math.max(0, tower.hp), 0);
      this.finishBattle(playerHp === enemyHp ? 'draw' : playerHp > enemyHp ? 'won' : 'lost');
    }
  }

  private finishBattle(result: BattleStatus): void {
    if (this.status !== 'playing') {
      return;
    }

    this.status = result;
    this.state.finish(result);
    this.audio.stopMusic();
    this.units.forEach((unit) => unit.sprite.setVelocity(0, 0));

    const title = document.querySelector('#message h1');
    const copy = document.querySelector('#message p');
    const button = document.getElementById('start-button');
    if (title) {
      title.textContent = result === 'won' ? 'Citadel Broken' : result === 'lost' ? 'Citadel Fell' : 'Stalemate';
    }
    if (copy) {
      copy.textContent =
        result === 'won'
          ? 'Your army punched through the rival line.'
          : result === 'lost'
            ? 'The rival force reached your citadel first.'
            : 'Both citadels held. Try a sharper deployment pattern.';
    }
    if (button) {
      button.textContent = 'Battle Again';
    }
    this.setMessageVisible(true);
    this.publishDevState();
    window.dispatchEvent(new CustomEvent('crownfall:battle-result', { detail: result }));
    window.setTimeout(() => {
      this.clearUnits();
      this.setMessageVisible(false);
      window.dispatchEvent(new CustomEvent('crownfall:navigate-home'));
      this.publishDevState();
    }, 1800);
  }

  private addArena(): void {
    this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 'arena-epic').setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT);

    const graphics = this.add.graphics();
    graphics.fillGradientStyle(0xb94d5d, 0xb94d5d, 0x3b8fca, 0x3b8fca, 0.14);
    graphics.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    graphics.fillStyle(0x0b111a, 0.12);
    graphics.fillRect(0, RIVER_Y - 88, WORLD_WIDTH, 176);
    graphics.lineStyle(3, 0xf6f2e8, 0.18);
    graphics.lineBetween(0, RIVER_Y, WORLD_WIDTH, RIVER_Y);

    graphics.lineStyle(2, 0x7cd3ff, 0.16);
    graphics.strokeRoundedRect(132, PLAYER_SIDE_MIN_Y, WORLD_WIDTH - 264, WORLD_HEIGHT - PLAYER_SIDE_MIN_Y - 72, 12);
  }

  private createTowers(): void {
    this.towers.forEach((tower) => {
      tower.sprite.destroy();
      tower.hpText.destroy();
    });
    this.towers = [
      this.createTower('enemy-left', 'enemy', 'Outpost', 260, 116, 420),
      this.createTower('enemy-king', 'enemy', 'Citadel', 480, 72, 720),
      this.createTower('enemy-right', 'enemy', 'Outpost', 700, 116, 420),
      this.createTower('player-left', 'player', 'Outpost', 260, 424, 420),
      this.createTower('player-king', 'player', 'Citadel', 480, 468, 720),
      this.createTower('player-right', 'player', 'Outpost', 700, 424, 420),
    ];
  }

  private createTower(id: string, side: Side, name: string, x: number, y: number, hp: number): Tower {
    const sprite = this.add.image(x, y, this.getTowerTexture(side, name));
    sprite.setDisplaySize(name === 'Citadel' ? 92 : 74, name === 'Citadel' ? 92 : 74).setDepth(3);
    const hpText = this.add
      .text(x, y + 42, String(hp), {
        color: '#ffffff',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '13px',
        fontStyle: '800',
      })
      .setOrigin(0.5)
      .setDepth(7);
    return {
      id,
      side,
      name,
      hp,
      maxHp: hp,
      range: name === 'Citadel' ? 180 : 150,
      damage: name === 'Citadel' ? 18 : 14,
      cooldown: name === 'Citadel' ? 720 : 840,
      nextAttackAt: 0,
      sprite,
      hpText,
    };
  }

  private getTowerTexture(side: Side, name: string): string {
    const towerKind = name === 'Citadel' ? 'citadel' : 'outpost';
    return `tower-${side}-${towerKind}`;
  }

  private updateTowerText(tower: Tower): void {
    tower.hpText.setText(String(Math.max(0, Math.ceil(tower.hp))));
  }

  private blendTint(base: number, overlay: number, amount: number): number {
    const baseColor = Phaser.Display.Color.ValueToColor(base);
    const overlayColor = Phaser.Display.Color.ValueToColor(overlay);
    const mix = (from: number, to: number) => Math.round(from + (to - from) * amount);
    return Phaser.Display.Color.GetColor(
      mix(baseColor.red, overlayColor.red),
      mix(baseColor.green, overlayColor.green),
      mix(baseColor.blue, overlayColor.blue),
    );
  }

  private getTargetPoint(target: BattleUnit | Tower): { x: number; y: number } {
    if ('sprite' in target) {
      return { x: target.sprite.x, y: target.sprite.y };
    }

    return { x: 0, y: 0 };
  }

  private addProjectile(fromX: number, fromY: number, toX: number, toY: number, side: Side): void {
    const shot = this.add.image(fromX, fromY, 'combat-vfx', 1).setDepth(9);
    shot.setDisplaySize(34, 34);
    shot.setTint(side === 'player' ? 0xbbefff : 0xffb3b3);
    shot.setRotation(Phaser.Math.Angle.Between(fromX, fromY, toX, toY));
    this.tweens.add({
      targets: shot,
      x: toX,
      y: toY,
      scale: 0.16,
      duration: 170,
      onComplete: () => {
        shot.destroy();
        this.showHit(toX, toY, side, 'burst');
      },
    });
  }

  private showHit(x: number, y: number, side: Side, kind: 'burst' | 'electric' | 'slam' | 'slash' = 'burst'): void {
    const frame = kind === 'electric' ? 4 : kind === 'slam' ? 5 : kind === 'slash' ? 3 : 3;
    const burst = this.add.image(x, y, 'combat-vfx', frame).setDepth(8);
    burst.setDisplaySize(kind === 'slam' ? 92 : 68, kind === 'slam' ? 92 : 68);
    burst.setTint(side === 'player' ? 0xffffff : 0xffc7c7);
    void this.audio.playExplosion(kind);
    this.tweens.add({
      targets: burst,
      scale: kind === 'slam' ? 0.32 : 0.24,
      alpha: 0,
      angle: Phaser.Math.Between(-18, 18),
      duration: kind === 'slam' ? 260 : 190,
      onComplete: () => burst.destroy(),
    });
  }

  private wireDomControls(): void {
    this.renderBattleDeck();
    document.getElementById('start-button')?.addEventListener('click', () => this.startBattle());
    window.addEventListener('crownfall:deck-updated', () => {
      this.activeDeck = getSavedDeck();
      this.selectedCard = this.activeDeck.includes(this.selectedCard) ? this.selectedCard : this.activeDeck[0];
      this.renderBattleDeck();
      this.updateHud(this.state.snapshot());
    });
  }

  private renderBattleDeck(): void {
    const deck = document.getElementById('deck');
    if (!deck) {
      return;
    }

    deck.innerHTML = this.getVisibleHand()
      .map((cardId) => {
        const card = CARD_BY_ID[cardId];
        return `<button class="card-button${cardId === this.selectedCard ? ' is-selected' : ''}" data-card="${card.id}" type="button">
          <span class="card-art" style="background-image: url('${getCardFrontUrl(cardId)}')" aria-hidden="true"></span>
          <span class="card-name">${card.name}</span>
          <strong>${card.cost}</strong>
        </button>`;
      })
      .join('');

    document.querySelectorAll<HTMLButtonElement>('.card-button').forEach((button) => {
      button.addEventListener('click', () => {
        const card = button.dataset.card as CardId | undefined;
        if (!card) {
          return;
        }
        this.selectCard(card);
      });
    });
  }

  private handleKeyboard(event: KeyboardEvent): void {
    const keyMap = Object.fromEntries(this.getVisibleHand().map((card, index) => [String(index + 1), card])) as Record<string, CardId>;
    const card = keyMap[event.key];
    if (card) {
      this.selectCard(card);
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      this.tryDeploy(WORLD_WIDTH / 2, WORLD_HEIGHT - 132);
    }
  }

  private selectCard(card: CardId): void {
    if (!this.getVisibleHand().includes(card)) {
      return;
    }

    this.selectedCard = card;
    document.querySelectorAll('.card-button').forEach((item) => {
      item.classList.toggle('is-selected', (item as HTMLButtonElement).dataset.card === card);
    });
  }

  private updateHud(snapshot: BattleSnapshot): void {
    this.setText('elixir', String(snapshot.elixir));
    this.setText('enemy-elixir', String(snapshot.enemyElixir));
    this.setText('time', this.formatTime(snapshot.timeRemaining));
    document.querySelectorAll<HTMLButtonElement>('.card-button').forEach((button) => {
      const card = button.dataset.card as CardId | undefined;
      if (card) {
        button.disabled = snapshot.status !== 'playing' || snapshot.elixir < CARD_BY_ID[card].cost;
      }
    });
  }

  private getVisibleHand(): CardId[] {
    return this.activeDeck.slice(0, this.handSize);
  }

  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${String(remainder).padStart(2, '0')}`;
  }

  private clearUnits(): void {
    this.units.forEach((unit) => {
      unit.sprite.destroy();
      unit.hpBar.destroy();
    });
    this.units = [];
    this.publishDevState();
  }

  private publishDevState(): void {
    const towerSummary = this.towers
      .map((tower) => `${tower.id}:${Math.max(0, Math.ceil(tower.hp))}`)
      .join(' ');
    window.dispatchEvent(
      new CustomEvent('crownfall:dev-state', {
        detail: {
          status: this.status,
          units: this.units.length,
          hand: this.getVisibleHand()
            .map((card) => CARD_BY_ID[card].name)
            .join(', '),
          towers: towerSummary || '-',
          infiniteElixir: this.state.hasInfiniteElixir(),
        },
      }),
    );
  }

  private showNotice(text: string): void {
    if (!this.notice) {
      return;
    }

    this.notice.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.notice);
    this.tweens.add({
      targets: this.notice,
      alpha: 0,
      duration: 900,
      delay: 350,
    });
  }

  private setText(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  private setMessageVisible(visible: boolean): void {
    document.getElementById('message')?.classList.toggle('is-hidden', !visible);
  }

}
