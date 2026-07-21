import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, '..');
const repo = path.resolve(frontend, '..');
const outDir = path.join(frontend, 'src/contracts/generated');
await mkdir(outDir, { recursive: true });

const quote = (value) => JSON.stringify(value);
const safeName = (value) => value.replace(/[^a-zA-Z0-9_]/g, '_');

function schemaType(schema, indent = 0) {
  if (!schema || Object.keys(schema).length === 0) return 'unknown';
  if (schema.const !== undefined) return quote(schema.const);
  if (schema.enum) return schema.enum.map(quote).join(' | ');
  if (schema.oneOf) return schema.oneOf.map((entry) => schemaType(entry, indent)).join(' | ');
  if (schema.anyOf) return schema.anyOf.map((entry) => schemaType(entry, indent)).join(' | ');
  if (Array.isArray(schema.type)) {
    return schema.type.map((type) => type === 'null' ? 'null' : schemaType({ ...schema, type }, indent)).join(' | ');
  }
  if (schema.type === 'null') return 'null';
  if (schema.type === 'array') return `Array<${schemaType(schema.items ?? {}, indent)}>`;
  if (schema.type === 'object' || schema.properties) {
    const required = new Set(schema.required ?? []);
    const pad = ' '.repeat(indent);
    const inner = ' '.repeat(indent + 2);
    const lines = Object.entries(schema.properties ?? {}).map(([key, value]) =>
      `${inner}${quote(key)}${required.has(key) ? '' : '?'}: ${schemaType(value, indent + 2)};`
    );
    if (schema.additionalProperties && schema.additionalProperties !== false) {
      lines.push(`${inner}[key: string]: unknown;`);
    }
    return `{\n${lines.join('\n')}\n${pad}}`;
  }
  if (schema.type === 'string') return 'string';
  if (schema.type === 'integer' || schema.type === 'number') return 'number';
  if (schema.type === 'boolean') return 'boolean';
  return 'unknown';
}

async function generateSimple(relativeInput, outputName, exportName) {
  const schema = JSON.parse(await readFile(path.join(repo, relativeInput), 'utf8'));
  const content = [
    `/* GENERATED from ${relativeInput}. Do not edit. */`,
    `export type ${exportName} = ${schemaType(schema)};`,
    '',
  ].join('\n');
  await writeFile(path.join(outDir, `${outputName}.ts`), content);
}

await generateSimple('app/contracts/today-view.schema.json', 'today-view', 'TodayView');
await generateSimple('app/contracts/captain-day-view.schema.json', 'captain-day-view', 'CaptainDayView');
await generateSimple('schemas/gamification.schema.json', 'gamification-view', 'GamificationView');
await generateSimple(
  'supabase/contracts/private-process-command-result.schema.json',
  'command-result',
  'CommandResult',
);

const offlinePath = 'app/contracts/offline-command.schema.json';
const offlineSchema = JSON.parse(await readFile(path.join(repo, offlinePath), 'utf8'));
const offlineTypes = offlineSchema.properties.command_type.enum;
const offlineContent = [
  `/* GENERATED from ${offlinePath}. Do not edit. */`,
  `export const OFFLINE_COMMAND_TYPES = ${JSON.stringify(offlineTypes)} as const;`,
  `export type OfflineCommandType = typeof OFFLINE_COMMAND_TYPES[number];`,
  `export type OfflineCommand = ${schemaType(offlineSchema)};`,
  '',
].join('\n');
await writeFile(path.join(outDir, 'offline-command.ts'), offlineContent);

const commandPath = 'schemas/command.schema.json';
const commandSchema = JSON.parse(await readFile(path.join(repo, commandPath), 'utf8'));
const commonProperties = { ...commandSchema.properties };
delete commonProperties.command_type;
delete commonProperties.payload;
const commandTypes = commandSchema.properties.command_type.enum;
const payloadByType = new Map();
for (const branch of commandSchema.allOf ?? []) {
  const commandType = branch?.if?.properties?.command_type?.const;
  const payload = branch?.then?.properties?.payload;
  if (commandType && payload) payloadByType.set(commandType, payload);
}
const lines = [
  `/* GENERATED from ${commandPath}. Do not edit. */`,
  `export type CommandType = ${commandTypes.map(quote).join(' | ')};`,
  `export type ActorRole = ${commandSchema.properties.actor_role.enum.map(quote).join(' | ')};`,
  `export type CommandEnvelopeBase = ${schemaType({ type: 'object', required: commandSchema.required.filter((key) => !['command_type', 'payload'].includes(key)), properties: commonProperties })};`,
  '',
];
for (const commandType of commandTypes) {
  lines.push(`export type ${safeName(commandType)}Payload = ${schemaType(payloadByType.get(commandType) ?? { type: 'object', additionalProperties: true })};`);
}
lines.push('', 'export interface CommandPayloadByType {');
for (const commandType of commandTypes) lines.push(`  ${quote(commandType)}: ${safeName(commandType)}Payload;`);
lines.push('}', '', 'export type Command = {', '  [K in CommandType]: CommandEnvelopeBase & { command_type: K; payload: CommandPayloadByType[K] }', '}[CommandType];', '');
await writeFile(path.join(outDir, 'command.ts'), lines.join('\n'));
