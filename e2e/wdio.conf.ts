import path from 'path'
import { spawn, type ChildProcess } from 'child_process'
import type { Options } from '@wdio/types'

const APP_BINARY = path.resolve(
  __dirname,
  '../src-tauri/target/debug/llmmanager'
)

let tauriDriver: ChildProcess

// capabilities uses Tauri-driver's non-standard 'tauri:options' extension
// which is not in the WdIO 9 type definitions, hence the intersection type.
type WdioConfig = Omit<Options.Testrunner, 'capabilities'> & {
  capabilities: { browserName: string; 'tauri:options': { application: string } }[]
}

export const config: WdioConfig = {
  specs: ['./specs/**/*.spec.ts'],
  maxInstances: 1,

  capabilities: [{
    browserName: 'wry',
    'tauri:options': { application: APP_BINARY },
  }],

  // tauri-driver handles its own server — no service needed
  services: [],

  hostname: 'localhost',
  port: 4444,
  path: '/',

  framework: 'mocha',
  mochaOpts: { timeout: 30000 },

  reporters: ['spec'],

  onPrepare: () => {
    const driverBin = process.env.TAURI_DRIVER_BIN
      ?? `${process.env.HOME}/.cargo/bin/tauri-driver`

    tauriDriver = spawn(
      driverBin,
      [],
      {
        stdio: [null, process.stdout, process.stderr],
        env: { ...process.env, AICONTEXTBAR_TEST: '1' },
      }
    )
    // Give driver time to boot
    return new Promise(r => setTimeout(r, 1000))
  },

  onComplete: () => {
    tauriDriver?.kill()
  },
}
