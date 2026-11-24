/// <reference types="node" />
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { validCallFileMetadata, validCallFileContent, MAX_CALL_FILE_BYTES } from "./call-sharing";

test("file sharing rejects unsafe types, paths, and over-limit files", () => {
  assert.equal(validCallFileMetadata("lab.pdf", "application/pdf", MAX_CALL_FILE_BYTES), true);
  assert.equal(validCallFileMetadata("lab.pdf", "application/pdf", MAX_CALL_FILE_BYTES + 1), false);
  assert.equal(validCallFileMetadata("rash.svg", "image/svg+xml", 200), false);
  assert.equal(validCallFileMetadata("../lab.pdf", "application/pdf", 200), false);
});
test("file sharing validates content rather than trusting a filename", async () => {
  assert.equal(await validCallFileContent(new Blob(["<script>alert(1)</script>"], { type: "application/pdf" })), false);
  assert.equal(await validCallFileContent(new Blob(["%PDF-1.7 sample"], { type: "application/pdf" })), true);
});