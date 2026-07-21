import Ajv2020Module from "npm:ajv@8.20.0/dist/2020.js";
import addFormatsModule from "npm:ajv-formats@3.0.1";
import type { ErrorObject, ValidateFunction } from "npm:ajv@8.20.0";

import commandSchema from "../../../../schemas/command.schema.json" with {
  type: "json",
};
import eventSchema from "../../../../engine/event.schema.json" with {
  type: "json",
};
import bootstrapRequestSchema from "../../../contracts/private-bootstrap-expedition-request.schema.json" with {
  type: "json",
};
import processRequestSchema from "../../../contracts/private-process-command-request.schema.json" with {
  type: "json",
};

import type { ValidationIssue } from "./types.ts";

interface AjvLike {
  compile(schema: unknown): ValidateFunction;
}

type AjvConstructor = new (options: Record<string, unknown>) => AjvLike;

function commonJsDefault(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    "default" in value
  ) {
    return (value as { default: unknown }).default;
  }
  return value;
}

function cloneWithoutIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneWithoutIdentity);
  if (value === null || typeof value !== "object") return value;

  const cloned: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key !== "$id") cloned[key] = cloneWithoutIdentity(item);
  }
  return cloned;
}

function normalizeRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeRefs);
  if (value === null || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  if (
    record.$ref === "../../schemas/command.schema.json" ||
    record.$ref === commandSchema.$id
  ) {
    return normalizeRefs(cloneWithoutIdentity(commandSchema));
  }
  if (
    record.$ref === "../../engine/event.schema.json" ||
    record.$ref === eventSchema.$id
  ) {
    return normalizeRefs(cloneWithoutIdentity(eventSchema));
  }
  if (
    record.$ref === "./private-process-command-request.schema.json" ||
    record.$ref === processRequestSchema.$id
  ) {
    return normalizeRefs(cloneWithoutIdentity(processRequestSchema));
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    normalized[key] = normalizeRefs(item);
  }
  return normalized;
}

const Ajv2020 = commonJsDefault(Ajv2020Module) as AjvConstructor;
const addFormats = commonJsDefault(addFormatsModule) as (
  ajv: AjvLike,
) => unknown;

function issues(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((error) => ({
    path: error.instancePath || "/",
    message: error.message ?? error.keyword,
  }));
}

export function createBootstrapRequestValidator(): (
  value: unknown,
) => ValidationIssue[] {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: true,
  });
  addFormats(ajv);
  const validator = ajv.compile(normalizeRefs(bootstrapRequestSchema));
  return (value: unknown) => validator(value) ? [] : issues(validator.errors);
}
