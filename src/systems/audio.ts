import { CARD_BY_ID, type CardArchetype, type CardId } from '../data/cards';

const SPAWN_NOTES: Record<CardArchetype, number[]> = {
  vanguard: [196, 247, 294],
  ranger: [330, 392, 494],
  brute: [98, 123, 147],
  spark: [523, 659, 784],
};

const HIT_NOTES: Record<CardArchetype, { frequency: number; type: OscillatorType; duration: number }> = {
  vanguard: { frequency: 180, type: 'square', duration: 0.12 },
  ranger: { frequency: 620, type: 'triangle', duration: 0.08 },
  brute: { frequency: 82, type: 'sawtooth', duration: 0.18 },
  spark: { frequency: 920, type: 'sine', duration: 0.1 },
};

export class AudioDirector {
  private context?: AudioContext;
  private master?: GainNode;
  private musicBus?: GainNode;
  private effectsBus?: GainNode;
  private musicTimer?: number;
  private beat = 0;

  async startMusic(): Promise<void> {
    await this.ensureContext();
    if (!this.context || this.musicTimer) {
      return;
    }

    this.beat = 0;
    this.scheduleMusicBeat();
    this.musicTimer = window.setInterval(() => this.scheduleMusicBeat(), 420);
  }

  stopMusic(): void {
    if (this.musicTimer) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = undefined;
    }
  }

  async playSpawn(card: CardId): Promise<void> {
    await this.ensureContext();
    if (!this.context || !this.effectsBus) {
      return;
    }

    const now = this.context.currentTime;
    const archetype = CARD_BY_ID[card].archetype;
    SPAWN_NOTES[archetype].forEach((frequency, index) => {
      this.playTone({
        frequency,
        startTime: now + index * 0.045,
        duration: archetype === 'brute' ? 0.18 : 0.13,
        volume: archetype === 'brute' ? 0.11 : 0.075,
        type: archetype === 'spark' ? 'sine' : archetype === 'ranger' ? 'triangle' : 'square',
        destination: this.effectsBus!,
      });
    });

    if (archetype === 'brute') {
      this.playNoise(now, 0.18, 0.08, 900);
    }
  }

  async playHit(card: CardId): Promise<void> {
    await this.ensureContext();
    if (!this.context || !this.effectsBus) {
      return;
    }

    const archetype = CARD_BY_ID[card].archetype;
    const hit = HIT_NOTES[archetype];
    const now = this.context.currentTime;
    this.playTone({
      frequency: hit.frequency,
      startTime: now,
      duration: hit.duration,
      volume: archetype === 'brute' ? 0.14 : 0.09,
      type: hit.type,
      destination: this.effectsBus,
      endFrequency: archetype === 'spark' ? hit.frequency * 1.8 : hit.frequency * 0.72,
    });

    if (archetype === 'ranger') {
      this.playTone({
        frequency: 1240,
        startTime: now + 0.03,
        duration: 0.045,
        volume: 0.05,
        type: 'sine',
        destination: this.effectsBus,
      });
    }

    if (archetype === 'brute' || archetype === 'vanguard') {
      this.playNoise(now, archetype === 'brute' ? 0.22 : 0.1, archetype === 'brute' ? 0.1 : 0.045, archetype === 'brute' ? 520 : 1200);
    }
  }

  async playTowerShot(): Promise<void> {
    await this.ensureContext();
    if (!this.context || !this.effectsBus) {
      return;
    }

    const now = this.context.currentTime;
    this.playTone({
      frequency: 260,
      startTime: now,
      duration: 0.08,
      volume: 0.055,
      type: 'square',
      destination: this.effectsBus,
      endFrequency: 180,
    });
  }

  async playProjectile(card: CardId): Promise<void> {
    await this.ensureContext();
    if (!this.context || !this.effectsBus) {
      return;
    }

    const archetype = CARD_BY_ID[card].archetype;
    const now = this.context.currentTime;
    const frequency = archetype === 'spark' ? 980 : archetype === 'ranger' ? 720 : archetype === 'brute' ? 120 : 360;
    this.playTone({
      frequency,
      startTime: now,
      duration: archetype === 'spark' ? 0.16 : 0.1,
      volume: 0.055,
      type: archetype === 'spark' ? 'sine' : 'triangle',
      destination: this.effectsBus,
      endFrequency: archetype === 'spark' ? frequency * 1.4 : frequency * 0.66,
    });
  }

  async playExplosion(kind: 'burst' | 'electric' | 'slam' | 'slash'): Promise<void> {
    await this.ensureContext();
    if (!this.context || !this.effectsBus) {
      return;
    }

    const now = this.context.currentTime;
    if (kind === 'electric') {
      this.playTone({ frequency: 1180, startTime: now, duration: 0.08, volume: 0.075, type: 'sine', destination: this.effectsBus, endFrequency: 1620 });
      this.playNoise(now, 0.08, 0.035, 2400);
      return;
    }

    if (kind === 'slam') {
      this.playTone({ frequency: 72, startTime: now, duration: 0.22, volume: 0.15, type: 'sawtooth', destination: this.effectsBus, endFrequency: 42 });
      this.playNoise(now, 0.24, 0.12, 420);
      return;
    }

    this.playNoise(now, kind === 'slash' ? 0.08 : 0.14, kind === 'slash' ? 0.04 : 0.075, kind === 'slash' ? 1800 : 780);
  }

  private async ensureContext(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.musicBus = this.context.createGain();
      this.effectsBus = this.context.createGain();

      this.master.gain.value = 0.58;
      this.musicBus.gain.value = 0.2;
      this.effectsBus.gain.value = 0.42;

      this.musicBus.connect(this.master);
      this.effectsBus.connect(this.master);
      this.master.connect(this.context.destination);
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  private scheduleMusicBeat(): void {
    if (!this.context || !this.musicBus) {
      return;
    }

    const now = this.context.currentTime;
    const bassPattern = [73, 73, 98, 87, 65, 65, 87, 98];
    const bellPattern = [294, 392, 330, 440, 294, 392, 494, 440];
    const step = this.beat % bassPattern.length;

    this.playTone({
      frequency: bassPattern[step],
      startTime: now,
      duration: 0.34,
      volume: step % 2 === 0 ? 0.095 : 0.065,
      type: 'sawtooth',
      destination: this.musicBus,
      endFrequency: bassPattern[step] * 0.98,
    });

    if (step % 2 === 0) {
      this.playTone({
        frequency: bellPattern[step],
        startTime: now + 0.05,
        duration: 0.18,
        volume: 0.035,
        type: 'triangle',
        destination: this.musicBus,
      });
    }

    if (step === 0 || step === 4) {
      this.playNoise(now, 0.12, 0.035, 700);
    }

    this.beat += 1;
  }

  private playTone({
    frequency,
    startTime,
    duration,
    volume,
    type,
    destination,
    endFrequency,
  }: {
    frequency: number;
    startTime: number;
    duration: number;
    volume: number;
    type: OscillatorType;
    destination: AudioNode;
    endFrequency?: number;
  }): void {
    if (!this.context) {
      return;
    }

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), startTime + duration);
    }

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
  }

  private playNoise(startTime: number, duration: number, volume: number, cutoff: number): void {
    if (!this.context || !this.effectsBus) {
      return;
    }

    const sampleCount = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, sampleCount, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < sampleCount; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / sampleCount);
    }

    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.effectsBus);
    source.start(startTime);
  }
}
