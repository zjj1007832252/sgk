// 平衡性测试：使用自定义卡牌进行模拟对战
const { Game } = require('../server/engine/game');
const { GENERALS } = require('../server/engine/generals');

function runBalanceTest(opts) {
  return new Promise((resolve, reject) => {
    const { players = 5, rounds = 50, customCards = [], generalIds = null } = opts;
    const infos = [];
    for (let i = 0; i < players; i++) {
      infos.push({ pid: 'ai_' + i, name: 'AI' + i, isAI: true });
    }
    const timeout = setTimeout(() => reject(new Error('超时')), 60000);
    const game = new Game(infos, {
      pickMode: 'random', pickCount: 3,
      generalIds: generalIds || GENERALS.map(g => g.id),
      generals: GENERALS,
      aiDelay: 0, stepDelay: 0, roundLimit: rounds,
      customCards: customCards,
    }, {
      sendTo: () => {}, broadcastAll: () => {}, broadcastEvent: () => {},
      delay: () => Promise.resolve(),
      onEnd: winner => { clearTimeout(timeout); resolve({ winner, game }); },
    });
    game.start().catch(err => { clearTimeout(timeout); reject(err); });
  });
}

(async () => {
  const games = parseInt(process.argv[2] || '10', 10);
  const players = parseInt(process.argv[3] || '5', 10);
  const rounds = parseInt(process.argv[4] || '30', 10);

  console.log(`\n=== 平衡性测试 ===`);
  console.log(`局数: ${games} | 人数: ${players} | 回合上限: ${rounds}\n`);

  const stats = { zhu: 0, fan: 0, nei: 0 };
  let totalRounds = 0;
  const startTime = Date.now();

  for (let i = 0; i < games; i++) {
    try {
      const r = await runBalanceTest({ players, rounds });
      stats[r.winner] = (stats[r.winner] || 0) + 1;
      totalRounds += r.game.round;
      process.stdout.write(`  对局 #${i + 1}: ${r.winner} (${r.game.round}回合)\r`);
    } catch (e) {
      console.error(`  对局 #${i + 1} 失败:`, e.message);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n=== 结果 (${elapsed}s) ===`);
  console.log(`主忠胜: ${stats.zhu} (${(stats.zhu / games * 100).toFixed(1)}%)`);
  console.log(`反贼胜: ${stats.fan} (${(stats.fan / games * 100).toFixed(1)}%)`);
  console.log(`内奸胜: ${stats.nei} (${(stats.nei / games * 100).toFixed(1)}%)`);
  console.log(`平均回合: ${(totalRounds / games).toFixed(1)}`);

  // 平衡性评估
  const zhuRate = stats.zhu / games;
  const fanRate = stats.fan / games;
  console.log(`\n平衡性: ${Math.abs(zhuRate - fanRate) < 0.15 ? '✅ 良好' : Math.abs(zhuRate - fanRate) < 0.30 ? '⚠️ 一般' : '❌ 失衡'}`);
  process.exit(0);
})();
