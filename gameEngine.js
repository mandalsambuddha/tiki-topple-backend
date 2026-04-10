// ============================================================
//  Tiki Topple – Core Game Engine
//  All mandatory rules from the hackathon spec are enforced.
// ============================================================

const TIKIS = [
  { id: "red",    name: "Red Tiki",    emoji: "🗿", color: "#e74c3c" },
  { id: "blue",   name: "Blue Tiki",   emoji: "🪆", color: "#3498db" },
  { id: "green",  name: "Green Tiki",  emoji: "🌿", color: "#2ecc71" },
  { id: "yellow", name: "Yellow Tiki", emoji: "⭐", color: "#f1c40f" },
  { id: "purple", name: "Purple Tiki", emoji: "💜", color: "#9b59b6" },
  { id: "orange", name: "Orange Tiki", emoji: "🔥", color: "#e67e22" },
  { id: "pink",   name: "Pink Tiki",   emoji: "🌸", color: "#e91e8c" },
  { id: "teal",   name: "Teal Tiki",   emoji: "🌊", color: "#1abc9c" },
  { id: "brown",  name: "Brown Tiki",  emoji: "🌴", color: "#795548" },
];

const BOARD_SIZE = 35;      // track positions 0–35
const MAX_TURNS  = 30;      // game ends after this many total turns
const SCORE_MAP  = [10, 8, 6, 5, 4, 3, 2, 1, 0]; // rank 1→9

// ── helpers ──────────────────────────────────────────────────

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Returns a snapshot of the public game state (safe to send to clients) */
function buildStateSnapshot(game) {
  return {
    gameId:       game.gameId,
    status:       game.status,          // "waiting" | "active" | "finished"
    turn:         game.turn,
    currentPlayerIndex: game.currentPlayerIndex,
    currentPlayerId: game.players[game.currentPlayerIndex]?.id ?? null,
    players:      game.players.map(p => ({
      id:    p.id,
      name:  p.name,
      color: p.color,
      score: p.score,
      tikis: p.tikis,                   // which tiki IDs belong to this player
    })),
    stack:        game.stack,           // array of tikiId strings, index 0 = top
    boardPositions: game.boardPositions, // { tikiId: position }
    maxTurns:     MAX_TURNS,
    boardSize:    BOARD_SIZE,
    tikisData:    TIKIS,
    lastAction:   game.lastAction,
    winner:       game.winner ?? null,
    finalRanking: game.finalRanking ?? null,
  };
}

/** Rank tokens by board position descending. Tie‑break: original stack order (lower = higher) */
function rankTokens(boardPositions, stack) {
  const tikis = Object.keys(boardPositions);
  return [...tikis].sort((a, b) => {
    const posDiff = boardPositions[b] - boardPositions[a];
    if (posDiff !== 0) return posDiff;
    // tie‑break by current stack position (lower index = higher in stack = better)
    return stack.indexOf(a) - stack.indexOf(b);
  });
}

function computeScores(game) {
  const ranked = rankTokens(game.boardPositions, game.stack);
  const playerScores = {};
  game.players.forEach(p => { playerScores[p.id] = 0; });

  ranked.forEach((tikId, i) => {
    const owner = game.players.find(p => p.tikis.includes(tikId));
    if (owner) {
      playerScores[owner.id] += (SCORE_MAP[i] ?? 0);
    }
  });

  return { playerScores, ranked };
}

// ── Game Factory ─────────────────────────────────────────────

function createGame(gameId, playerNames) {
  if (playerNames.length < 2 || playerNames.length > 4) {
    throw new Error("Tiki Topple requires 2–4 players.");
  }

  // Assign tikis evenly (9 tikis ÷ up to 4 players)
  const shuffledTikis = [...TIKIS].sort(() => Math.random() - 0.5);
  const playerColors  = ["#e74c3c","#3498db","#2ecc71","#f1c40f"];

  const players = playerNames.map((name, i) => ({
    id:    `player_${i + 1}`,
    name,
    color: playerColors[i],
    tikis: [],
    score: 0,
  }));

  // Distribute 9 tikis round‑robin
  shuffledTikis.forEach((tik, i) => {
    players[i % players.length].tikis.push(tik.id);
  });

  // All tikis start in a single stack at position 0 (locked rule)
  const stack = shuffledTikis.map(t => t.id);
  const boardPositions = {};
  stack.forEach(id => { boardPositions[id] = 0; });

  return {
    gameId,
    status: "active",
    turn:   1,
    currentPlayerIndex: 0,
    players,
    stack,                  // index 0 = top of stack
    boardPositions,
    maxTurns: MAX_TURNS,
    lastAction: null,
    winner:      null,
    finalRanking: null,
    log: [],
  };
}

// ── Action Validators ─────────────────────────────────────────

/**
 * MOVE ACTION (locked rule)
 * Move top 1–3 tokens forward by exactly 1 step, order preserved.
 * @param {object} game  – mutable game object
 * @param {string} playerId
 * @param {number} count – 1 | 2 | 3
 */
function applyMoveAction(game, playerId, count) {
  _assertActiveGame(game);
  _assertCurrentPlayer(game, playerId);

  if (![1, 2, 3].includes(count)) {
    throw new Error("count must be 1, 2, or 3.");
  }
  if (count > game.stack.length) {
    throw new Error(`Stack only has ${game.stack.length} token(s).`);
  }

  // Move the top `count` tokens forward by 1 (all move together, order stays)
  const moved = game.stack.slice(0, count);
  moved.forEach(tikId => {
    if (game.boardPositions[tikId] >= BOARD_SIZE) {
      throw new Error(`Token ${tikId} is already at the final position.`);
    }
    game.boardPositions[tikId]++;
  });

  // Rebuild stack: remove moved tokens then re‑insert at top in same order
  const rest  = game.stack.slice(count);
  game.stack  = [...moved, ...rest];

  game.lastAction = {
    type:    "MOVE",
    player:  playerId,
    tokens:  moved,
    steps:   1,
    count,
  };

  _logAction(game, `${_playerName(game, playerId)} moved top ${count} token(s) forward.`);
  _advanceTurn(game);
  return buildStateSnapshot(game);
}

/**
 * REORDER ACTION (locked rule)
 * Select top 2–3 tokens, rearrange them, place back on top.
 * @param {object} game
 * @param {string} playerId
 * @param {string[]} newOrder – tiki IDs in desired new order (top → bottom)
 */
function applyReorderAction(game, playerId, newOrder) {
  _assertActiveGame(game);
  _assertCurrentPlayer(game, playerId);

  if (!Array.isArray(newOrder) || newOrder.length < 2 || newOrder.length > 3) {
    throw new Error("newOrder must be an array of 2 or 3 tiki IDs.");
  }

  const topTokens = game.stack.slice(0, newOrder.length);

  // Validate that newOrder contains exactly the same tokens (just reordered)
  const sortedTop  = [...topTokens].sort();
  const sortedNew  = [...newOrder].sort();
  if (JSON.stringify(sortedTop) !== JSON.stringify(sortedNew)) {
    throw new Error("newOrder must contain exactly the current top tokens, just reordered.");
  }

  // Make sure it's actually a different order (else waste a turn is player's problem)
  game.stack = [...newOrder, ...game.stack.slice(newOrder.length)];

  game.lastAction = {
    type:     "REORDER",
    player:   playerId,
    before:   topTokens,
    after:    newOrder,
  };

  _logAction(game, `${_playerName(game, playerId)} reordered top ${newOrder.length} token(s).`);
  _advanceTurn(game);
  return buildStateSnapshot(game);
}

// ── End Condition & Scoring ───────────────────────────────────

function checkEndCondition(game) {
  // All tokens at final position
  const allAtEnd = Object.values(game.boardPositions).every(pos => pos >= BOARD_SIZE);
  // Or max turns reached
  const maxTurnsReached = game.turn > MAX_TURNS;

  return allAtEnd || maxTurnsReached;
}

function finalizeGame(game) {
  const { playerScores, ranked } = computeScores(game);

  game.players.forEach(p => { p.score = playerScores[p.id]; });
  game.finalRanking = ranked;
  game.status = "finished";

  // Winner = player with highest total score
  let best = -1, winner = null;
  game.players.forEach(p => {
    if (p.score > best) { best = p.score; winner = p; }
  });
  game.winner = winner ? { id: winner.id, name: winner.name, score: winner.score } : null;

  _logAction(game, `Game Over! Winner: ${game.winner?.name} (${game.winner?.score} pts)`);
  return buildStateSnapshot(game);
}

// ── Private Helpers ───────────────────────────────────────────

function _assertActiveGame(game) {
  if (game.status !== "active") throw new Error("Game is not active.");
}

function _assertCurrentPlayer(game, playerId) {
  const current = game.players[game.currentPlayerIndex];
  if (!current || current.id !== playerId) {
    throw new Error(`It is not ${playerId}'s turn. Current: ${current?.id}`);
  }
}

function _playerName(game, playerId) {
  return game.players.find(p => p.id === playerId)?.name ?? playerId;
}

function _logAction(game, msg) {
  game.log.push({ turn: game.turn, msg, ts: Date.now() });
}

function _advanceTurn(game) {
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  // Increment global turn counter only after all players have acted once
  if (game.currentPlayerIndex === 0) game.turn++;

  if (checkEndCondition(game)) {
    finalizeGame(game);
  }
}

// ── Exports ───────────────────────────────────────────────────

module.exports = {
  createGame,
  applyMoveAction,
  applyReorderAction,
  buildStateSnapshot,
  computeScores,
  rankTokens,
  finalizeGame,
  TIKIS,
  BOARD_SIZE,
  MAX_TURNS,
};
