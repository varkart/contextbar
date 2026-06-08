import path from 'path'
import { spawn, type ChildProcess } from 'child_process'
import type { Options } from '@wdio/types'

const APP_BINARY = path.resolve(
  __dirname,
  '../src-tauri/target/debug/aicontextbar'
)

let tauriDriver: ChildProcess

export const config: Options.Testrunner = {
  specs: ['./specs/**/*.spec.ts'],
  maxInstances: 1,

  capabilities: [{
    browserName: 'wry',
    'tauri:options': { application: APP_BINARY },
  }],

  services: [
    [
      'chromedriver',
      {
        port: 4444,
        chromedriverCustomPath: 'tauri-driver',
        args: ['--port=4444'],
      },
    ],
  ],

  hostname: 'localhost',
  port: 4444,
  path: '/',

  framework: 'mocha',
  mochaOpts: { timeout: 30000 },

  reporters: ['spec'],

  before: async () => {
    // Give app time to show the main window
    await new Promise(r => setTimeout(r, 2000))
  },

  onPrepare: () => {
    tauriDriver = spawn('tauri-driver', ['--port', '4444'], {
      stdio: [null, process.stdout, process.stderr],
      env: { ...process.env, AICONTEXTBAR_TEST: '1' },
    })
  },

  onComplete: () => {
    tauriDriver?.kill()
  },
}
