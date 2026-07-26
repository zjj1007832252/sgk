// 端到端测试：模拟真人客户端走完整流程
const WebSocket = require('ws');

const url = process.argv[2] || 'ws://localhost:3000';
const ws = new WebSocket(url);
let myPid = null;
let finished = false;
let sawGeneralPick = false;
let sawMyTurn = false;

const timeout = setTimeout(() => {
  console.error('❌ 超时：对局未完成');
  process.exit(1);
}, 120000);

function send(msg) { ws.send(JSON.stringify(msg)); }

ws.on('open', () => send({ type: 'hello', name: '测试员' }));

ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  switch (msg.type) {
    case 'welcome':
      myPid = msg.pid;
      send({ type: 'createRoom' });
      break;
    case 'room':
      if (msg.room.hostPid === myPid && msg.room.state === 'lobby') {
        if (msg.room.opts.aiDelay !== 0) { send({ type: 'setOpts', opts: { aiDelay: 0 } }); break; }
        const total = msg.room.seats.filter(s => s.name).length;
        if (total < 5) send({ type: 'addAI' });
        else send({ type: 'startGame' });
      }
      break;
    case 'game':
      if (msg.state.finished && !finished) {
        finished = true;
        clearTimeout(timeout);
        console.log('✅ 对局完成，胜方:', msg.state.winner, '选将弹窗:', sawGeneralPick, '我的回合:', sawMyTurn);
        console.log('最近日志:', msg.state.logs.slice(-5).join(' | '));
        process.exit(sawGeneralPick ? 0 : 1);
      }
      break;
    case 'prompt':
      answer(msg.prompt);
      break;
    case 'error':
    case 'toast':
      console.log('提示:', msg.msg);
  }
});

function answer(p) {
  switch (p.kind) {
    case 'chooseGeneral':
      sawGeneralPick = true;
      send({ type: 'action', generalId: p.candidates[0].id });
      break;
    case 'play':
      sawMyTurn = true;
      send({ type: 'action', action: 'end' });
      break;
    case 'respond':
      if (p.options && p.options.length) send({ type: 'action', cardIds: p.options[0].cardIds });
      else send({ type: 'action', pass: true });
      break;
    case 'confirm':
      send({ type: 'action', yes: false });
      break;
    case 'chooseOption':
      send({ type: 'action', option: p.options[0].id });
      break;
    case 'chooseCards':
      send({ type: 'action', cardIds: (p.cards || []).slice(0, p.min).map(c => c.uid) });
      break;
    case 'choosePlayers':
      send({ type: 'action', targetIds: (p.candidates || []).slice(0, p.min) });
      break;
    case 'chooseCardOf':
      send({ type: 'action', zone: 'hand' });
      break;
    case 'arrange':
      send({ type: 'action', top: p.cards.map(c => c.uid), bottom: [] });
      break;
  }
}

ws.on('error', e => { console.error('连接失败', e.message); process.exit(1); });
