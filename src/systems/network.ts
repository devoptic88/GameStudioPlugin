import type { CardId } from '../data/cards';

export interface NetworkDeployPayload {
  card: CardId;
  x: number;
  y: number;
  directTargetId?: string;
}

type ServerMessage =
  | { type: 'connected' }
  | { type: 'waiting' }
  | { type: 'match-found'; player: 1 | 2; matchId: string }
  | { type: 'opponent-left' }
  | ({ type: 'deploy' } & NetworkDeployPayload);

export class NetworkClient {
  private socket?: WebSocket;
  private online = false;

  connect(): void {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      this.joinQueue();
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.hostname}:8787`;
    this.setStatus('Connecting...');
    this.socket = new WebSocket(url);

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
    if (!this.online || this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify({ type: 'deploy', ...payload }));
  }

  private joinQueue(): void {
    this.socket?.send(JSON.stringify({ type: 'join' }));
    this.setStatus('Finding opponent...');
  }

  private handleMessage(raw: string): void {
    const message = JSON.parse(raw) as ServerMessage;
    switch (message.type) {
      case 'connected':
        this.setStatus('Connected');
        break;
      case 'waiting':
        this.setStatus('Waiting for opponent');
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
    }
  }

  private setStatus(status: string): void {
    window.dispatchEvent(new CustomEvent('crownfall:network-status', { detail: status }));
  }
}
