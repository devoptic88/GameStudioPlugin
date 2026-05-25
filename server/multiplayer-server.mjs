import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8787);
const wss = new WebSocketServer({ port: PORT });
const waiting = [];
const matches = new Map();

function send(socket, message) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function removeWaiting(socket) {
  const index = waiting.indexOf(socket);
  if (index !== -1) {
    waiting.splice(index, 1);
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
    waiting.push(other);
    send(other, { type: 'waiting' });
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
  if (matches.has(socket) || waiting.includes(socket)) {
    return;
  }

  const opponent = waiting.shift();
  if (opponent && opponent.readyState === opponent.OPEN) {
    createMatch(opponent, socket);
    return;
  }

  waiting.push(socket);
  send(socket, { type: 'waiting' });
}

wss.on('connection', (socket) => {
  send(socket, { type: 'connected' });

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
    if (opponent && opponent.readyState === opponent.OPEN) {
      send(opponent, message);
    }
  });

  socket.on('close', () => {
    removeWaiting(socket);
    closeMatch(socket);
  });
});

console.log(`Crownfall multiplayer server listening on ws://localhost:${PORT}`);
