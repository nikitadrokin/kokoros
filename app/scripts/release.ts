#!/usr/bin/env bun
/**
 * Build a Tauri release, optionally bump patch version, and publish a GitHub
 * release by default. Pass `--dry-run` to skip publishing and print manual
 * steps instead.
 *
 * Homebrew cask update scaffolding is kept below but intentionally disabled
 * until this project is wired to a tap.
 */

import { Glob } from 'bun';
import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import readline from 'node:readline/promises';

type TauriConf = {
  version: string;
  bundle?: {
    createUpdaterArtifacts?: boolean | string;
    macOS?: {
      signingIdentity?: string | null;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

const GREEN = '\x1b[0;32m';
const RED = '\x1b[0;31m';
const CYAN = '\x1b[0;36m';
const YELLOW = '\x1b[0;33m';
const NC = '\x1b[0m';

/** Parsed CLI flags for `release.ts`. */
type ReleaseCliArgs = {
  /** When true, build only and print manual publish steps (no git/gh). */
  dryRun: boolean;
  /** When true, force an unsigned macOS bundle. */
  noCodesign: boolean;
  /** Optional macOS codesigning identity override. */
  codesignIdentity?: string;
};

type MacosCodesign =
  | { enabled: true; identity?: string; description: string }
  | { enabled: false; description: string };

type KeychainCodesignIdentity = {
  hash: string;
  name: string;
};

const scriptDir = import.meta.dir;
const projectRoot = join(scriptDir, '..');
const tauriConfPath = join(projectRoot, 'src-tauri/tauri.conf.json');
const packageJsonPath = join(projectRoot, 'package.json');
const cargoTomlPath = join(projectRoot, 'src-tauri/Cargo.toml');
const dmgDir = join(projectRoot, 'src-tauri/target/release/bundle/dmg');
const macosBundleDir = join(projectRoot, 'src-tauri/target/release/bundle/macos');
const latestUpdaterJsonPath = join(macosBundleDir, 'latest.json');
const defaultUpdaterSigningKeyPath = join(
  homedir(),
  '.tauri/kokoros-updater.key',
);

// Homebrew support is intentionally disabled for now. To enable it later:
// 1. Point this at the cask file in your tap.
// 2. Uncomment updateHomebrewCaskIfConfigured(...) in main().
// 3. Update updateCaskFile(...) with the release URL for this repo/tap.
// const caskFilePath = join(projectRoot, '../homebrew-tap/Casks/kokoros.rb');

function parseArgs(argv: string[]): ReleaseCliArgs {
  let codesignIdentity: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg?.startsWith('--codesign-identity=')) {
      codesignIdentity = arg.slice('--codesign-identity='.length).trim();
    } else if (arg === '--codesign-identity') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --codesign-identity');
      }
      codesignIdentity = value.trim();
      i += 1;
    }
  }

  return {
    dryRun: argv.includes('--dry-run'),
    noCodesign: argv.includes('--no-codesign'),
    codesignIdentity,
  };
}

async function readTauriVersion(path: string): Promise<string> {
  const raw = await Bun.file(path).text();
  const parsed = JSON.parse(raw) as TauriConf;
  if (typeof parsed.version !== 'string' || !parsed.version) {
    throw new Error(`Invalid or missing version in ${path}`);
  }
  return parsed.version;
}

function nextPatchVersion(current: string): string {
  const parts = current.split('.');
  if (parts.length !== 3) {
    throw new Error(`Expected semver x.y.z, got: ${current}`);
  }
  const patch = Number.parseInt(parts[2], 10);
  if (Number.isNaN(patch)) {
    throw new Error(`Invalid patch segment in version: ${current}`);
  }
  return `${parts[0]}.${parts[1]}.${patch + 1}`;
}

async function replaceVersionInFile(
  path: string,
  fromVersion: string,
  toVersion: string,
  kind: 'tauri-json' | 'package-json' | 'cargo',
): Promise<void> {
  let content = await Bun.file(path).text();
  switch (kind) {
    case 'tauri-json':
    case 'package-json':
      content = content.replace(
        new RegExp(`"version": "${escapeRegExp(fromVersion)}"`, 'g'),
        `"version": "${toVersion}"`,
      );
      break;
    case 'cargo':
      content = content.replace(
        new RegExp(`^version = "${escapeRegExp(fromVersion)}"`, 'm'),
        `version = "${toVersion}"`,
      );
      break;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
  await Bun.write(path, content);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function sha256File(filePath: string): Promise<string> {
  const buf = await Bun.file(filePath).bytes();
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(buf);
  return hasher.digest('hex');
}

async function findDmgForVersion(version: string): Promise<string | undefined> {
  try {
    const st = await stat(dmgDir);
    if (!st.isDirectory()) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  const glob = new Glob(`*_${version}_*.dmg`);
  for await (const rel of glob.scan({ cwd: dmgDir, onlyFiles: true })) {
    return join(dmgDir, rel);
  }
  return undefined;
}

async function findMacUpdaterArchive(): Promise<string | undefined> {
  try {
    const st = await stat(macosBundleDir);
    if (!st.isDirectory()) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  const matches: string[] = [];
  const glob = new Glob('*.app.tar.gz');
  for await (const rel of glob.scan({ cwd: macosBundleDir, onlyFiles: true })) {
    matches.push(join(macosBundleDir, rel));
  }

  return matches.sort()[0];
}

// GitHub normalizes asset names by replacing spaces with dots. Kokoros does not
// currently have spaces, but this keeps the Homebrew scaffolding future-proof.
function githubReleaseAssetBasename(localBasename: string): string {
  return localBasename.replace(/ /g, '.');
}

function githubReleaseDmgBasename(localBasename: string): string {
  return githubReleaseAssetBasename(localBasename);
}

function updaterPlatformKeyFromDmg(dmgPath: string): string {
  const match = basename(dmgPath).match(/_([^_]+)\.dmg$/);
  const rawArch = match?.[1] ?? process.arch;
  const arch =
    rawArch === 'arm64' || rawArch === 'aarch64'
      ? 'aarch64'
      : rawArch === 'x64' || rawArch === 'amd64' || rawArch === 'x86_64'
        ? 'x86_64'
        : rawArch;

  return `darwin-${arch}`;
}

async function writeLatestUpdaterJson(
  version: string,
  dmgPath: string,
  updaterArchivePath: string,
): Promise<string> {
  const signaturePath = `${updaterArchivePath}.sig`;
  if (!(await Bun.file(signaturePath).exists())) {
    throw new Error(`Updater signature not found: ${signaturePath}`);
  }

  const signature = (await Bun.file(signaturePath).text()).trim();
  const updaterAssetName = githubReleaseAssetBasename(basename(updaterArchivePath));
  const platformKey = updaterPlatformKeyFromDmg(dmgPath);
  const latestJson = {
    version,
    pub_date: new Date().toISOString(),
    platforms: {
      [platformKey]: {
        signature,
        url: `https://github.com/nikitadrokin/kokoros/releases/download/v${version}/${updaterAssetName}`,
      },
    },
  };

  await Bun.write(latestUpdaterJsonPath, `${JSON.stringify(latestJson, null, 2)}\n`);
  return latestUpdaterJsonPath;
}

async function ensureUpdaterSigningKey(): Promise<void> {
  if (process.env.TAURI_SIGNING_PRIVATE_KEY) {
    return;
  }

  if (process.env.TAURI_SIGNING_PRIVATE_KEY_PATH) {
    process.env.TAURI_SIGNING_PRIVATE_KEY = (
      await Bun.file(process.env.TAURI_SIGNING_PRIVATE_KEY_PATH).text()
    ).trim();
    return;
  }

  if (await Bun.file(defaultUpdaterSigningKeyPath).exists()) {
    process.env.TAURI_SIGNING_PRIVATE_KEY = (
      await Bun.file(defaultUpdaterSigningKeyPath).text()
    ).trim();
    process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= '';
    return;
  }

  throw new Error(
    [
      'Updater signing key not found.',
      `Generate one with: bunx tauri signer generate -w ${defaultUpdaterSigningKeyPath}`,
      'Then keep the private key secret and rerun this release command.',
    ].join('\n'),
  );
}

async function withUpdaterArtifactsEnabled(
  codesign: MacosCodesign,
  build: () => boolean,
): Promise<boolean> {
  const original = await Bun.file(tauriConfPath).text();
  const parsed = JSON.parse(original) as TauriConf;
  parsed.bundle ??= {};
  parsed.bundle.createUpdaterArtifacts = true;
  if (process.platform === 'darwin' && codesign.enabled && codesign.identity) {
    parsed.bundle.macOS ??= {};
    parsed.bundle.macOS.signingIdentity = codesign.identity;
  }

  await Bun.write(tauriConfPath, `${JSON.stringify(parsed, null, 2)}\n`);

  try {
    return build();
  } finally {
    await Bun.write(tauriConfPath, original);
  }
}

// async function updateCaskFile(
//   version: string,
//   sha256: string,
//   dmgPath: string,
// ): Promise<void> {
//   const localBasename = basename(dmgPath);
//   if (!localBasename) {
//     throw new Error(`Could not get DMG basename from: ${dmgPath}`);
//   }
//   const urlFilename = githubReleaseDmgBasename(localBasename).replace(
//     version,
//     '#{version}',
//   );
//   let content = await Bun.file(caskFilePath).text();
//   content = content.replace(/^(\s*version\s+")[^"]*(")/m, `$1${version}$2`);
//   content = content.replace(/^(\s*sha256\s+")[^"]*(")/m, `$1${sha256}$2`);
//   content = content.replace(
//     /^(\s*url\s+")[^"]+(")/m,
//     `$1https://github.com/nikitadrokin/kokoros/releases/download/v#{version}/${urlFilename}$2`,
//   );
//   await Bun.write(caskFilePath, content);
// }

// async function updateHomebrewCaskIfConfigured(
//   version: string,
//   sha256: string,
//   dmgPath: string,
// ): Promise<void> {
//   if (await Bun.file(caskFilePath).exists()) {
//     console.log(`${CYAN}Updating Homebrew cask...${NC}`);
//     await updateCaskFile(version, sha256, dmgPath);
//     console.log(`${GREEN}Cask file updated!${NC}`);
//   } else {
//     console.log(`${YELLOW}Homebrew cask not configured: ${caskFilePath}${NC}`);
//   }
// }

async function deleteBunBuildArtifacts(root: string): Promise<void> {
  const glob = new Glob('**/*.bun-build');
  for await (const abs of glob.scan({
    cwd: root,
    absolute: true,
    onlyFiles: true,
  })) {
    await Bun.file(abs).delete();
  }
}

function runTauriBuildWithCodesign(codesign: MacosCodesign): boolean {
  const args = ['tauri', 'build'];
  if (process.platform === 'darwin' && !codesign.enabled) {
    args.push('--no-sign');
  }

  const r = Bun.spawnSync(['bunx', ...args], {
    cwd: projectRoot,
    env: { ...process.env },
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  return r.success;
}

function keychainCodesignIdentities(): KeychainCodesignIdentity[] {
  if (process.platform !== 'darwin') {
    return [];
  }

  const r = Bun.spawnSync(
    ['security', 'find-identity', '-v', '-p', 'codesigning'],
    {
      cwd: projectRoot,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'ignore',
    },
  );
  if (!r.success || !r.stdout) {
    return [];
  }

  return r.stdout
    .toString()
    .split('\n')
    .map((line) => {
      const match = line.match(/^\s*\d+\)\s+([A-F0-9]+)\s+"([^"]+)"/);
      return match ? { hash: match[1], name: match[2] } : undefined;
    })
    .filter(
      (identity): identity is KeychainCodesignIdentity => Boolean(identity),
    );
}

function preferredCodesignIdentity(
  identities: KeychainCodesignIdentity[],
): KeychainCodesignIdentity | undefined {
  const preferredPatterns = [
    /^Developer ID Application:/,
    /^Apple Distribution:/,
    /^Apple Development:/,
  ];

  for (const pattern of preferredPatterns) {
    const identity = identities.find((value) => pattern.test(value.name));
    if (identity) {
      return identity;
    }
  }

  return identities[0];
}

function resolveMacosCodesign(args: ReleaseCliArgs): MacosCodesign {
  if (process.platform !== 'darwin') {
    return {
      enabled: false,
      description: 'not a macOS build host',
    };
  }

  if (args.noCodesign) {
    return {
      enabled: false,
      description: 'disabled by --no-codesign',
    };
  }

  const envIdentity =
    process.env.KOKOROS_CODESIGN_IDENTITY ?? process.env.APPLE_SIGNING_IDENTITY;
  const explicitIdentity = args.codesignIdentity ?? envIdentity;
  if (explicitIdentity) {
    return {
      enabled: true,
      identity: explicitIdentity,
      description: explicitIdentity,
    };
  }

  if (process.env.APPLE_CERTIFICATE) {
    return {
      enabled: true,
      description: 'identity inferred by Tauri from APPLE_CERTIFICATE',
    };
  }

  const identity = preferredCodesignIdentity(keychainCodesignIdentities());
  if (identity) {
    return {
      enabled: true,
      identity: identity.hash,
      description: `${identity.name} (${identity.hash})`,
    };
  }

  return {
    enabled: false,
    description: 'no valid keychain codesigning identity found',
  };
}

function tryExecFile(
  file: string,
  args: string[],
  cwd: string,
): { ok: boolean; stderr: string } {
  const r = Bun.spawnSync([file, ...args], {
    cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (r.success) {
    return { ok: true, stderr: '' };
  }
  const stderr = r.stderr ? r.stderr.toString() : '';
  return { ok: false, stderr };
}

function gitQuiet(args: string[]): boolean {
  const r = Bun.spawnSync(['git', ...args], {
    cwd: projectRoot,
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  });
  return r.success;
}

function gitStagedDiffQuiet(): boolean {
  const r = Bun.spawnSync(
    ['git', '-C', projectRoot, 'diff', '--cached', '--quiet'],
    {
      cwd: projectRoot,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    },
  );
  return r.success;
}

function currentGitBranch(): string {
  const r = Bun.spawnSync(['git', 'branch', '--show-current'], {
    cwd: projectRoot,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const branch = r.stdout ? r.stdout.toString().trim() : '';
  return branch || 'master';
}

function spawnGitInherit(args: string[]): void {
  const r = Bun.spawnSync(['git', ...args], {
    cwd: projectRoot,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (!r.success) {
    process.exit(r.exitCode === 0 ? 1 : r.exitCode);
  }
}

function spawnGhInherit(args: string[]): void {
  const r = Bun.spawnSync(['gh', ...args], {
    cwd: projectRoot,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (!r.success) {
    process.exit(r.exitCode === 0 ? 1 : r.exitCode);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { dryRun } = args;

  const currentVersion = await readTauriVersion(tauriConfPath);
  const nextVersion = nextPatchVersion(currentVersion);
  const branch = currentGitBranch();
  const macosCodesign = resolveMacosCodesign(args);

  console.log(`${YELLOW}Current version: ${currentVersion}${NC}`);
  console.log(`${GREEN}Next version:    ${nextVersion}${NC}`);
  if (process.platform === 'darwin') {
    const label = macosCodesign.enabled ? 'enabled' : 'disabled';
    console.log(
      `${CYAN}macOS codesign:  ${label} (${macosCodesign.description})${NC}`,
    );
  }
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const reply = await rl.question(
    `Bump version to ${nextVersion} before building? (y/N) `,
  );
  rl.close();
  console.log('');
  console.log('');

  let versionToBuild: string;
  let sameVersionRelease = false;

  if (/^[Yy]$/.test(reply.trim())) {
    versionToBuild = nextVersion;
    console.log(`${CYAN}Updating version numbers to ${nextVersion}...${NC}`);

    await replaceVersionInFile(
      tauriConfPath,
      currentVersion,
      nextVersion,
      'tauri-json',
    );
    console.log('  ✓ Updated tauri.conf.json');

    await replaceVersionInFile(
      packageJsonPath,
      currentVersion,
      nextVersion,
      'package-json',
    );
    console.log('  ✓ Updated package.json');

    await replaceVersionInFile(
      cargoTomlPath,
      currentVersion,
      nextVersion,
      'cargo',
    );
    console.log('  ✓ Updated Cargo.toml');
  } else {
    versionToBuild = currentVersion;
    sameVersionRelease = true;
    console.log(`${YELLOW}Keeping current version ${currentVersion}${NC}`);
  }

  console.log('');
  console.log(`${CYAN}Building release v${versionToBuild}...${NC}`);
  await ensureUpdaterSigningKey();
  if (
    !(await withUpdaterArtifactsEnabled(macosCodesign, () =>
      runTauriBuildWithCodesign(macosCodesign),
    ))
  ) {
    console.log(`${RED}Build failed!${NC}`);
    process.exit(1);
  }

  console.log(`${GREEN}Build complete!${NC}`);

  const dmgCandidate = await findDmgForVersion(versionToBuild);
  if (dmgCandidate === undefined || !(await Bun.file(dmgCandidate).exists())) {
    console.log(
      `${RED}Error: DMG not found for version ${versionToBuild} in ${dmgDir}${NC}`,
    );
    process.exit(1);
  }
  const dmgPath = dmgCandidate;
  const sha256 = await sha256File(dmgPath);

  const localDmgName = basename(dmgPath);
  const githubDmgName = githubReleaseDmgBasename(localDmgName);
  const updaterArchivePath = await findMacUpdaterArchive();
  if (
    updaterArchivePath === undefined ||
    !(await Bun.file(updaterArchivePath).exists())
  ) {
    console.log(
      `${RED}Error: updater archive not found in ${macosBundleDir}${NC}`,
    );
    process.exit(1);
  }
  const updaterSignaturePath = `${updaterArchivePath}.sig`;
  if (!(await Bun.file(updaterSignaturePath).exists())) {
    console.log(
      `${RED}Error: updater signature not found at ${updaterSignaturePath}${NC}`,
    );
    process.exit(1);
  }
  const latestUpdaterPath = await writeLatestUpdaterJson(
    versionToBuild,
    dmgPath,
    updaterArchivePath,
  );

  // Homebrew is not wired up for Kokoros yet.
  // await updateHomebrewCaskIfConfigured(versionToBuild, sha256, dmgPath);

  try {
    await deleteBunBuildArtifacts(projectRoot);
  } catch {
    // best-effort cleanup
  }

  console.log('');
  console.log(`${GREEN}═══════════════════════════════════════════════════════════════${NC}`);
  console.log(`${GREEN}SUCCESS! Release Ready${NC}`);
  console.log(`${GREEN}═══════════════════════════════════════════════════════════════${NC}`);
  console.log(`Version:          ${CYAN}${versionToBuild}${NC}`);
  console.log(`DMG Path:         ${CYAN}${dmgPath}${NC}`);
  console.log(`GitHub DMG Name:  ${CYAN}${githubDmgName}${NC}`);
  console.log(`Updater Archive:  ${CYAN}${updaterArchivePath}${NC}`);
  console.log(`Updater Sig:      ${CYAN}${updaterSignaturePath}${NC}`);
  console.log(`Updater JSON:     ${CYAN}${latestUpdaterPath}${NC}`);
  console.log(`SHA256:           ${CYAN}${sha256}${NC}`);
  console.log(`${GREEN}═══════════════════════════════════════════════════════════════${NC}`);

  if (!dryRun) {
    console.log('');
    console.log(`${CYAN}Publishing release...${NC}`);

    if (sameVersionRelease) {
      console.log('');
      console.log(
        `${YELLOW}Same version release — cleaning up any existing tag/release...${NC}`,
      );
      const ghDel = tryExecFile(
        'gh',
        ['release', 'delete', `v${versionToBuild}`, '--yes'],
        projectRoot,
      );
      if (ghDel.ok) {
        console.log(`${GREEN}  ✓ Deleted existing GitHub release${NC}`);
      } else {
        console.log(`${YELLOW}  ⏭ No existing GitHub release to delete${NC}`);
      }
      if (
        gitQuiet([
          '-C',
          projectRoot,
          'push',
          'origin',
          '--delete',
          `v${versionToBuild}`,
        ])
      ) {
        console.log(`${GREEN}  ✓ Deleted remote tag${NC}`);
      } else {
        console.log(`${YELLOW}  ⏭ No remote tag to delete${NC}`);
      }
      if (gitQuiet(['-C', projectRoot, 'tag', '-d', `v${versionToBuild}`])) {
        console.log(`${GREEN}  ✓ Deleted local tag${NC}`);
      } else {
        console.log(`${YELLOW}  ⏭ No local tag to delete${NC}`);
      }
      console.log('');
    }

    console.log(`${CYAN}Step 1: Committing changes...${NC}`);
    spawnGitInherit(['-C', projectRoot, 'add', '-A']);
    if (gitStagedDiffQuiet()) {
      console.log(`${YELLOW}  ⏭ Nothing to commit${NC}`);
    } else {
      spawnGitInherit([
        '-C',
        projectRoot,
        'commit',
        '-m',
        `Release v${versionToBuild}`,
      ]);
      console.log(`${GREEN}  ✓ Changes committed${NC}`);
    }

    console.log(`${CYAN}Step 2: Creating tag and pushing...${NC}`);
    spawnGitInherit(['-C', projectRoot, 'tag', `v${versionToBuild}`]);
    spawnGitInherit(['-C', projectRoot, 'push', 'origin', branch, '--tags']);
    console.log(`${GREEN}  ✓ Tag v${versionToBuild} pushed${NC}`);

    console.log(`${CYAN}Step 3: Creating GitHub release...${NC}`);
    spawnGhInherit([
      'release',
      'create',
      `v${versionToBuild}`,
      dmgPath,
      updaterArchivePath,
      updaterSignaturePath,
      latestUpdaterPath,
      '--title',
      `v${versionToBuild}`,
      '--generate-notes',
    ]);
    console.log(`${GREEN}  ✓ GitHub release created${NC}`);

    console.log('');
    console.log(`${GREEN}Release v${versionToBuild} published!${NC}`);
  } else {
    console.log('');
    console.log(`${CYAN}To publish this release:${NC}`);
    console.log('');

    if (sameVersionRelease) {
      console.log('  0. Clean up existing tag/release (errors are safe to ignore):');
      console.log(`     gh release delete v${versionToBuild} --yes`);
      console.log(`     git push origin --delete v${versionToBuild}`);
      console.log(`     git tag -d v${versionToBuild}`);
      console.log('');
    }

    console.log('  1. Commit changes:');
    console.log(`     git add -A && git commit -m "Release v${versionToBuild}"`);
    console.log('');
    console.log('  2. Create tag:');
    console.log(`     git tag v${versionToBuild}`);
    console.log(`     git push origin ${branch} --tags`);
    console.log('');
    console.log('  3. Create GitHub release:');
    console.log(
      `     gh release create v${versionToBuild} "${dmgPath}" "${updaterArchivePath}" "${updaterSignaturePath}" "${latestUpdaterPath}" --title "v${versionToBuild}" --generate-notes`,
    );
    console.log('');
    console.log(`${YELLOW}Tip: Omit --dry-run to publish automatically.${NC}`);
    console.log('');
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
