/**
 * Builds a single executable: the server, the frontend and the speech tables in
 * one folder, runnable with no Node.js installed.
 *
 *   npm run build:exe
 *
 * Output lands in release/<platform>/. Double-click the executable, open the
 * address it prints. Pasting LaTeX works immediately; reading page images needs
 * a model backend, chosen from the settings panel.
 *
 * Uses Node's own single-executable support: the server is bundled into one
 * CommonJS file, embedded into a copy of the node binary, and shipped beside the
 * static assets it serves.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'build', 'exe');
const OUT = path.join(ROOT, 'release', `${process.platform}-${process.arch}`);
const EXE_NAME = process.platform === 'win32' ? 'formula-remediator.exe' : 'formula-remediator';

/** The only rule tables the pipeline uses: shared definitions and English. */
const SPEECH_TABLES = ['base.json', 'en.json'];

/**
 * Runs before any bundled code.
 *
 * Two things the Speech Rule Engine assumes that a single executable does not
 * provide. It requires `commander` at load time for a CLI nothing here uses,
 * through its own runtime `require` that a bundler cannot see, so an alias does
 * not reach it — the shim has to sit on `require` itself. And it finds its rule
 * tables by resolving its own package directory, which does not exist once
 * bundled; it checks SRE_JSON_PATH first, so point that at the tables shipped
 * beside the executable. `__dirname` is the executable's directory in a single
 * executable and the bundle's directory otherwise, so this works in both.
 */
const BANNER = `
const __nativeRequire = require;
require = Object.assign(function (id) {
  if (id === 'commander') return { program: {} };
  return __nativeRequire.apply(this, arguments);
}, __nativeRequire);
{
  const __path = __nativeRequire('path');
  const __fs = __nativeRequire('fs');
  const __tables = __path.join(__dirname, 'mathmaps');
  if (!process.env.SRE_JSON_PATH && __fs.existsSync(__tables)) process.env.SRE_JSON_PATH = __tables;
}
`;

function step(message) {
  console.log(`\n▸ ${message}`);
}

/**
 * Runs a package's CLI through this node, not a shell. Spawning `npx.cmd` on
 * Windows needs `shell: true`, which Node now warns concatenates arguments
 * unescaped — harmless with fixed arguments, but there is no need to take the
 * shell path at all when the script can be run directly.
 */
function runCli(script, args) {
  execFileSync(process.execPath, [path.join(ROOT, 'node_modules', script), ...args], {
    stdio: 'inherit',
    cwd: ROOT,
  });
}

async function bundle(entry, outfile) {
  await esbuild.build({
    entryPoints: [path.join(ROOT, entry)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    banner: { js: BANNER },
    // Reached only on the source-tree path, never in the bundle; see resolveDistDir.
    logOverride: { 'empty-import-meta': 'silent' },
  });
}

fs.rmSync(WORK, { recursive: true, force: true });
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

step('Building the frontend');
runCli('@angular/cli/bin/ng.js', ['build', '--configuration', 'production']);

step('Bundling the server');
const serverBundle = path.join(WORK, 'server.cjs');
await bundle('server/index.ts', serverBundle);

step('Copying assets');
fs.cpSync(path.join(ROOT, 'dist'), path.join(OUT, 'dist'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'mathmaps'), { recursive: true });
for (const table of SPEECH_TABLES) {
  fs.copyFileSync(
    path.join(ROOT, 'node_modules', 'speech-rule-engine', 'lib', 'mathmaps', table),
    path.join(OUT, 'mathmaps', table),
  );
}

step('Verifying speech works from the bundle, with no node_modules in reach');
const smokeBundle = path.join(OUT, 'speech-smoke.cjs');
await bundle('tools/speech-smoke.ts', smokeBundle);
try {
  execFileSync(process.execPath, [smokeBundle], { stdio: 'inherit', cwd: OUT });
} finally {
  fs.rmSync(smokeBundle, { force: true });
}

step('Embedding the server into the node binary');
const blob = path.join(WORK, 'sea-prep.blob');
const seaConfig = path.join(WORK, 'sea-config.json');
fs.writeFileSync(
  seaConfig,
  JSON.stringify({ main: serverBundle, output: blob, disableExperimentalSEAWarning: true }, null, 2),
);
execFileSync(process.execPath, ['--experimental-sea-config', seaConfig], { stdio: 'inherit' });

const exe = path.join(OUT, EXE_NAME);
fs.copyFileSync(process.execPath, exe);

// The fuse is a fixed marker Node looks for to know a blob has been injected.
runCli('postject/dist/cli.js', [
  exe,
  'NODE_SEA_BLOB',
  blob,
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ...(process.platform === 'darwin' ? ['--macho-segment-name', 'NODE_SEA'] : []),
]);

fs.writeFileSync(
  path.join(OUT, 'README.txt'),
  [
    'Formula Accessibility Remediator',
    '',
    `1. Run ${EXE_NAME}.`,
    '2. Open http://localhost:8787 in a browser.',
    '',
    'Pasting LaTeX works straight away, offline, with nothing else installed.',
    'Reading page images needs a model backend: open "Model backend" in the app',
    'and pick one. Ollama runs locally and keeps documents on this machine;',
    'the others need an API key.',
    '',
    'Keep the dist and mathmaps folders beside the executable.',
    '',
  ].join('\n'),
);

const size = (file) => `${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB`;
step('Done');
console.log(`  ${exe} (${size(exe)})`);
console.log(`  ${OUT}`);
