const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const { completeJson, LlmError, extractJson, estimateCostUsd } = require("../lib/llm.js");

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

function stubFetch(responses) {
  let i = 0;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    const r = responses[Math.min(i++, responses.length - 1)];
    return {
      ok: r.status === undefined || r.status < 400,
      status: r.status || 200,
      text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
    };
  };
  return calls;
}

function reply(content, usage) {
  return { body: { choices: [{ message: { content } }], usage } };
}

const SCHEMA = { type: "object", properties: { title: { type: "string" } }, required: ["title"] };
const MESSAGES = [{ role: "user", content: "hola" }];

test("parses a well-formed structured response", async () => {
  stubFetch([reply('{"title":"El faro"}')]);
  const r = await completeJson({ messages: MESSAGES, schema: SCHEMA });
  assert.deepStrictEqual(r.data, { title: "El faro" });
});

test("sends the schema as a strict json_schema response_format", async () => {
  const calls = stubFetch([reply('{"title":"x"}')]);
  await completeJson({ messages: MESSAGES, schema: SCHEMA });
  assert.strictEqual(calls[0].body.response_format.type, "json_schema");
  assert.strictEqual(calls[0].body.response_format.json_schema.strict, true);
});

test("strips markdown fences before parsing", async () => {
  stubFetch([reply('```json\n{"title":"El faro"}\n```')]);
  const r = await completeJson({ messages: MESSAGES, schema: SCHEMA });
  assert.strictEqual(r.data.title, "El faro");
});

test("strips <think> blocks before parsing", async () => {
  stubFetch([reply('<think>Voy a pensar mucho {"no":"esto"}</think>{"title":"El faro"}')]);
  const r = await completeJson({ messages: MESSAGES, schema: SCHEMA });
  assert.strictEqual(r.data.title, "El faro");
});

test("tolerates prose around the JSON object", async () => {
  stubFetch([reply('Claro, aquí tienes:\n{"title":"El faro"}\n¡Espero que te guste!')]);
  const r = await completeJson({ messages: MESSAGES, schema: SCHEMA });
  assert.strictEqual(r.data.title, "El faro");
});

test("repairs a trailing comma", async () => {
  stubFetch([reply('{"title":"El faro",}')]);
  const r = await completeJson({ messages: MESSAGES, schema: SCHEMA });
  assert.strictEqual(r.data.title, "El faro");
});

test("retries on HTTP 429 and succeeds", async () => {
  const calls = stubFetch([{ status: 429, body: { error: "slow down" } }, reply('{"title":"ok"}')]);
  const r = await completeJson({ messages: MESSAGES, schema: SCHEMA, retryDelayMs: 0 });
  assert.strictEqual(r.data.title, "ok");
  assert.strictEqual(calls.length, 2);
});

test("retries when the body is not JSON at all", async () => {
  const calls = stubFetch([reply("lo siento, no puedo"), reply('{"title":"ok"}')]);
  const r = await completeJson({ messages: MESSAGES, schema: SCHEMA, retryDelayMs: 0 });
  assert.strictEqual(r.data.title, "ok");
  assert.strictEqual(calls.length, 2);
});

test("throws LlmError after three failures", async () => {
  stubFetch([{ status: 500, body: { error: "boom" } }]);
  await assert.rejects(
    () => completeJson({ messages: MESSAGES, schema: SCHEMA, retryDelayMs: 0 }),
    (e) => e instanceof LlmError && /500/.test(e.message)
  );
});

test("reports cost from the usage block when the provider gives it", async () => {
  stubFetch([reply('{"title":"x"}', { prompt_tokens: 1000, completion_tokens: 2000, cost: 0.0123 })]);
  const r = await completeJson({ messages: MESSAGES, schema: SCHEMA });
  assert.strictEqual(r.costUsd, 0.0123);
});

test("estimates cost from tokens when the provider gives no cost", async () => {
  stubFetch([reply('{"title":"x"}', { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 })]);
  const r = await completeJson({ messages: MESSAGES, schema: SCHEMA, model: "google/gemini-2.5-flash-lite" });
  // 0.10 in + 0.40 out per million
  assert.ok(Math.abs(r.costUsd - 0.5) < 0.001, `got ${r.costUsd}`);
});

test("estimateCostUsd returns 0 for an unknown model instead of guessing", () => {
  assert.strictEqual(estimateCostUsd("some/unknown-model", 1000, 1000), 0);
});

test("extractJson finds the outermost object even with nested braces", () => {
  const src = 'texto {"a":{"b":1},"c":"}"} más texto';
  assert.deepStrictEqual(extractJson(src), { a: { b: 1 }, c: "}" });
});

test("extractJson returns null when there is no object", () => {
  assert.strictEqual(extractJson("no hay nada aquí"), null);
});

test("strictSchema makes every property required and drops length keywords", () => {
  const { strictSchema } = require("../lib/llm.js");
  const src = {
    type: "object",
    required: ["a"],
    properties: {
      a: { type: "string", minLength: 3, maxLength: 9 },
      b: { type: ["string", "null"], maxLength: 5 },
      list: { type: "array", minItems: 2, items: { type: "object", properties: { n: { type: "integer", minimum: 1 } } } },
    },
  };
  const out = strictSchema(src);
  assert.deepStrictEqual(out.required, ["a", "b", "list"]);
  assert.strictEqual(out.additionalProperties, false);
  assert.ok(!("minLength" in out.properties.a) && !("maxLength" in out.properties.a));
  assert.ok(!("minItems" in out.properties.list));
  assert.deepStrictEqual(out.properties.list.items.required, ["n"]);
  assert.ok(!("minimum" in out.properties.list.items.properties.n));
  // the original is untouched
  assert.deepStrictEqual(src.required, ["a"]);
});

test("the request carries the strict projection, not the raw schema", async () => {
  const calls = stubFetch([reply('{"title":"x"}')]);
  await completeJson({ messages: MESSAGES, schema: { type: "object", properties: { title: { type: "string", minLength: 1 } } } });
  const sent = calls[0].body.response_format.json_schema.schema;
  assert.deepStrictEqual(sent.required, ["title"]);
  assert.ok(!("minLength" in sent.properties.title));
});

test("asks reasoning models for low effort so the story is not truncated", async () => {
  const calls = stubFetch([reply('{"title":"x"}')]);
  await completeJson({ messages: MESSAGES, schema: SCHEMA, model: "openai/gpt-5-mini" });
  assert.deepStrictEqual(calls[0].body.reasoning, { effort: "low" });
});

test("does not send a reasoning block to non-reasoning models", async () => {
  const calls = stubFetch([reply('{"title":"x"}')]);
  await completeJson({ messages: MESSAGES, schema: SCHEMA, model: "google/gemini-2.5-flash-lite" });
  assert.strictEqual(calls[0].body.reasoning, undefined);
});
