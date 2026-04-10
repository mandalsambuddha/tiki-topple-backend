// ============================================================
//  Tiki Topple – API Routes
// ============================================================

const express  = require("express");
const { v4: uuidv4 } = require("uuid");
const engine = require("./gameEngine");
const store  = require("./gameStore");

const router = express.Router();

// ── Utility ──────────────────────────────────────────────────

function ok(res, data)        { res.json({ success: true,  ...data }); }
function fail(res, msg, code = 400) { res.status(code).json({ success: false, error: msg }); }

function withGame(res, gameId, cb) {
  const game = store.get(gameId);
  if (!game) return fail(res, `Game '${gameId}' not found.`, 404);
  try { cb(game); }
  catch (err) { fail(res, err.message); }
}

// ── Health Check ──────────────────────────────────────────────

/**
 * GET /api/health
 * Quick check that the server is alive.
 */
router.get("/health", (_req, res) => {
  ok(res, { message: "🗿 Tiki Topple server is alive!", ts: Date.now() });
});

// ── Game Management ───────────────────────────────────────────

/**
 * POST /api/games
 * Create a new game.
 * Body: { players: ["Alice", "Bob", ...] }   (2–4 names)
 */
router.post("/games", (req, res) => {
  const { players } = req.body;
  if (!Array.isArray(players) || players.length < 2 || players.length > 4) {
    return fail(res, "Provide 2–4 player names in 'players' array.");
  }

  try {
    const gameId = uuidv4().slice(0, 8).toUpperCase(); // short readable ID e.g. "A3F7C2B1"
    const game   = engine.createGame(gameId, players);
    store.save(game);
    ok(res, { game: engine.buildStateSnapshot(game) });
  } catch (err) {
    fail(res, err.message);
  }
});

/**
 * GET /api/games/:gameId
 * Get current state of a game.
 */
router.get("/games/:gameId", (req, res) => {
  withGame(res, req.params.gameId, game => {
    ok(res, { game: engine.buildStateSnapshot(game) });
  });
});

/**
 * DELETE /api/games/:gameId
 * Delete a game session.
 */
router.delete("/games/:gameId", (req, res) => {
  withGame(res, req.params.gameId, game => {
    store.del(game.gameId);
    ok(res, { message: "Game deleted." });
  });
});

/**
 * GET /api/games
 * List all active games (for debug / lobby screen).
 */
router.get("/games", (_req, res) => {
  const games = store.getAll().map(engine.buildStateSnapshot);
  ok(res, { games });
});

// ── Game Actions ──────────────────────────────────────────────

/**
 * POST /api/games/:gameId/action/move
 * Move the top N tokens forward by 1 step.
 * Body: { playerId: "player_1", count: 2 }
 */
router.post("/games/:gameId/action/move", (req, res) => {
  const { playerId, count } = req.body;
  if (!playerId)          return fail(res, "playerId is required.");
  if (count == null)      return fail(res, "count is required (1–3).");

  withGame(res, req.params.gameId, game => {
    const snapshot = engine.applyMoveAction(game, playerId, Number(count));
    store.save(game);
    ok(res, { game: snapshot });
  });
});

/**
 * POST /api/games/:gameId/action/reorder
 * Reorder the top 2–3 tokens.
 * Body: { playerId: "player_1", newOrder: ["teal", "red", "blue"] }
 */
router.post("/games/:gameId/action/reorder", (req, res) => {
  const { playerId, newOrder } = req.body;
  if (!playerId)            return fail(res, "playerId is required.");
  if (!Array.isArray(newOrder)) return fail(res, "newOrder must be an array of tiki IDs.");

  withGame(res, req.params.gameId, game => {
    const snapshot = engine.applyReorderAction(game, playerId, newOrder);
    store.save(game);
    ok(res, { game: snapshot });
  });
});

// ── Info Endpoints ────────────────────────────────────────────

/**
 * GET /api/games/:gameId/scores
 * Get current live scores (before game ends).
 */
router.get("/games/:gameId/scores", (req, res) => {
  withGame(res, req.params.gameId, game => {
    const { playerScores, ranked } = engine.computeScores(game);
    ok(res, { playerScores, ranked });
  });
});

/**
 * GET /api/games/:gameId/log
 * Get game action log.
 */
router.get("/games/:gameId/log", (req, res) => {
  withGame(res, req.params.gameId, game => {
    ok(res, { log: game.log });
  });
});

/**
 * GET /api/games/:gameId/stack
 * Get current stack state (top → bottom).
 */
router.get("/games/:gameId/stack", (req, res) => {
  withGame(res, req.params.gameId, game => {
    const stackDetails = game.stack.map((tikId, i) => {
      const tikData  = engine.TIKIS.find(t => t.id === tikId);
      const owner    = game.players.find(p => p.tikis.includes(tikId));
      return {
        position: i,           // 0 = top
        tikId,
        ...tikData,
        boardPos: game.boardPositions[tikId],
        owner: owner ? { id: owner.id, name: owner.name } : null,
      };
    });
    ok(res, { stack: stackDetails });
  });
});

/**
 * GET /api/tikis
 * Get all tiki definitions (colors, emojis, names).
 */
router.get("/tikis", (_req, res) => {
  ok(res, { tikis: engine.TIKIS });
});

module.exports = router;
