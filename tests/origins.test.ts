import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAllowedOrigins } from "../src/lib/origins.ts";

test("erlaubte Origins werden normalisiert und gefiltert", () => {
  assert.deepEqual(
    parseAllowedOrigins("https://www.beispiel.de/, https://beispiel.de  http://localhost:8080"),
    ["https://www.beispiel.de", "https://beispiel.de", "http://localhost:8080"],
  );
  assert.deepEqual(parseAllowedOrigins("http://beispiel.de ftp://x https://x.de/pfad *"), []);
  assert.deepEqual(parseAllowedOrigins(""), []);
  assert.deepEqual(parseAllowedOrigins(undefined), []);
});
