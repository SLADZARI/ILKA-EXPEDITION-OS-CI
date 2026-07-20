import Ajv2020Module from "npm:ajv@8.20.0/dist/2020.js";
import addFormatsModule from "npm:ajv-formats@3.0.1";
import type {
  ErrorObject,
  ValidateFunction,
} from "npm:ajv@8.20.0";

import commandSchema from "../../../../schemas/command.schema.json" with {
  type: "json",
};
import eventSchema from "../../../../engine/event.schema.json" with {
  type: "json",
};
import processRequestSchema from "../../../contracts/private-process-command-request.schema.json" with {
  type: "json",
};
import processResultSchema from "../../../contracts/private-process-command-result.schema.json" with {
  type: "json",
};

import type {
  SchemaValidator,
  ValidationIssue,
} from "./types.ts";

interface AjvLike {
  addSchema(schema: unknown): AjvLike;
  getSchema(key: string): ValidateFunction | undefined;
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

function validate(
  validator: ValidateFunction,
  value: unknown,
): ValidationIssue[] {
  return validator(value) ? [] : issues(validator.errors);
}

export function createSchemaValidator(): SchemaValidator {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: true,
  });
  addFormats(ajv);

  ajv.addSchema(commandSchema);
  ajv.addSchema(eventSchema);

  const command = ajv.getSchema(commandSchema.$id) ?? ajv.compile(commandSchema);
  const event = ajv.getSchema(eventSchema.$id) ?? ajv.compile(eventSchema);
  const processRequest = ajv.compile(processRequestSchema);
  const processResult = ajv.compile(processResultSchema);

  return {
    validateCommand(value: unknown): ValidationIssue[] {
      return validate(command, value);
    },
    validatePreparedEvent(value: unknown): ValidationIssue[] {
      return validate(event, value);
    },
    validateProcessRequest(value: unknown): ValidationIssue[] {
      return validate(processRequest, value);
    },
    validateProcessResult(value: unknown): ValidationIssue[] {
      return validate(processResult, value);
    },
  };
}
