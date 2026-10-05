/**
 * Builds the embedded Piskel sprite editor into `public/piskel/`.
 *
 * Piskel (https://github.com/piskelapp/piskel, Apache-2.0) has no npm release or
 * prebuilt bundle, so this clones a pinned commit, builds it with its own
 * toolchain, removes what an embedded editor does not need, and injects the
 * RPG Studio adapter (`piskel-adapter.ts`). Run it again to reproduce the
 * committed files exactly:
 *
 *   pnpm --filter @rpgstudio/editor piskel:vendor
 */
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

const REPOSITORY = 'https://github.com/piskelapp/piskel.git'
const TAG = 'v0.15.0'
/** The commit `TAG` must resolve to; the build refuses to continue otherwise. */
const COMMIT = 'ef945ef8a6ecd16290e5f4cebb76804bc00afce4'

const here = dirname(fileURLToPath(import.meta.url))
const output = join(here, '..', 'public', 'piskel')

const run = (command: string, args: readonly string[], cwd: string): string =>
  execFileSync(command, [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })

const work = mkdtempSync(join(tmpdir(), 'rpgstudio-piskel-'))
try {
  const source = join(work, 'piskel')
  console.log(`Cloning Piskel ${TAG}…`)
  run('git', ['clone', '--quiet', '--depth', '1', '--branch', TAG, REPOSITORY, source], work)
  const actual = run('git', ['rev-parse', 'HEAD'], source).trim()
  if (actual !== COMMIT) {
    throw new Error(
      `Piskel ${TAG} resolved to ${actual}, expected ${COMMIT}. Refusing to build it.`,
    )
  }

  console.log('Installing build tools…')
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--legacy-peer-deps',
      '--no-audit',
      '--no-fund',
      '--loglevel=error',
    ],
    source,
  )
  console.log('Building…')
  run('npx', ['--yes', 'grunt-cli', 'build'], source)

  const built = join(source, 'dest', 'prod')
  rmSync(output, { recursive: true, force: true })
  mkdirSync(output, { recursive: true })
  cpSync(built, output, {
    recursive: true,
    // The unminified bundle, the piskelapp.com partials and unused art are dead weight here.
    filter: (path) =>
      !/piskel-packaged-\d/.test(path) &&
      !path.includes('piskelapp-partials') &&
      !path.includes(`${join('img', 'unused')}`),
  })

  // Give the date-stamped bundles stable names so rebuilds do not churn the repository.
  const stamp = /-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}/
  for (const folder of ['js', 'css']) {
    for (const file of readdirSync(join(output, folder))) {
      renameSync(join(output, folder, file), join(output, folder, file.replace(stamp, '')))
    }
  }

  const adapter = ts.transpileModule(readFileSync(join(here, 'piskel-adapter.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.None },
  }).outputText
  writeFileSync(join(output, 'rpgstudio-adapter.js'), adapter)

  const indexPath = join(output, 'index.html')
  const index = readFileSync(indexPath, 'utf8')
  const versioned = /var version = '-[0-9-]+';/
  // Piskel's page embeds HTML templates containing `</body>`; only the last one closes the document.
  const bodyEnd = index.lastIndexOf('</body>')
  if (!versioned.test(index) || bodyEnd === -1) {
    throw new Error('Piskel changed its index.html; update the vendor script')
  }
  writeFileSync(
    indexPath,
    `${index.slice(0, bodyEnd).replace(versioned, "var version = '';")}  <script src="rpgstudio-adapter.js"></script>\n${index.slice(bodyEnd)}`,
  )

  cpSync(join(source, 'LICENSE'), join(output, 'LICENSE'))
  writeFileSync(
    join(output, 'NOTICE.md'),
    `# Piskel\n\nThis folder contains a build of [Piskel](https://github.com/piskelapp/piskel), ` +
      `Copyright Julian Descottes and contributors, licensed under the Apache License 2.0 ` +
      `(see \`LICENSE\`).\n\n- Source: ${REPOSITORY} at ${TAG} (${COMMIT})\n` +
      `- Built with Piskel's own \`grunt build\`.\n` +
      `- Changes: the unminified bundle, piskelapp.com partials and unused images were removed, ` +
      `bundle files were renamed to drop their build date, and \`rpgstudio-adapter.js\` ` +
      `(from \`scripts/piskel-adapter.ts\`) is loaded at the end of \`index.html\`. ` +
      `Piskel's own code is unmodified.\n\nRegenerate with \`pnpm --filter @rpgstudio/editor piskel:vendor\`.\n`,
  )
  console.log(`Done: ${output}`)
  if (!existsSync(join(output, 'index.html'))) throw new Error('Build produced no index.html')
} finally {
  rmSync(work, { recursive: true, force: true })
}
