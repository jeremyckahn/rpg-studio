import { DEFAULT_COMPANION_URL } from '@rpgstudio/core'
import { parseArgs } from 'node:util'

import { connectAgent } from './agent.ts'
import { runDemo } from './demo.ts'
import { DEFAULT_ALLOWED_ORIGINS, startCompanionServer } from './server.ts'

const USAGE = `rpgstudio-companion <command> [options]

Commands:
  serve   Start the relay the editor and AI agents connect to (default)
  demo    Run the reference agent against a running server and editor

Options:
  --port <n>            serve: port to listen on (default 8080)
  --host <host>         serve: interface to bind (default 127.0.0.1)
  --allow-origin <url>  serve: also accept the editor from this origin (repeatable)
  --token <secret>      shared secret both the editor and agents must present
  --url <ws-url>        demo: server address (default ${DEFAULT_COMPANION_URL})
  -h, --help            show this help
`

const main = async (): Promise<number> => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: 'string' },
      host: { type: 'string' },
      'allow-origin': { type: 'string', multiple: true },
      token: { type: 'string' },
      url: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  const command = positionals[0] ?? 'serve'
  if (values.help === true || !['serve', 'demo'].includes(command)) {
    process.stdout.write(USAGE)
    return values.help === true ? 0 : 1
  }

  if (command === 'demo') {
    const agent = await connectAgent({
      ...(values.url === undefined ? {} : { url: values.url }),
      ...(values.token === undefined ? {} : { token: values.token }),
      name: 'rpgstudio-demo',
    })
    try {
      const summary = await runDemo(agent, { log: (line) => process.stdout.write(`${line}\n`) })
      process.stdout.write(`\nDone: ${JSON.stringify(summary, null, 2)}\n`)
      return 0
    } finally {
      agent.close()
    }
  }

  const port = values.port === undefined ? 8080 : Number(values.port)
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error(`Invalid port: ${values.port}`)
  const server = await startCompanionServer({
    port,
    ...(values.host === undefined ? {} : { host: values.host }),
    ...(values.token === undefined ? {} : { token: values.token }),
    allowedOrigins: [...DEFAULT_ALLOWED_ORIGINS, ...(values['allow-origin'] ?? [])],
    log: (line) => process.stdout.write(`[companion] ${line}\n`),
  })
  process.stdout.write(`Companion server listening on ${server.url}\n`)
  process.stdout.write(
    'Connect the editor from Companion in the editor’s menu bar, then run an agent or `rpgstudio-companion demo`.\n',
  )
  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve)
    process.once('SIGTERM', resolve)
  })
  await server.close()
  return 0
}

main().then(
  (code) => {
    Reflect.set(process, 'exitCode', code)
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    Reflect.set(process, 'exitCode', 1)
  },
)
