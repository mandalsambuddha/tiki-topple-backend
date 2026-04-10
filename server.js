// ============================================================
//  Tiki Topple – Server Entry Point
//  Free-tier friendly: no DB, no Redis, pure in-memory.
//  Deploy to Render / Railway / Glitch / Cyclic for free.
// ============================================================

const express    = require("express");
const cors       = require("cors");
const gameRoutes = require("./gameRoutes");

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────

app.use(cors({
  origin: "*",             // allow all origins (update in production)
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));

app.use(express.json());

// ── Request Logger (lightweight) ─────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────

app.use("/api", gameRoutes);

// Root info endpoint
app.get("/", (_req, res) => {
  res.json({
    name:    "🗿 Tiki Topple Game Server",
    version: "1.0.0",
    status:  "running",
    docs:    "See README.md or /api/health",
    endpoints: {
      health:       "GET  /api/health",
      listGames:    "GET  /api/games",
      createGame:   "POST /api/games",
      getGame:      "GET  /api/games/:id",
      move:         "POST /api/games/:id/action/move",
      reorder:      "POST /api/games/:id/action/reorder",
      scores:       "GET  /api/games/:id/scores",
      stack:        "GET  /api/games/:id/stack",
      log:          "GET  /api/games/:id/log",
      tikis:        "GET  /api/tikis",
    },
  });
});

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Endpoint not found." });
});

// ── Start ─────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🗿  Tiki Topple server running on port ${PORT}`);
  console.log(`   http://localhost:${PORT}\n`);
});

module.exports = app;
