import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from "npm:ajv@8.20.0/dist/2020.js";
import addFormats from "npm:ajv-formats@3.0.1";

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
