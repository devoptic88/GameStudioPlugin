import type { CardId } from '../data/cards';

export interface NetworkDeployPayload {
  unitId: string;
  card: CardId;
  x: number;
  y: number;
  directTargetId?: string;
}

export interface NetworkUnitSnapshot {
  unitId: string;
  x: number;
  y: number;
  hp: number;
}

export interface NetworkSyncPayload {
  units: NetworkUnitSnapshot[];
}

type ServerMessage =
  | { type: 'connected' }
  | { type: 'waiting' }
  | { type: 'match-found'; player: 1 | 2; matchId: string }
  | { type: 'opponent-left' }
  | ({ type: 'deploy' } & NetworkDeployPayload)
  | ({ type: 'sync' } & NetworkSyncPayload);

export class NetworkClient {
  private socket?: WebSocket;
  private online = false;

  connect(): void {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      this.joinQueue();
      return;
    }

    const url = import.meta.env.VITE_MULTIPLAYER_URL ?? this.defaultServerUrl();
    if (window.location.protocol === 'https:' && url.startsWith('ws://')) {
      this.setStatus('Needs wss:// server');
      return;
    }

    this.setStatus('Connecting...');
    try {
      this.socket = new WebSocket(url);
    } catch {
      this.setStatus('Connection failed');
      return;
    }

    this.socket.addEventListener('open', () => this.joinQueue());
    this.socket.addEventListener('message', (event) => this.handleMessage(event.data));
    this.socket.addEventListener('close', () => {
      this.online = false;
      this.setStatus('Offline');
      window.dispatchEvent(new CustomEvent('crownfall:network-offline'));
    });
    this.socket.addEventListener('error', () => {
      this.setStatus('Server offline');
    });
  }

  leave(): void {
    this.online = false;
    this.socket?.send(JSON.stringify({ type: 'leave' }));
    this.setStatus('Offline');
  }

  sendDeploy(payload: NetworkDeployPayload): void {
    this.sendOnlineMessage({ type: 'deploy', ...payload });
  }

  sendSync(payload: NetworkSyncPayload): void {
    this.sendOnlineMessage({ type: 'sync', ...payload });
  }

  private sendOnlineMessage(message: ServerMessage): void {
    if (!this.online || this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  private joinQueue(): void {
    this.socket?.send(JSON.stringify({ type: 'join' }));
    this.setStatus('Finding opponent...');
  }

  private defaultServerUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.hostname}:8787`;
  }

  private handleMessage(raw: string): void {
    const message = JSON.parse(raw) as ServerMessage;
    switch (message.type) {
      case 'connected':
        this.setStatus('Connected');
        break;
      case 'waiting':
        this.setStatus('Waiting for opponent - open another browser');
        break;
      case 'match-found':
        this.online = true;
        this.setStatus(`Online Match P${message.player}`);
        window.dispatchEvent(new CustomEvent('crownfall:network-start', { detail: { player: message.player, matchId: message.matchId } }));
        break;
      case 'opponent-left':
        this.online = false;
        this.setStatus('Opponent left');
        window.dispatchEvent(new CustomEvent('crownfall:network-opponent-left'));
        break;
      case 'deploy':
        window.dispatchEvent(new CustomEvent<NetworkDeployPayload>('crownfall:network-deploy-remote', { detail: message }));
        break;
      case 'sync':
        window.dispatchEvent(new CustomEvent<NetworkSyncPayload>('crownfall:network-sync-remote', { detail: message }));
        break;
    }
  }

  private setStatus(status: string): void {
    window.dispatchEvent(new CustomEvent('crownfall:network-status', { detail: status }));
  }
}
