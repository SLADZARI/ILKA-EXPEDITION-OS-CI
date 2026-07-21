import { createSupabaseAuthVerifier } from "../_shared/command-gateway/auth.ts";
import { PostgresBootstrapDatabase } from "../_shared/command-gateway/bootstrap-database.ts";
import { createExpeditionBootstrapExecutor } from "../_shared/command-gateway/bootstrap.ts";
import { PostgresGatewayDatabase } from "../_shared/command-gateway/database.ts";
import { createCommandGatewayHandler } from "../_shared/command-gateway/handler.ts";
import { commandGatewayRuntimeRegistry } from "../_shared/command-gateway/runtime-registry.ts";
import { createSchemaValidator } from "../_shared/command-gateway/schema-validation.ts";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_environment_variable:${name}`);
  return value;
}

function allowedOrigins(): ReadonlySet<string> {
  const configured = Deno.env.get("ILKA_ALLOWED_ORIGINS");
  const values = configured
    ? configured.split(",").map((value) => value.trim()).filter(Boolean)
    : [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ];
  return new Set(values);
}

const supabaseUrl = requiredEnv("SUPABASE_URL");
const projectPublicKey = Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  requiredEnv("SUPABASE_ANON_KEY");
const connectionString = requiredEnv("SUPABASE_DB_URL");
const database = new PostgresGatewayDatabase(connectionString);
const bootstrapDatabase = new PostgresBootstrapDatabase(connectionString);
const schemas = createSchemaValidator();
const auth = createSupabaseAuthVerifier({
  baseUrl: supabaseUrl,
  projectPublicKey,
});
const now = () => new Date();

const bootstrapExecutor = createExpeditionBootstrapExecutor({
  database: bootstrapDatabase,
  schemas,
  runtimes: commandGatewayRuntimeRegistry,
  defaultRuntimeReleaseKey: requiredEnv("ILKA_DEFAULT_RUNTIME_RELEASE_KEY"),
  now,
  uuid: () => crypto.randomUUID(),
});

const handler = createCommandGatewayHandler({
  auth,
  database,
  schemas,
  runtimes: commandGatewayRuntimeRegistry,
  allowedOrigins: allowedOrigins(),
  now,
  requestId: () => crypto.randomUUID(),
}, bootstrapExecutor);

Deno.serve(handler);
