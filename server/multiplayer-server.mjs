import { WebSocket, WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8787);
const SEARCH_TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS ?? 30000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS ?? 15000);
const wss = new WebSocketServer({ port: PORT });
const waiting = [];
const matches = new Map();

function now() {
  return Date.now();
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function removeWaiting(socket) {
  const index = waiting.findIndex((entry) => entry.socket === socket);
  if (index !== -1) {
    windowClearTimeout(waiting[index].timeout);
    waiting.splice(index, 1);
  }
}

function windowClearTimeout(timeout) {
  if (timeout) {
    clearTimeout(timeout);
  }
}

function pruneWaiting() {
  for (let index = waiting.length - 1; index >= 0; index -= 1) {
    const entry = waiting[index];
    if (entry.socket.readyState !== WebSocket.OPEN || now() - entry.queuedAt >= SEARCH_TIMEOUT_MS) {
      windowClearTimeout(entry.timeout);
      waiting.splice(index, 1);
      if (entry.socket.readyState === WebSocket.OPEN) {
        send(entry.socket, { type: 'search-timeout' });
      }
    }
  }
}

function closeMatch(socket) {
  const match = matches.get(socket);
  if (!match) {
    return;
  }

  const other = match.players.find((player) => player !== socket);
  matches.delete(socket);
  if (other) {
    matches.delete(other);
    send(other, { type: 'opponent-left' });
  }
}

function createMatch(playerA, playerB) {
  const matchId = `match-${Date.now()}-${Math.round(Math.random() * 9999)}`;
  const match = { id: matchId, players: [playerA, playerB] };
  matches.set(playerA, match);
  matches.set(playerB, match);
  send(playerA, { type: 'match-found', matchId, player: 1 });
  send(playerB, { type: 'match-found', matchId, player: 2 });
}

function queue(socket) {
  pruneWaiting();
  if (matches.has(socket) || waiting.some((entry) => entry.socket === socket)) {
    return;
  }

  const opponent = waiting.shift();
  if (opponent) {
    windowClearTimeout(opponent.timeout);
  }
  if (opponent?.socket.readyState === WebSocket.OPEN) {
    createMatch(opponent.socket, socket);
    return;
  }

  const timeout = setTimeout(() => {
    removeWaiting(socket);
    send(socket, { type: 'search-timeout' });
  }, SEARCH_TIMEOUT_MS);
  waiting.push({ socket, queuedAt: now(), timeout });
  send(socket, { type: 'waiting' });
}

wss.on('connection', (socket) => {
  socket.isAlive = true;
  send(socket, { type: 'connected' });

  socket.on('pong', () => {
    socket.isAlive = true;
  });

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (message.type === 'join') {
      queue(socket);
      return;
    }

    if (message.type === 'leave') {
      closeMatch(socket);
      removeWaiting(socket);
      send(socket, { type: 'connected' });
      return;
    }

    const match = matches.get(socket);
    if (!match) {
      return;
    }

    const opponent = match.players.find((player) => player !== socket);
    if (opponent && opponent.readyState === WebSocket.OPEN) {
      send(opponent, message);
    }
  });

  socket.on('close', () => {
    removeWaiting(socket);
    closeMatch(socket);
  });
});

const heartbeat = setInterval(() => {
  wss.clients.forEach((socket) => {
    if (!socket.isAlive) {
      removeWaiting(socket);
      closeMatch(socket);
      socket.terminate();
      return;
    }

    socket.isAlive = false;
    socket.ping();
  });
  pruneWaiting();
}, HEARTBEAT_INTERVAL_MS);

wss.on('close', () => {
  clearInterval(heartbeat);
  waiting.forEach((entry) => windowClearTimeout(entry.timeout));
  waiting.length = 0;
});

console.log(
  `Crownfall multiplayer server listening on ws://localhost:${PORT} with ${Math.round(SEARCH_TIMEOUT_MS / 1000)}s search timeout`,
);
