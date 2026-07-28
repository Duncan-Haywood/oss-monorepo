import { describe, expect, it } from "vitest";
import {
  OPERATOR_DIGEST_CRON_ENV_NAMES,
  assessOperatorDigestCronEnvReadiness,
  isOperatorDigestCronSecretConfigured,
  listRequiredOperatorDigestCronEnvNames,
} from "./operator-digest-cron-env-readiness";

describe("listRequiredOperatorDigestCronEnvNames", () => {
  it("lists CRON_SECRET in stable order", () => {
    expect(listRequiredOperatorDigestCronEnvNames()).toEqual([
      ...OPERATOR_DIGEST_CRON_ENV_NAMES,
    ]);
    expect(listRequiredOperatorDigestCronEnvNames()).toEqual(["CRON_SECRET"]);
  });
});

describe("isOperatorDigestCronSecretConfigured", () => {
  it("rejects missing, empty, and whitespace-only values", () => {
    expect(isOperatorDigestCronSecretConfigured(undefined)).toBe(false);
    expect(isOperatorDigestCronSecretConfigured("")).toBe(false);
    expect(isOperatorDigestCronSecretConfigured("   ")).toBe(false);
    expect(isOperatorDigestCronSecretConfigured("\t")).toBe(false);
  });

  it("accepts a trimmed non-empty secret", () => {
    expect(isOperatorDigestCronSecretConfigured("abc123secret")).toBe(true);
    expect(isOperatorDigestCronSecretConfigured("  abc123secret  ")).toBe(true);
  });
});

describe("assessOperatorDigestCronEnvReadiness", () => {
  it("reports missing when env is empty", () => {
    const result = assessOperatorDigestCronEnvReadiness({});
    expect(result.ready).toBe(false);
    expect(result.required).toEqual(["CRON_SECRET"]);
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual(["CRON_SECRET"]);
  });

  it("treats whitespace-only as missing", () => {
    const result = assessOperatorDigestCronEnvReadiness({ CRON_SECRET: "   " });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["CRON_SECRET"]);
  });

  it("is ready when CRON_SECRET is set", () => {
    const result = assessOperatorDigestCronEnvReadiness({
      CRON_SECRET: "a-generated-random-token",
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual(["CRON_SECRET"]);
  });
});
