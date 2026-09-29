import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { APICallError } from "ai";
import { Limited, limitedFromGateway, modelGate, resetReported } from "./guard.ts";

beforeEach(resetReported);

function deps(over: Partial<Parameters<typeof modelGate>[0]> = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      checkBot: async () => (calls.push("bot"), { isBot: false }),
      checkRate: async () => (calls.push("rate"), { rateLimited: false }),
      getHeaders: async () => new Headers(),
      env: {},
      ...over,
    },
  };
}

const reasonOf = async (gate: () => Promise<void>) =>
  gate().then(
    () => null,
    (error) => (error instanceof Limited ? error.reason : error),
  );

test("a clean request passes bot then rate checks in order", async () => {
  const { calls, deps: d } = deps();
  await modelGate(d)();
  assert.deepEqual(calls, ["bot", "rate"]);
});

test("the pause switch stops before any check", async () => {
  const { calls, deps: d } = deps({ env: { TOP9_MODELS: "off" } });
  assert.equal(await reasonOf(modelGate(d)), "paused");
  assert.deepEqual(calls, []);
});

test("a bot stops before the rate limit", async () => {
  const { calls, deps: d } = deps({ checkBot: async () => ({ isBot: true }) });
  assert.equal(await reasonOf(modelGate(d)), "bot");
  assert.deepEqual(calls, []);
});

test("a rate-limited or blocked IP is limited", async () => {
  for (const result of [{ rateLimited: true }, { rateLimited: false, error: "blocked" as const }]) {
    const { deps: d } = deps({ checkRate: async () => result });
    assert.equal(await reasonOf(modelGate(d)), "ip");
  }
});

test("two gate calls run the checks once", async () => {
  const { calls, deps: d } = deps();
  const gate = modelGate(d);
  await Promise.all([gate(), gate()]);
  await gate();
  assert.deepEqual(calls, ["bot", "rate"]);
});

test("a limited result is remembered for the request", async () => {
  const { calls, deps: d } = deps({ env: { TOP9_MODELS: "off" } });
  const gate = modelGate(d);
  assert.equal(await reasonOf(gate), "paused");
  assert.equal(await reasonOf(gate), "paused");
  assert.deepEqual(calls, []);
});

test("a missing rate rule fails open", async () => {
  const { deps: d } = deps({ checkRate: async () => ({ rateLimited: false, error: "not-found" }) });
  assert.equal(await reasonOf(modelGate(d)), null);
});

test("a throwing BotID or firewall SDK fails open", async () => {
  const boom = async () => {
    throw new Error("sdk down");
  };
  assert.equal(await reasonOf(modelGate(deps({ checkBot: boom }).deps)), null);
  assert.equal(await reasonOf(modelGate(deps({ checkRate: boom }).deps)), null);
});

test("a 402 from the gateway, or its quota code, maps to budget", () => {
  const call = (statusCode: number, responseBody?: string) =>
    new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode, responseBody });
  assert.equal(limitedFromGateway(call(402))?.reason, "budget");
  assert.equal(limitedFromGateway(call(400, '{"error":"quota_for_entity_exceeded"}'))?.reason, "budget");
  assert.equal(limitedFromGateway(new Error("wrap", { cause: call(402) }))?.reason, "budget");
  assert.equal(limitedFromGateway(call(500)), null);
  assert.equal(limitedFromGateway(new Error("plain")), null);
  assert.equal(limitedFromGateway(undefined), null);
});
