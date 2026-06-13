import { test } from "node:test";
import assert from "node:assert/strict";
import { inferEquipmentFromName, looksEnglish } from "../catalog";

test("looksEnglish accepts real English exercise entries", () => {
  const ok: [string, string][] = [
    ["Bench Press", "Lie on the bench and press the barbell up from your chest."],
    ["Zercher Squats", "Hold the bar in the crook of your elbows and squat down."],
    ["Devil’s Press", "A combination of a burpee and a double dumbbell snatch."],
    ["Romanian Deadlift", ""],
    ["Front Plate Raise", "Raise the plate to shoulder height with straight arms."],
  ];
  for (const [name, desc] of ok) {
    assert.ok(looksEnglish(name, desc), `"${name}" was wrongly flagged as non-English`);
  }
});

test("looksEnglish rejects entries with foreign names or descriptions", () => {
  const bad: [string, string][] = [
    ["Jalón al pecho con agarre ancho", "The lat pulldown targets the lats."],
    ["Jalon caballero unialteral", "Pull performed in knight's stance"],
    ["Flexión lateral", ""],
    ["Liegestütze (Knie oder klassisch)", ""],
    ["Dumbbell Deadlift", "- Kontrollierte Ausführung\n- Kein Schwung holen\n- Langsame Ausführung"],
    ["TRX roll out", "sostener las empuñaduras con las manos, alargar los brazos"],
    ["Reach ups", "Pour effectuer cet exercice, allongez-vous sur le dos, bras étendus"],
  ];
  for (const [name, desc] of bad) {
    assert.ok(!looksEnglish(name, desc), `"${name}" slipped past the language check`);
  }
});

test("inferEquipmentFromName tags gear hidden in the exercise name", () => {
  assert.deepEqual(inferEquipmentFromName("Machine Hip Abduction"), ["Machine"]);
  assert.deepEqual(inferEquipmentFromName("Cable Fly"), ["Cable"]);
  assert.deepEqual(inferEquipmentFromName("Single-Arm Lat Pulldown"), ["Cable"]);
  assert.deepEqual(inferEquipmentFromName("SMITH MACHINE SLIGHT INCLINE PRESS"), [
    "Smith machine",
    "Machine",
  ]);
  assert.deepEqual(inferEquipmentFromName("Dumbbells on Scott Machine"), [
    "Machine",
    "Dumbbell",
  ]);
  assert.deepEqual(inferEquipmentFromName("Biceps with TRX"), ["Other"]);
  assert.deepEqual(inferEquipmentFromName("Crunch - Legs On Exercise Ball"), ["Swiss Ball"]);
  assert.deepEqual(inferEquipmentFromName("Push-Up"), []);
  assert.deepEqual(inferEquipmentFromName("Bodyweight Squat"), []);
  assert.deepEqual(inferEquipmentFromName("Plank"), []);
});
