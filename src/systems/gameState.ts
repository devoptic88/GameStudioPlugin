export type BattleStatus = 'ready' | 'playing' | 'won' | 'lost' | 'draw';

export interface BattleSnapshot {
  elixir: number;
  enemyElixir: number;
  timeRemaining: number;
  status: BattleStatus;
}

export class BattleState {
  private readonly maxElixir = 10;
  private readonly matchLength = 180;
  private readonly elixirPerSecond = 0.42;
  private elapsed = 0;
  private elixir = 5;
  private enemyElixir = 5;
  private status: BattleStatus = 'ready';
  private infiniteElixir = false;

  start(): BattleSnapshot {
    this.elapsed = 0;
    this.elixir = 5;
    this.enemyElixir = 5;
    this.status = 'playing';
    return this.snapshot();
  }

  update(deltaSeconds: number): BattleSnapshot {
    if (this.status !== 'playing') {
      return this.snapshot();
    }

    this.elapsed += deltaSeconds;
    this.elixir = this.infiniteElixir ? this.maxElixir : Math.min(this.maxElixir, this.elixir + deltaSeconds * this.elixirPerSecond);
    this.enemyElixir = Math.min(this.maxElixir, this.enemyElixir + deltaSeconds * this.elixirPerSecond * 0.9);

    if (this.elapsed >= this.matchLength) {
      this.status = 'draw';
    }

    return this.snapshot();
  }

  canSpend(cost: number): boolean {
    return this.status === 'playing' && this.elixir >= cost;
  }

  spend(cost: number): BattleSnapshot {
    if (this.canSpend(cost)) {
      this.elixir = this.infiniteElixir ? this.maxElixir : this.elixir - cost;
    }

    return this.snapshot();
  }

  canEnemySpend(cost: number): boolean {
    return this.status === 'playing' && this.enemyElixir >= cost;
  }

  spendEnemy(cost: number): BattleSnapshot {
    if (this.canEnemySpend(cost)) {
      this.enemyElixir -= cost;
    }

    return this.snapshot();
  }

  addElixir(amount: number): BattleSnapshot {
    this.elixir = Math.min(this.maxElixir, this.elixir + amount);
    return this.snapshot();
  }

  addEnemyElixir(amount: number): BattleSnapshot {
    this.enemyElixir = Math.min(this.maxElixir, this.enemyElixir + amount);
    return this.snapshot();
  }

  setInfiniteElixir(enabled: boolean): BattleSnapshot {
    this.infiniteElixir = enabled;
    if (enabled) {
      this.elixir = this.maxElixir;
    }
    return this.snapshot();
  }

  hasInfiniteElixir(): boolean {
    return this.infiniteElixir;
  }

  finish(status: BattleStatus): BattleSnapshot {
    this.status = status;
    return this.snapshot();
  }

  snapshot(): BattleSnapshot {
    return {
      elixir: Math.floor(this.elixir),
      enemyElixir: Math.floor(this.enemyElixir),
      timeRemaining: Math.max(0, Math.ceil(this.matchLength - this.elapsed)),
      status: this.status,
    };
  }
}
