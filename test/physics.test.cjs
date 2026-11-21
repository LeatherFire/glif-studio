const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runInNewContext, createContext } = require("node:vm");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const env = createContext({ performance });
env.window = env;
for (const file of ["vendor/cannon.js", "src/world.js", "src/replay.js"]) {
  runInNewContext(readFileSync(join(__dirname, "..", file), "utf8"), env);
}
const settle = (world, seconds) => {
  for (let i = 0; i < seconds * 90; i++) world.step(1 / 90);
};
test("every preset settles with finite transforms and without startup fractures", () => {
  const world = new env.SandboxWorld();
  for (const name of ["kule", "domino", "duvar", "yigin"]) {
    world.loadPreset(name);
    const count = world.items().length;
    settle(world, 10);
    assert.equal(world.breaks, 0, name);
    assert.equal(world.items().length, count);
    assert.ok(
      world
        .items()
        .every((i) => Number.isFinite(i.position.y) && i.position.y >= 0),
    );
  }
});
test("a launched cube fractures the wall only while breakage is enabled", () => {
  for (const breakable of [true, false]) {
    const w = new env.SandboxWorld();
    w.loadPreset("duvar");
    settle(w, 1);
    w.setOptions({ breakable });
    w.launchCube();
    settle(w, 1);
    assert.equal(w.breaks > 0, breakable);
  }
});
test("mass and rebound reflect material; rubber survives a hard ground strike", () => {
  function drop(material) {
    const w = new env.SandboxWorld();
    w.clear();
    const body = w.blocks.get(w.addCube(material)).body;
    body.position.set(0, 4, 0);
    body.velocity.set(0, -9, 0);
    body.angularVelocity.setZero();
    let rebound = 0;
    for (let i = 0; i < 150; i++) {
      w.step(1 / 90);
      rebound = Math.max(rebound, body.velocity.y);
    }
    return { breaks: w.breaks, rebound, mass: body.mass };
  }
  const rubber = drop("rubber"),
    glass = drop("glass");
  assert.equal(rubber.breaks, 0);
  assert.ok(rubber.rebound > 5);
  assert.ok(glass.breaks > 0);
  assert.ok(glass.mass > rubber.mass);
});
test("recorder holds eight seconds, owns poses, interpolates antipodal rotations", () => {
  const t = new env.ReplayTape();
  const item = {
    id: 1,
    position: { x: 0, y: 0, z: 0 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    dims: { x: 1, y: 1, z: 1 },
    color: 0,
  };
  for (let i = 0; i < 250; i++) {
    item.position.x = i;
    item.quaternion.w = i % 2 ? -1 : 1;
    t.capture([item], 0);
  }
  assert.equal(t.duration, 8);
  assert.equal(t.frames.length, 241);
  item.position.x = -999;
  const pose = t.sample(0.5 / 30).items[0];
  assert.equal(pose.position.x, 9.5);
  assert.equal(Math.abs(pose.quaternion.w), 1);
});
test("fracture replaces the parent exactly on the recorded boundary", () => {
  const w = new env.SandboxWorld(),
    t = new env.ReplayTape();
  w.loadPreset("duvar");
  w.onSample = (items, breaks) => t.capture(items, breaks);
  w.launchCube();
  settle(w, 1);
  const i = t.frames.findIndex((f) => f.breaks > 0);
  assert.ok(i > 0);
  assert.equal(t.sample((i - 0.01) / 30).breaks, 0);
  assert.ok(t.sample(i / 30).breaks > 0);
});
