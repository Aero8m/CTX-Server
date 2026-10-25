import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const python =
  process.env.CTX_PYTHON ||
  fileURLToPath(
    new URL(
      process.platform === 'win32' ? '../../.venv/Scripts/python.exe' : '../../.venv/bin/python',
      import.meta.url,
    ),
  )
const server = spawn(python, ['tests/e2e_server.py'], {
  cwd: fileURLToPath(new URL('../../backend', import.meta.url)),
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
})
server.on('exit', (code) => process.exit(code || 0))
process.on('SIGTERM', () => server.kill())
