// Запуск для проверки в Telegram одной командой: npm run telegram
//  1. собирает экраны (готовая сборка грузится через туннель быстро и надёжно);
//  2. отдаёт сборку на 127.0.0.1:4173 (запросы /api проксируются на API);
//  3. открывает HTTPS-туннель localhost.run к 127.0.0.1:4173;
//  4. запускает API и бота с WEB_APP_URL = адрес туннеля.
// Остановка — Ctrl+C. Адрес туннеля меняется при каждом запуске.
// После правок экранов перезапустите команду — горячей перезагрузки в этом режиме нет.

import { spawn, spawnSync } from 'node:child_process';

const PREVIEW_HOST = '127.0.0.1'; // явный IPv4: «localhost» на Windows бывает IPv6
const PREVIEW_PORT = 4173;

const children = [];
const isWin = process.platform === 'win32';

function run(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    env: { ...process.env, ...extraEnv },
    shell: isWin && command === 'npm',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const prefix = `[${name}]`;
  const forward = (stream, out) =>
    stream.on('data', (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) out.write(`${prefix} ${line}\n`);
    });
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix} завершился (код ${code})`);
    shutdown();
  });
  children.push(child);
  return child;
}

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.exitCode === null) {
      if (isWin) spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
      else c.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// 1. Сборка
console.log('Собираю экраны…');
const build = spawnSync('npm', ['run', 'build:web'], { stdio: 'inherit', shell: isWin });
if (build.status !== 0) {
  console.error('Сборка не удалась — исправьте ошибки выше и запустите снова.');
  process.exit(1);
}

// 2. Отдача готовой сборки
run('web', 'npm', ['run', 'preview', '-w', 'apps/web']);

// 3. Туннель
console.log('Открываю туннель localhost.run…');
const tunnel = spawn(
  'ssh',
  [
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ServerAliveInterval=30',
    '-R', `80:${PREVIEW_HOST}:${PREVIEW_PORT}`,
    'nokey@localhost.run',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
children.push(tunnel);
tunnel.on('exit', (code) => {
  console.log(`[tunnel] туннель закрылся (код ${code})`);
  shutdown();
});

// Адрес выглядит как https://c0b17fa384b14d.app.lhr.life — поддоменов может быть несколько.
const TUNNEL_URL_RE = /https:\/\/(?:[a-z0-9-]+\.)+lhr\.life/i;

let url = null;
let tunnelOutput = '';
const timeout = setTimeout(() => {
  if (!url) {
    console.error('Не удалось получить адрес туннеля за 30 секунд. Ответ туннеля:');
    console.error(tunnelOutput.trim().split(/\r?\n/).slice(-15).join('\n') || '(пусто — ssh ничего не вывел)');
    shutdown();
  }
}, 30_000);

const onTunnelData = (chunk) => {
  if (url) return;
  tunnelOutput += chunk.toString();
  const m = tunnelOutput.match(TUNNEL_URL_RE);
  if (!m) return;
  url = m[0];
  clearTimeout(timeout);

  // 4. API и бот
  run('api', 'npm', ['run', 'dev'], { WEB_APP_URL: url, DEV_AUTH: 'false' });

  console.log(`
────────────────────────────────────────────────────────────
  Приложение доступно по адресу:
  ${url}

  1. Если адрес изменился с прошлого раза, вставьте его в @BotFather
     (Bot Settings → Configure Mini App). Кнопка меню в чате
     с ботом обновится сама.
  2. Проверка без Telegram: откройте этот адрес в обычном браузере —
     должен появиться экран «Куда идём?» (создать вылазку там нельзя,
     вход работает только из Telegram).
  Остановить: Ctrl+C
────────────────────────────────────────────────────────────
`);
};
tunnel.stdout.on('data', onTunnelData);
tunnel.stderr.on('data', onTunnelData);
