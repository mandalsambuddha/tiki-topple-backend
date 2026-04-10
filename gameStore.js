const games = new Map();

module.exports = {
  save: (game) => games.set(game.gameId, game),
  get:  (gameId) => games.get(gameId) ?? null,
  del:  (gameId) => games.delete(gameId),
  all:  () => Array.from(games.values()),
};