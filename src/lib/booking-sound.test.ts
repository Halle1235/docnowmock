import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createBookingSound } from "./booking-sound";

function fixture() {
  let tones = 0;
  const context = {
    state: "suspended", currentTime: 0, destination: {},
    async resume() { this.state = "running"; },
    createOscillator: () => ({ frequency: { value: 0 }, connect() {}, disconnect() {}, start() { tones++; }, stop() {}, onended: null }),
    createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }),
  };
  return { sound: createBookingSound(() => context as unknown as AudioContext), tones: () => tones };
}
test("doctor arrival sound requires activation and an open doctor screen", async () => {
  const { sound, tones } = fixture();
  assert.equal(sound.play("doctor"), false);
  const unmount = sound.mount("doctor");
  assert.equal(sound.play("doctor"), false);
  assert.equal(await sound.activate(), true);
  assert.equal(sound.play("doctor"), true);
  assert.equal(tones(), 1);
  unmount(); assert.equal(sound.play("doctor"), false);
});
test("patient acceptance sound is independent from doctor mute", async () => {
  const { sound, tones } = fixture();
  sound.mount("patient"); sound.mount("doctor"); await sound.activate();
  sound.setEnabled("doctor", false);
  assert.equal(sound.play("doctor"), false);
  assert.equal(sound.play("patient"), true);
  sound.setEnabled("patient", false);
  assert.equal(sound.play("patient"), false);
  assert.equal(tones(), 1);
});
test("unavailable audio fails safely without enabling sound", async () => {
  const sound = createBookingSound(() => { throw new Error("Unavailable"); });
  sound.mount("patient");
  assert.equal(await sound.activate(), false);
  assert.equal(sound.play("patient"), false);
});