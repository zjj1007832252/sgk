// AI 智能测试：验证新 AI 稳定性与行为
const { Game } = require('../server/engine/game');
const { GENERALS } = require('../server/engine/generals');

function runGame(gameIdx, playerCount, roundLimit = 25) {
  return new Promise((resolve, reject) => {
    const infos = [];
    for (let i = 0; i < playerCount; i++) {
      infos.push({ pid: 'ai_' + i, name: 'AI' + (i + 1), isAI: true });
    }
    const timeout = setTimeout(() => reject(new Error('超时 #' + gameIdx)), 60000);
    const game = new Game(infos, {
      pickMode: 'random', pickCount: 3,
      generalIds: GENERALS.map(g => g.id), generals: GENERALS,
      aiDelay: 0, stepDelay: 0, roundLimit,
    }, {
      sendTo: () => {}, broadcastAll: () => {}, broadcastEvent: () => {},
      delay: () => Promise.resolve(),
      onEnd: winner => { clearTimeout(timeout); resolve({ winner, rounds: game.round }); },
    });
    game.start().catch(err => { clearTimeout(timeout); reject(err); });
  });
}

(async () => {
  const games = parseInt(process.argv[2] || '4', 10);
  const players = parseInt(process.argv[3] || '5', 10);
  const stats = { zhu: 0, fan: 0, nei: 0 };
  let totalRounds = 0, errors = 0;
  for (let i = 0; i < games; i++) {
    try {
      const r = await runGame(i, players);
      stats[r.winner] = (stats[r.winner] || 0) + 1;
      totalRounds += r.rounds;
      console.log(`对局 #${i + 1}: 胜方=${r.winner} 回合=${r.rounds}`);
    } catch (e) {
      errors++;
      console.error(`对局 #${i + 1} 失败:`, e.message);
    }
  }
  console.log(`\n== ${games} 局 AI 智能统计 ==`);
  console.log(`主忠胜: ${stats.zhu}  反贼胜: ${stats.fan}  内奸胜: ${stats.nei}  错误: ${errors}`);
  console.log(`平均回合数: ${(totalRounds / Math.max(1, games - errors)).toFixed(1)}`);
  process.exit(errors ? 1 : 0);
})();
