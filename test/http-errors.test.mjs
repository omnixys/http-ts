import assert from "node:assert/strict";
import test from "node:test";
import { ContextAccessor } from "@omnixys/context-ts";
import { FrameworkException } from "@omnixys/contracts-ts";
import { createHttpErrorResponse } from "../dist/index.js";

test("HTTP errors expose only the public contract", () => {
  ContextAccessor.run(
    {
      requestId: "req-1",
      correlationId: "corr-1",
      startedAtEpochMs: Date.now(),
      client: {},
      transport: { type: "http", operation: "loadUser" },
      trace: { traceId: "trace-1", spanId: "span-1" },
      principal: { subject: "user-1", actorId: "actor-1", roles: [] },
      tenant: { tenantId: "tenant-1", source: "verified-principal", verified: true },
    },
    () => {
      const cause = new Error("database password leaked");
      const error = new FrameworkException("USER_NOT_FOUND", "User was not found.", {
        cause,
        metadata: { userId: "user-1", password: "secret", sql: "select *" },
        diagnostics: { sql: "select *", password: "secret" },
      });
      const response = createHttpErrorResponse(error, { serviceName: "user-service" });

      assert.equal(response.statusCode, 404);
      assert.equal(response.service, "user");
      assert.equal(response.operation, "loadUser");
      assert.deepEqual(response.metadata, { userId: "user-1" });
      assert.equal("actorId" in response, false);
      assert.equal("tenantId" in response, false);
      assert.equal("cause" in response, false);
      assert.equal("diagnostics" in response, false);
      assert.equal(JSON.stringify(response).includes("password"), false);
      assert.equal(JSON.stringify(response).includes("select *"), false);
    },
  );
});

test("HTTP 5xx responses never expose internal exception messages", () => {
  const response = createHttpErrorResponse(
    new FrameworkException(
      "AUTHENTICATION_INTERNAL_ERROR",
      "Axios failed with client_secret=do-not-leak",
      { diagnostics: { headers: { authorization: "Bearer secret" } } },
    ),
    { serviceName: "authentication" },
  );

  assert.equal(response.message, "An unexpected error occurred.");
  assert.equal(JSON.stringify(response).includes("do-not-leak"), false);
  assert.equal(JSON.stringify(response).includes("Bearer secret"), false);
});
