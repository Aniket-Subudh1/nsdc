import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { getOpenApiDocument } from "@/lib/server/openapi";

const routeRoot = fileURLToPath(new URL("../../app/api/v1", import.meta.url));
const httpMethods = ["get", "post", "put", "patch", "delete"] as const;

type HttpMethod = (typeof httpMethods)[number];
type OpenApiDocument = {
  components: Record<string, unknown>;
  paths: Record<string, Record<string, unknown>>;
};

function walkRouteFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return walkRouteFiles(entryPath);
    }

    return entry.isFile() && entry.name === "route.ts" ? [entryPath] : [];
  });
}

function routePathFromFile(filePath: string) {
  const relativePath = path.relative(routeRoot, filePath).replace(/\\/g, "/").replace(/(^|\/)route\.ts$/, "");
  const routePath = relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/^\[(.+)\]$/, "{$1}"))
    .join("/");

  return `/${routePath}`;
}

function implementedOperations() {
  return walkRouteFiles(routeRoot).flatMap((filePath) => {
    const source = fs.readFileSync(filePath, "utf8");
    const methods = [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((match) => match[1]?.toLowerCase() as HttpMethod);
    const apiPath = routePathFromFile(filePath);

    return methods.map((method) => `${method.toUpperCase()} ${apiPath}`);
  });
}

function documentedOperations(document: OpenApiDocument) {
  return Object.entries(document.paths).flatMap(([apiPath, pathItem]) =>
    httpMethods.filter((method) => pathItem[method]).map((method) => `${method.toUpperCase()} ${apiPath}`),
  );
}

function resolveRef(document: OpenApiDocument, refValue: string) {
  if (!refValue.startsWith("#/")) {
    return undefined;
  }

  return refValue
    .slice(2)
    .split("/")
    .reduce<unknown>((current, part) => (current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined), document);
}

function collectRefs(value: unknown, refs: string[] = []) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectRefs(entry, refs);
    }
    return refs;
  }

  if (!value || typeof value !== "object") {
    return refs;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (key === "$ref" && typeof entry === "string") {
      refs.push(entry);
      continue;
    }

    collectRefs(entry, refs);
  }

  return refs;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

describe("OpenAPI contract", () => {
  it("documents exactly the implemented route handlers", () => {
    const document = getOpenApiDocument() as OpenApiDocument;
    const implemented = implementedOperations().sort();
    const documented = documentedOperations(document).sort();

    expect(documented.filter((operation) => !implemented.includes(operation)), "documented operations without route handlers").toEqual([]);
    expect(implemented.filter((operation) => !documented.includes(operation)), "route handlers missing from OpenAPI docs").toEqual([]);
  });

  it("keeps every documented operation structurally valid", () => {
    const document = getOpenApiDocument() as OpenApiDocument;

    for (const [apiPath, pathItem] of Object.entries(document.paths)) {
      for (const method of httpMethods) {
        const operation = asRecord(pathItem[method]);

        if (!Object.keys(operation).length) {
          continue;
        }

        const operationName = `${method.toUpperCase()} ${apiPath}`;
        expect(operation.tags, `${operationName} tags`).toEqual(expect.arrayContaining([expect.any(String)]));
        expect(operation.summary, `${operationName} summary`).toEqual(expect.any(String));

        const responses = asRecord(operation.responses);
        expect(Object.keys(responses).length, `${operationName} response count`).toBeGreaterThan(0);
        expect(
          Object.keys(responses).filter((statusCode) => !/^(default|[1-5][0-9]{2})$/.test(statusCode)),
          `${operationName} invalid response keys`,
        ).toEqual([]);

        for (const [statusCode, response] of Object.entries(responses)) {
          expect(asRecord(response).description, `${operationName} ${statusCode} description`).toEqual(expect.any(String));
        }

        for (const refValue of collectRefs(operation)) {
          expect(resolveRef(document, refValue), `${operationName} unresolved ref ${refValue}`).toBeDefined();
        }
      }
    }
  });

  it("documents the SIDH batch metadata returned by batch APIs", () => {
    const document = getOpenApiDocument() as OpenApiDocument;
    const schemas = asRecord(document.components.schemas);
    const batchSchema = asRecord(schemas.Batch);
    const batchProperties = asRecord(batchSchema.properties);
    const requiredFields = Array.isArray(batchSchema.required) ? batchSchema.required : [];

    for (const field of ["batchSize", "startTime", "endTime", "trainingHoursPerDay", "fee"]) {
      expect(batchProperties[field], `Batch.${field} property`).toBeDefined();
      expect(requiredFields, `Batch.${field} required`).toContain(field);
    }
  });
});