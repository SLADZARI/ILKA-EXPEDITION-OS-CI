import Ajv2020Module from "npm:ajv@8.20.0/dist/2020.js";
import addFormatsModule from "npm:ajv-formats@3.0.1";
import type { ErrorObject, ValidateFunction } from "npm:ajv@8.20.0";

import eventSchema from "../../../../engine/event.schema.json" with {
  type: "json",
};
import setupViewSchema from "../../../../app/contracts/expedition-setup-view.schema.json" with {
  type: "json",
};
import invitationProcessSchema from "../../../contracts/private-invitation-process-command-request.schema.json" with {
  type: "json",
};
import inviteRequestSchema from "../../../contracts/private-invite-participant-request.schema.json" with {
  type: "json",
};
import acceptRequestSchema from "../../../contracts/private-accept-invitation-request.schema.json" with {
  type: "json",
};
import revokeRequestSchema from "../../../contracts/private-revoke-invitation-request.schema.json" with {
  type: "json",
};

import type { ValidationIssue } from "./types.ts";

interface AjvLike {
  compile(schema: unknown): ValidateFunction;
}

type AjvConstructor = new (options: Record<string, unknown>) => AjvLike;

export interface InvitationRequestValidator {
  validateInvite(value: unknown): ValidationIssue[];
  validateAccept(value: unknown): ValidationIssue[];
  validateRevoke(value: unknown): ValidationIssue[];
}

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
    record.$ref === "./private-invitation-process-command-request.schema.json" ||
    record.$ref === invitationProcessSchema.$id
  ) {
    return normalizeRefs(cloneWithoutIdentity(invitationProcessSchema));
  }
  if (
    record.$ref === "../../engine/event.schema.json" ||
    record.$ref === eventSchema.$id
  ) {
    return normalizeRefs(cloneWithoutIdentity(eventSchema));
  }
  if (
    record.$ref === "../../app/contracts/expedition-setup-view.schema.json" ||
    record.$ref === setupViewSchema.$id
  ) {
    return normalizeRefs(cloneWithoutIdentity(setupViewSchema));
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

function validate(
  validator: ValidateFunction,
  value: unknown,
): ValidationIssue[] {
  return validator(value) ? [] : issues(validator.errors);
}

export function createInvitationRequestValidator(): InvitationRequestValidator {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: true,
  });
  addFormats(ajv);

  const invite = ajv.compile(normalizeRefs(inviteRequestSchema));
  const accept = ajv.compile(normalizeRefs(acceptRequestSchema));
  const revoke = ajv.compile(normalizeRefs(revokeRequestSchema));

  return {
    validateInvite(value: unknown): ValidationIssue[] {
      return validate(invite, value);
    },
    validateAccept(value: unknown): ValidationIssue[] {
      return validate(accept, value);
    },
    validateRevoke(value: unknown): ValidationIssue[] {
      return validate(revoke, value);
    },
  };
}
