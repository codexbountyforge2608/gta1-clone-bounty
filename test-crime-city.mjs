import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const file = new URL("./crime-city.html", import.meta.url);
const html = fs.readFileSync(file, "utf8");
const bytes = fs.statSync(file).size;

assert.ok(bytes < 400 * 1024, `artifact is ${bytes} bytes`);
assert.equal((html.match(/<script(?:\s|>)/gi) || []).length, 1, "exactly one script");
assert.equal((html.match(/<\/script>/gi) || []).length, 1, "one script close");
assert.doesNotMatch(html, /https?:\/\//i, "no remote URLs");
assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(/, "no networking APIs");
assert.doesNotMatch(html, /<script[^>]+src\s*=|<link[^>]+rel\s*=\s*["']stylesheet/i, "no external assets");

for (let n = 1; n <= 20; n++) {
  const id = String(n).padStart(2, "0");
  assert.match(html, new RegExp(`/\\* =+ ${id} [^*]+ =+ \\*/`), `banner ${id}`);
}

for (const feature of [
  "function carControl", "HEAT_PER_LEVEL", "scoreShown", "fixtures.phones",
  "const Mission", "fixtures.crusher", "SPRAY_COST", "function fireWeapon",
  "function wantedStep", "function drawMinimap", "localStorage.setItem"
]) assert.ok(html.includes(feature), `feature marker: ${feature}`);

const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
assert.ok(script, "inline game script found");
new Function(script);

function element(id = "") {
  const classes = new Set(id === "pauseScreen" || id === "cardScreen" ? ["hidden"] : []);
  return {
    id, width: id === "mini" ? 142 : 960, height: id === "mini" ? 142 : 640,
    textContent: "", className: "", offsetWidth: 1, children: [], style: {},
    classList: {
      add: (...xs) => xs.forEach(x => classes.add(x)),
      remove: (...xs) => xs.forEach(x => classes.delete(x)),
      contains: x => classes.has(x),
      toggle: (x, force) => {
        const on = force === undefined ? !classes.has(x) : !!force;
        on ? classes.add(x) : classes.delete(x);
        return on;
      }
    },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
    getContext() { return new Proxy({}, { get: (o, k) => o[k] ?? (() => {}) }); }
  };
}

const elements = new Map();
const document = {
  getElementById(id) { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); },
  createElement(tag) { return element(tag); }
};
const localStorage = { getItem: () => null, setItem() {} };
const sandbox = {
  console, document, localStorage,
  performance: { now: () => 0 },
  requestAnimationFrame() {},
  addEventListener() {},
  setTimeout() {},
  matchMedia: () => ({ matches: false }),
  Uint8Array, Map, Set, Math, JSON
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(script, sandbox, { filename: "crime-city.inline.js" });

const api = sandbox.__crimeSimTest;
assert.ok(api, "simulation test API exported");
assert.equal(api.TUNE.MAP, 256);
assert.equal(api.TUNE.ZLEVELS, 6);
assert.equal(api.TUNE.HEAT_MAX / api.TUNE.HEAT_PER_LEVEL, 6);
assert.equal(api.CAR_TYPES.length, 5);
assert.equal(api.WEAPONS.length, 4);
assert.equal(api.solidAtWorld(api.player.x, api.player.y), false, "player starts outside solid geometry");

const counts = new Map();
for (let y = 0; y < api.TUNE.MAP; y++) for (let x = 0; x < api.TUNE.MAP; x++) {
  const tile = api.tileAt(x, y);
  counts.set(tile, (counts.get(tile) || 0) + 1);
}
for (const tile of [api.TILE.ROAD, api.TILE.JUNCTION, api.TILE.SIDEWALK, api.TILE.FIELD, api.TILE.BUILDING, api.TILE.WATER]) {
  assert.ok((counts.get(tile) || 0) > 0, `map contains tile ${tile}`);
}

const r1 = api.mulberry32(0x51c0ffee), r2 = api.mulberry32(0x51c0ffee);
for (let i = 0; i < 20; i++) assert.equal(r1(), r2(), "seeded RNG is deterministic");
assert.ok(api.angleWrap(Math.PI * 3) <= Math.PI);
assert.ok(api.angleWrap(-Math.PI * 3) >= -Math.PI);

const car = api.spawnCar(api.player.x + 20, api.player.y, { type: api.CAR_TYPES[2], ai: false });
const ped = api.spawnPed(api.player.x + 30, api.player.y + 30);
assert.equal(car.type.name, "SPORT");
assert.equal(ped.kind, "ped");
for (let i = 0; i < 10; i++) api.simulate(1 / 60);
assert.equal(api.Game.steps, 10);
assert.ok(Number.isFinite(api.player.x) && Number.isFinite(api.player.y));

const phone = api.fixtures.phones[0];
const mark = api.spawnPed(api.player.x + 40, api.player.y + 40, { mission: true });
const missionsBeforeHit = api.Game.missions;
api.Mission.active = { type: "hit", target: mark, marker: mark, phone, reward: 12000, left: 30 };
mark.dead = true;
api.Mission.step(1 / 60);
assert.equal(api.Mission.active, null, "hit mission completes when target is dead");
assert.equal(api.Game.missions, missionsBeforeHit + 1);

const crusher = api.fixtures.crusher;
const scrap = api.spawnCar(crusher.x, crusher.y, { type: api.CAR_TYPES[0], ai: false });
api.player.car = scrap;
api.player.x = scrap.x;
api.player.y = scrap.y;
api.Input.pressed.add("e");
api.fixtureStep(1 / 60);
assert.equal(api.player.car, null, "crusher exits player from vehicle");
assert.equal(scrap.dead, true, "crusher destroys vehicle");
assert.ok(api.Game.lastCrush > 0, "crusher signals mission completion");

assert.equal(api.POLICE_TYPES.length, 5, "distinct police response vehicles");
assert.deepEqual(Array.from(api.POLICE_TYPES, x => x.name), ["PATROL", "INTERCEPTOR", "SWAT VAN", "FBI SEDAN", "TANK"]);
assert.equal(api.tileAt(2, 90), api.TILE.ROOFTOP, "river crossing contains elevated bridge deck");
assert.equal(api.tileAt(5, 90), api.TILE.RAMP, "river crossing contains ramp");
const bridgeCar = api.spawnCar(2 * 64 + 32, 90 * 64 + 32, { type: api.CAR_TYPES[0], ai: false });
assert.equal(bridgeCar.z, 1, "bridge vehicle occupies elevated layer");
const rampCar = api.spawnCar(5 * 64 + 32, 90 * 64 + 32, { type: api.CAR_TYPES[0], ai: false });
assert.ok(rampCar.z > 0 && rampCar.z < 1, "ramp interpolates elevation");

api.cars.length = 0;
api.peds.length = 0;
api.Mission.active = null;
api.player.car = null;
api.player.x = 128 * 64 + 32;
api.player.y = 128 * 64 + 32;
api.player.z = 0;
api.player.heat = 0;
api.player.wanted = 0;
api.player.invuln = 99;
api.Game.paused = false;
api.Game.popTimer = 999;
const parked = api.spawnCar(127 * 64 + 32, 127 * 64 + 32, { type: api.CAR_TYPES[2], ai: false, driver: false, a: 0 });
const parkedStart = { x: parked.x, y: parked.y };
for (let i = 0; i < 120; i++) api.simulate(1 / 60);
assert.ok(Math.hypot(parked.x - parkedStart.x, parked.y - parkedStart.y) < 0.001, "ai:false vehicle remains parked");

api.cars.length = 0;
const cx = 127 * 64 + 32, cy = 127 * 64 + 32;
const headA = api.spawnCar(cx - 10, cy, { type: api.CAR_TYPES[0], ai: false, a: 0 });
const headB = api.spawnCar(cx + 10, cy, { type: api.CAR_TYPES[0], ai: false, a: Math.PI });
headA.vx = 120;
headB.vx = -120;
api.resolveCarPairs();
assert.ok(Math.hypot(headA.x - headB.x, headA.y - headB.y) >= 43.9, "overlapping cars are separated");
assert.ok(headA.vx < 0 && headB.vx > 0, "head-on cars receive opposing impulse");

api.cars.length = 0;
api.player.cash = 0;
api.player.mult = 1;
const targetCar = api.spawnCar(cx + 300, cy, { type: api.CAR_TYPES[0], ai: false });
targetCar.playerDamaged = true;
targetCar.dead = true;
targetCar.hp = 0;
api.explodeCar(targetCar);
assert.equal(api.player.cash, api.TUNE.CASH_VEHICLE, "player-caused vehicle destruction pays once");
api.explodeCar(targetCar);
assert.equal(api.player.cash, api.TUNE.CASH_VEHICLE, "destroyed vehicle cannot pay twice");

api.cars.length = 0;
api.peds.length = 0;
api.player.heat = 200;
api.player.wanted = 2;
api.player.lastCrime = 99;
api.player.hidden = 0;
api.spawnCar(api.player.x + 160, api.player.y, { type: api.POLICE_TYPES[0], police: true, tier: 2, ai: false });
api.wantedStep(1);
assert.equal(api.player.heat, 200, "heat does not decay while police have line of sight");

api.cars.length = 0;
api.player.x = 127 * 64 + 32;
api.player.y = 130 * 64 + 32;
api.player.z = 0;
api.player.heat = 200;
api.player.wanted = 2;
api.player.lastCrime = 99;
api.player.hidden = 0;
const occludedCop = api.spawnCar(135 * 64 + 32, api.player.y, { type: api.POLICE_TYPES[0], police: true, tier: 2, ai: false });
assert.equal(api.lineClear(occludedCop, api.player), false, "buildings occlude police sight");
api.wantedStep(1);
assert.equal(api.player.heat, 192, "heat decays after police lose line of sight");

api.peds.length = 0;
api.spawnPed(api.player.x + 200, api.player.y, { cop: false });
api.spawnPed(api.player.x + 1, api.player.y + 1, { cop: true });
api.player.car = null;
api.player.arrest = 0;
api.Game.paused = false;
api.arrestStep(0.6);
api.arrestStep(0.6);
assert.equal(api.Game.paused, true, "nearby cop arrests player even when civilians exist");

api.Game.paused = false;
api.cars.length = 0;
api.player.x = 127 * 64 + 32;
api.player.y = 127 * 64 + 32;
api.player.z = 0;
api.player.wanted = 6;
assert.equal(api.spawnRoadblock(), true, "high-tier roadblock can be deployed");
const blockers = api.cars.filter(x => x.roadblock);
assert.equal(blockers.length, 2);
assert.ok(blockers.every(x => x.type.name === "TANK" && x.ai === false), "tier six deploys stationary military blockade");

api.cars.length = 0;
api.peds.length = 0;
api.Mission.active = null;
api.player.car = null;
api.player.x = 128 * 64 + 32;
api.player.y = 128 * 64 + 32;
api.player.z = 0;
api.player.hp = 100;
api.player.invuln = 999;
api.player.heat = 0;
api.player.wanted = 0;
api.Game.paused = false;
api.Game.popTimer = 0;
for (let i = 0; i < 600; i++) api.simulate(1 / 60);
for (const entity of [...api.cars, ...api.peds, api.player]) {
  assert.ok(Number.isFinite(entity.x) && Number.isFinite(entity.y) && Number.isFinite(entity.z || 0), `finite entity ${entity.id}`);
}
assert.ok(api.cars.length <= api.TUNE.CAP_TRAFFIC + 4, "traffic remains bounded");
assert.ok(api.peds.length <= api.TUNE.PED_TARGET, "pedestrian population remains bounded");

console.log(JSON.stringify({
  ok: true,
  bytes,
  banners: 20,
  mapTiles: Object.fromEntries(counts),
  carTypes: api.CAR_TYPES.length,
  weapons: api.WEAPONS.length,
  simulationSteps: api.Game.steps,
  regressions: ["parked-ai", "car-collision", "vehicle-payout", "wanted-los", "wanted-occlusion", "arrest", "roadblock", "bridge-z"]
}, null, 2));
