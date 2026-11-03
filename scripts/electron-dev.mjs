// Starts the Vite dev server, then Electron pointed at it (hot reload for the Linux target).
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const electronBin = require('electron');
const url = 'http://localhost:5173';

const vite = spawn(
  process.execPath,
  [require.resolve('vite/bin/vite.js'), '--config', 'web/vite.config.mts'],
  {stdio: 'inherit'},
);

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Vite dev server did not start');
}

await waitForServer();
const app = spawn(electronBin, ['.'], {stdio: 'inherit', env: {...process.env, VEIL_DEV_URL: url}});
const stop = () => {
  vite.kill();
  app.kill();
};
app.on('exit', code => {
  vite.kill();
  process.exit(code ?? 0);
});
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
