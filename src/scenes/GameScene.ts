import Phaser from 'phaser';
import { AudioDirector } from '../systems/audio';
import { BattleSnapshot, BattleState, BattleStatus } from '../systems/gameState';
import bruteBackUrl from '../assets/characters/brute-back.png';
import bruteUrl from '../assets/characters/brute.png';
import arenaUrl from '../assets/environment/arena-epic.png';
import rangerBackUrl from '../assets/characters/ranger-back.png';
import rangerUrl from '../assets/characters/ranger.png';
import sparkBackUrl from '../assets/characters/spark-back.png';
import sparkUrl from '../assets/characters/spark.png';
import vanguardBackUrl from '../assets/characters/vanguard-back.png';
import vanguardUrl from '../assets/characters/vanguard.png';

const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 540;
const RIVER_Y = 270;
const PLAYER_SIDE_MIN_Y = RIVER_Y + 32;
const BRIDGE_CENTERS = [308, 652];
const BRIDGE_HALF_WIDTH = 48;
const BRIDGE_CLEARANCE = 32;

type Side = 'player' | 'enemy';
export type CardId = 'vanguard' | 'ranger' | 'brute' | 'spark';
type MovementType = 'ground' | 'flying';

interface UnitStats {
  key: string;
  name: string;
  cost: number;
  hp: number;
  damage: number;
  range: number;
  speed: number;
  cooldown: number;
  frontTexture: string;
  backTexture: string;
  spriteSize: number;
  artUrl: string;
  backArtUrl: string;
  movement: MovementType;
}

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
  sprite: Phaser.GameObjects.Rectangle;
  hpText: Phaser.GameObjects.Text;
}

const CARD_STATS: Record<CardId, UnitStats> = {
  vanguard: {
    key: 'vanguard',
    name: 'Vanguard',
    cost: 3,
    hp: 130,
    damage: 18,
    range: 28,
    speed: 58,
    cooldown: 850,
    frontTexture: 'unit-vanguard-front',
    backTexture: 'unit-vanguard-back',
    spriteSize: 92,
    artUrl: vanguardUrl,
    backArtUrl: vanguardBackUrl,
    movement: 'ground',
  },
  ranger: {
    key: 'ranger',
    name: 'Ranger',
    cost: 4,
    hp: 80,
    damage: 15,
    range: 150,
    speed: 50,
    cooldown: 700,
    frontTexture: 'unit-ranger-front',
    backTexture: 'unit-ranger-back',
    spriteSize: 86,
    artUrl: rangerUrl,
    backArtUrl: rangerBackUrl,
    movement: 'ground',
  },
  brute: {
    key: 'brute',
    name: 'Brute',
    cost: 5,
    hp: 230,
    damage: 32,
    range: 32,
    speed: 38,
    cooldown: 1100,
    frontTexture: 'unit-brute-front',
    backTexture: 'unit-brute-back',
    spriteSize: 108,
    artUrl: bruteUrl,
    backArtUrl: bruteBackUrl,
    movement: 'ground',
  },
  spark: {
    key: 'spark',
    name: 'Spark',
    cost: 2,
    hp: 58,
    damage: 20,
    range: 95,
    speed: 85,
    cooldown: 780,
    frontTexture: 'unit-spark-front',
    backTexture: 'unit-spark-back',
    spriteSize: 88,
    artUrl: sparkUrl,
    backArtUrl: sparkBackUrl,
    movement: 'flying',
  },
};

export class GameScene extends Phaser.Scene {
  private state = new BattleState();
  private selectedCard: CardId = 'vanguard';
  private status: BattleStatus = 'ready';
  private units: BattleUnit[] = [];
  private towers: Tower[] = [];
  private audio = new AudioDirector();
  private nextUnitId = 1;
  private enemyPlanAt = 0;
  private notice?: Phaser.GameObjects.Text;

  constructor() {
    super('game');
  }

  preload(): void {
    this.load.image('arena-epic', arenaUrl);
    this.load.image('unit-vanguard-front', vanguardUrl);
    this.load.image('unit-vanguard-back', vanguardBackUrl);
    this.load.image('unit-ranger-front', rangerUrl);
    this.load.image('unit-ranger-back', rangerBackUrl);
    this.load.image('unit-brute-front', bruteUrl);
    this.load.image('unit-brute-back', bruteBackUrl);
    this.load.image('unit-spark-front', sparkUrl);
    this.load.image('unit-spark-back', sparkBackUrl);
  }

  create(): void {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.addArena();
    this.createTowers();
    this.wireDomControls();
    document.addEventListener('pointerdown', (event) => this.tryDeployFromCanvas(event));
    document.addEventListener('mousedown', (event) => this.tryDeployFromCanvas(event));
    document.addEventListener('keydown', (event) => this.handleKeyboard(event));
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
  }

  update(time: number, delta: number): void {
    if (this.status !== 'playing') {
      return;
    }

    const deltaSeconds = delta / 1000;
    const snapshot = this.state.update(deltaSeconds);
    this.updateHud(snapshot);
    this.planEnemyDeploy(time);
    this.updateUnits(time, deltaSeconds);
    this.updateTowers(time);
    this.cleanupDefeated();
    this.checkBattleEnd(snapshot.status);
  }

  private startBattle(): void {
    void this.audio.startMusic();
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
    const stats = CARD_STATS[this.selectedCard];
    if (!this.state.canSpend(stats.cost)) {
      this.showNotice('Need more elixir');
      return;
    }

    this.state.spend(stats.cost);
    this.spawnUnit('player', this.selectedCard, x, y, directTargetId);
    this.updateHud(this.state.snapshot());
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

    const options: CardId[] = ['vanguard', 'ranger', 'brute', 'spark'];
    const affordable = options.filter((card) => this.state.canEnemySpend(CARD_STATS[card].cost));
    if (affordable.length > 0) {
      const card = Phaser.Utils.Array.GetRandom(affordable);
      const laneX = Phaser.Math.RND.pick([308, 480, 652]);
      this.state.spendEnemy(CARD_STATS[card].cost);
      this.spawnUnit('enemy', card, laneX + Phaser.Math.Between(-24, 24), Phaser.Math.Between(104, 210));
    }

    this.enemyPlanAt = time + Phaser.Math.Between(1600, 2800);
  }

  private spawnUnit(side: Side, card: CardId, x: number, y: number, directTargetId?: string): void {
    const stats = CARD_STATS[card];
    const sprite = this.physics.add.sprite(x, y, side === 'player' ? stats.backTexture : stats.frontTexture);
    sprite.setDepth(5);
    sprite.setTint(side === 'player' ? 0xffffff : 0xffa3a3);
    sprite.setDisplaySize(stats.spriteSize, stats.spriteSize);
    sprite.setCircle(38, 26, 48);
    sprite.setCollideWorldBounds(true);

    const hpBar = this.add.rectangle(x, y - stats.spriteSize * 0.34, 40, 5, side === 'player' ? 0x7cd3ff : 0xf25f5c).setDepth(7);
    this.units.push({
      id: this.nextUnitId,
      side,
      card,
      hp: stats.hp,
      maxHp: stats.hp,
      damage: stats.damage,
      range: stats.range,
      speed: stats.speed,
      cooldown: stats.cooldown,
      nextAttackAt: 0,
      movement: stats.movement,
      directTargetId,
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
          this.damageTarget(target, unit.damage);
          void this.audio.playHit(unit.card);
          unit.nextAttackAt = time + unit.cooldown;
          this.playAttackAnimation(unit, actualTargetPoint);
          this.showHit(unit.sprite.x, unit.sprite.y, unit.side);
        }
      } else {
        const angle = Phaser.Math.Angle.Between(unit.sprite.x, unit.sprite.y, movementPoint.x, movementPoint.y);
        this.physics.velocityFromRotation(angle, unit.speed, unit.sprite.body?.velocity);
      }

      this.updateUnitAnimation(unit, time);
      unit.hpBar.setPosition(unit.sprite.x, unit.sprite.y - CARD_STATS[unit.card].spriteSize * 0.34);
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

    const enemyTowers = this.getLegalTowerTargets(unit.side);
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

  private getLegalTowerTargets(attackerSide: Side): Tower[] {
    const enemySide = attackerSide === 'player' ? 'enemy' : 'player';
    const sideTowers = this.towers.filter((tower) => tower.side === enemySide && tower.name === 'Outpost' && tower.hp > 0);
    if (sideTowers.length > 0) {
      return sideTowers;
    }

    return this.towers.filter((tower) => tower.side === enemySide && tower.hp > 0);
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
    const color = side === 'player' ? 0x3b8fca : 0xb94d5d;
    const sprite = this.add.rectangle(x, y, name === 'Citadel' ? 62 : 48, name === 'Citadel' ? 62 : 48, color);
    sprite.setStrokeStyle(3, 0xf6f2e8, 0.72).setDepth(3);
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

  private updateTowerText(tower: Tower): void {
    tower.hpText.setText(String(Math.max(0, Math.ceil(tower.hp))));
  }

  private getTargetPoint(target: BattleUnit | Tower): { x: number; y: number } {
    if ('sprite' in target) {
      return { x: target.sprite.x, y: target.sprite.y };
    }

    return { x: 0, y: 0 };
  }

  private addProjectile(fromX: number, fromY: number, toX: number, toY: number, side: Side): void {
    const shot = this.add.circle(fromX, fromY, 5, side === 'player' ? 0x7cd3ff : 0xffb3b3).setDepth(9);
    this.tweens.add({
      targets: shot,
      x: toX,
      y: toY,
      alpha: 0.2,
      duration: 170,
      onComplete: () => shot.destroy(),
    });
  }

  private showHit(x: number, y: number, side: Side): void {
    const burst = this.add.circle(x, y, 12, side === 'player' ? 0x7cd3ff : 0xff7676, 0.45).setDepth(8);
    this.tweens.add({
      targets: burst,
      scale: 1.8,
      alpha: 0,
      duration: 180,
      onComplete: () => burst.destroy(),
    });
  }

  private wireDomControls(): void {
    document.getElementById('start-button')?.addEventListener('click', () => this.startBattle());
    document.querySelectorAll<HTMLButtonElement>('.card-button').forEach((button) => {
      const cardForArt = button.dataset.card as CardId | undefined;
      const art = cardForArt ? CARD_STATS[cardForArt].artUrl : undefined;
      const artNode = button.querySelector<HTMLElement>('.card-art');
      if (art && artNode) {
        artNode.style.backgroundImage = `url("${art}")`;
      }

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
    const keyMap: Record<string, CardId> = {
      '1': 'vanguard',
      '2': 'ranger',
      '3': 'brute',
      '4': 'spark',
    };
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
        button.disabled = snapshot.status !== 'playing' || snapshot.elixir < CARD_STATS[card].cost;
      }
    });
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
