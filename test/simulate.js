// 无头模拟：全 AI 对局，验证引擎稳定性
const { Game } = require('../server/engine/game');
const { GENERALS } = require('../server/engine/generals');

function runGame(gameIdx, playerCount) {
  return new Promise((resolve, reject) => {
    const infos = [];
    for (let i = 0; i < playerCount; i++) {
      infos.push({ pid: 'ai_' + i, name: 'AI' + (i + 1), isAI: true });
    }
    const timeout = setTimeout(() => {
      reject(new Error(`对局超时（卡住）#${gameIdx}，最后日志：\n` + game.logs.slice(-30).join('\n')));
    }, 60000);

    const game = new Game(infos, {
      pickMode: 'random',
      pickCount: 3,
      generalIds: GENERALS.map(g => g.id),
      generals: GENERALS,
      aiDelay: 0,
      stepDelay: 0,
      allowIdentityPick: false,
    }, {
      sendTo: () => {},
      broadcastAll: () => {},
      broadcastEvent: () => {},
      delay: () => Promise.resolve(),
      onEnd: (winner) => {
        clearTimeout(timeout);
        resolve({ winner, rounds: game.round, logs: game.logs });
      },
    });
    game.start().catch(err => {
      clearTimeout(timeout);
      err.gameLogs = game.logs.slice(-40);
      reject(err);
    });
  });
}

(async () => {
  const games = parseInt(process.argv[2] || '10', 10);
  const players = parseInt(process.argv[3] || '5', 10);
  const stats = { zhu: 0, fan: 0, nei: 0 };
  let totalRounds = 0;
  for (let i = 0; i < games; i++) {
    try {
      const r = await runGame(i, players);
      stats[r.winner] = (stats[r.winner] || 0) + 1;
      totalRounds += r.rounds;
      console.log(`对局 #${i + 1}: 胜方=${r.winner} 回合数=${r.rounds}`);
    } catch (e) {
      console.error(`对局 #${i + 1} 失败:`, e.message);
      if (e.gameLogs) console.error('--- 最近日志 ---\n' + e.gameLogs.join('\n'));
      console.error(e.stack);
      process.exit(1);
    }
  }
  console.log(`\n== ${games} 局统计 ==`);
  console.log(`主忠胜: ${stats.zhu}  反贼胜: ${stats.fan}  内奸胜: ${stats.nei}`);
  console.log(`平均回合数: ${(totalRounds / games).toFixed(1)}`);
  process.exit(0);
})();
