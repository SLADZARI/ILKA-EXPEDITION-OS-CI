import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, '..');
const repo = path.resolve(frontend, '..');
const outDir = path.join(frontend, 'src/design-system/generated');
await mkdir(outDir, { recursive: true });

const tokensDoc = JSON.parse(await readFile(path.join(repo, 'design-system/tokens/design-tokens.with-ids.json'), 'utf8'));
const catalog = JSON.parse(await readFile(path.join(repo, 'design-system/components/component-catalog.with-ids.json'), 'utf8'));

const cssLines = [
  '/* GENERATED from design-system/tokens/design-tokens.with-ids.json. Do not edit. */',
  ':root {',
];
for (const token of tokensDoc.tokens) {
  cssLines.push(`  --ilka-${token.id.replaceAll('_', '-')}: ${token.value};`);
}
cssLines.push('}', '');
await writeFile(path.join(outDir, 'tokens.css'), cssLines.join('\n'));

const tokenTs = [
  '// GENERATED from design-system/tokens/design-tokens.with-ids.json. Do not edit.',
  `export const DESIGN_TOKEN_VERSION = ${JSON.stringify(tokensDoc.meta.version)} as const;`,
  'export const TOKENS = {',
  ...tokensDoc.tokens.map((token) => `  ${JSON.stringify(token.id)}: ${JSON.stringify(token.value)},`),
  '} as const;',
  'export type DesignTokenId = keyof typeof TOKENS;',
  '',
].join('\n');
await writeFile(path.join(outDir, 'tokens.ts'), tokenTs);

const ids = [
  ...catalog.components.map((entry) => entry.id),
  ...catalog.screen_compositions.map((entry) => entry.id),
];
const componentTs = [
  '// GENERATED from design-system/components/component-catalog.with-ids.json. Do not edit.',
  `export const COMPONENT_CATALOG_VERSION = ${JSON.stringify(catalog.meta.version)} as const;`,
  'export const COMPONENT_IDS = {',
  ...ids.map((id) => `  ${id}: ${JSON.stringify(id)},`),
  '} as const;',
  'export type ComponentId = keyof typeof COMPONENT_IDS;',
  '',
].join('\n');
await writeFile(path.join(outDir, 'component-ids.ts'), componentTs);
