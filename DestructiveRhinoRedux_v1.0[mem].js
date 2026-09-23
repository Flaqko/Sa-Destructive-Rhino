// Destructive Rhino Redux v1.0
// Classic GTA San Andreas 1.0 US + CLEO Redux JavaScript
//
// Port/remaster of Junior_Djjr's "Destructive Rhino Mod".
// Original concept/source: Junior_Djjr
//
// Redux port behavior:
// - Uses GTA's global explosion registry (IS_EXPLOSION_IN_AREA), which remains
//   visible even while the Rhino itself is explosion-proof.
//
// Behavior:
// - Rhinos remain bullet/fire/explosion/collision/melee proof at the engine level.
// - Direct GRENADE / ROCKET / WEAK ROCKET / TANK SHELL explosions near a Rhino
//   are detected independently and re-applied as controlled Rhino health damage.
// - CAR explosions are intentionally NOT accepted, preventing the vanilla
//   traffic chain-explosion problem this mod is meant to solve.
// - Molotov/fire remains ignored because the Rhino stays fire-proof.
// - About two direct RPG hits destroy a healthy Rhino.
//
// Keep [mem] in the filename: this script scans the GTA SA 1.0 vehicle pool.

/// <reference path=".config/sa.d.ts" />

const VERSION = "1.0";
const TAG = "[DestructiveRhinoRedux v" + VERSION + "]";

const PLAYER_ID = 0;
const RHINO_MODEL = 432; // #RHINO

// GTA SA 1.0 US vehicle pool / CPools::GetVehicle.
const VEHICLE_POOL_PTR_ADDR = 0xB74494;
const GET_VEHICLE_PTR_ADDR = 0x54FFF0;
const MAX_REASONABLE_POOL_SIZE = 4096;

// GTA SA explosion IDs.
const EXPLOSION_GRENADE = 0;
const EXPLOSION_MOLOTOV = 1;      // deliberately ignored
const EXPLOSION_ROCKET = 2;
const EXPLOSION_ROCKET_WEAK = 3;
const EXPLOSION_CAR = 4;          // deliberately ignored
const EXPLOSION_TANK_GRENADE = 10;

const ACCEPTED_EXPLOSIONS = [
    { type: EXPLOSION_GRENADE,      label: "grenade/satchel", damage: 450.0 },
    { type: EXPLOSION_ROCKET,       label: "rocket",          damage: 550.0 },
    { type: EXPLOSION_ROCKET_WEAK,  label: "weak rocket",     damage: 500.0 },
    { type: EXPLOSION_TANK_GRENADE, label: "tank shell",      damage: 550.0 }
];

// Check a box around the Rhino rather than only its center. A direct rocket can
// detonate against the hull several metres from the vehicle origin.
const EXPLOSION_RADIUS_XY = 6.0;
const EXPLOSION_RADIUS_Z = 4.5;

// A single active explosion remains in GTA's explosion list for multiple frames.
// We therefore trigger on FALSE -> TRUE per Rhino/per explosion type.
const MIN_REPEAT_GUARD_MS = 250;

const DEBUG = false;

const getVehiclePtr = Memory.Fn.Cdecl(GET_VEHICLE_PTR_ADDR);
const rhinoState = new Map();

let warnedPool = false;
let warnedExplosionCommand = false;
let acceptedHitCount = 0;

function debug(text) {
    if (DEBUG) log(TAG + " " + text);
}

function finiteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function numberByKeys(value, keys) {
    if (!value || typeof value !== "object") return null;
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (
            Object.prototype.hasOwnProperty.call(value, key) &&
            finiteNumber(value[key])
        ) {
            return Number(value[key]);
        }
    }
    return null;
}

function vector3(value) {
    if (!value) return null;

    if (Array.isArray(value) && value.length >= 3) {
        const x = Number(value[0]);
        const y = Number(value[1]);
        const z = Number(value[2]);
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
            return { x, y, z };
        }
    }

    if (typeof value === "object") {
        const x = numberByKeys(value, ["x", "coordX", "posX", "value0"]);
        const y = numberByKeys(value, ["y", "coordY", "posY", "value1"]);
        const z = numberByKeys(value, ["z", "coordZ", "posZ", "value2"]);
        if (x !== null && y !== null && z !== null) {
            return { x, y, z };
        }

        const nums = [];
        for (const key in value) {
            if (
                Object.prototype.hasOwnProperty.call(value, key) &&
                finiteNumber(value[key])
            ) {
                nums.push(Number(value[key]));
            }
        }
        if (nums.length >= 3) {
            return { x: nums[0], y: nums[1], z: nums[2] };
        }
    }

    return null;
}

function readVehiclePool() {
    try {
        const pool = Memory.ReadU32(VEHICLE_POOL_PTR_ADDR, false);
        if (!pool) return null;

        const byteMap = Memory.ReadU32(pool + 0x4, false);
        const size = Memory.ReadI32(pool + 0x8, false);
        if (!byteMap || size <= 0 || size > MAX_REASONABLE_POOL_SIZE) {
            return null;
        }
        return { byteMap, size };
    } catch (e) {
        if (!warnedPool) {
            warnedPool = true;
            log(TAG + " Vehicle-pool read failed: " + e);
        }
        return null;
    }
}

function getVehicleHandle(slot, poolByte) {
    return (slot << 8) + poolByte;
}

function getCarCoords(car) {
    try {
        return vector3(native("GET_CAR_COORDINATES", car));
    } catch (e) {
        return null;
    }
}

function getCarHealth(car) {
    try {
        const result = native("GET_CAR_HEALTH", car);
        if (finiteNumber(result)) return Number(result);
        if (result && typeof result === "object") {
            const health = numberByKeys(result, ["health", "value", "result"]);
            if (health !== null) return health;
        }
    } catch (e) {}
    return null;
}

function protectRhino(car) {
    try {
        native("SET_CAR_PROOFS", car, true, true, true, true, true);
    } catch (e) {}
}

function isExplosionNear(type, pos) {
    try {
        return !!native(
            "IS_EXPLOSION_IN_AREA",
            type,
            pos.x - EXPLOSION_RADIUS_XY,
            pos.y - EXPLOSION_RADIUS_XY,
            pos.z - EXPLOSION_RADIUS_Z,
            pos.x + EXPLOSION_RADIUS_XY,
            pos.y + EXPLOSION_RADIUS_XY,
            pos.z + EXPLOSION_RADIUS_Z
        );
    } catch (e) {
        if (!warnedExplosionCommand) {
            warnedExplosionCommand = true;
            log(TAG + " IS_EXPLOSION_IN_AREA failed: " + e);
        }
        return false;
    }
}

function stateFor(car) {
    let state = rhinoState.get(car);
    if (!state) {
        state = {
            activeByType: Object.create(null),
            lastAppliedByType: Object.create(null)
        };
        rhinoState.set(car, state);
    }
    return state;
}

function applyDirectExplosionDamage(car, def, now) {
    const oldHealth = getCarHealth(car);
    if (oldHealth === null) {
        debug("Detected " + def.label + " near car=" + car + " but health read failed.");
        return;
    }

    const newHealth = oldHealth - def.damage;
    acceptedHitCount++;

    debug(
        "ACCEPTED #" + acceptedHitCount +
        " type=" + def.type + " (" + def.label + ")" +
        " car=" + car +
        " damage=" + def.damage.toFixed(1) +
        " health=" + oldHealth.toFixed(1) + " -> " + Math.max(0, newHealth).toFixed(1)
    );

    if (newHealth <= 0.0) {
        try { native("SET_CAR_HEALTH", car, 0); } catch (e) {}
        try { native("EXPLODE_CAR", car); }
        catch (e) { debug("EXPLODE_CAR failed after lethal hit: " + e); }
        return;
    }

    try {
        native("SET_CAR_HEALTH", car, Math.max(1, Math.floor(newHealth)));
    } catch (e) {
        debug("SET_CAR_HEALTH failed: " + e);
    }
}

function processRhino(car, now) {
    if (native("IS_CAR_DEAD", car)) {
        rhinoState.delete(car);
        return;
    }

    protectRhino(car);

    const pos = getCarCoords(car);
    if (!pos) return;

    const state = stateFor(car);

    for (let i = 0; i < ACCEPTED_EXPLOSIONS.length; i++) {
        const def = ACCEPTED_EXPLOSIONS[i];
        const key = String(def.type);
        const activeNow = isExplosionNear(def.type, pos);
        const activeBefore = !!state.activeByType[key];
        const lastApplied = state.lastAppliedByType[key] || 0;

        // Only one health hit per actual explosion presence. The time guard is
        // extra protection against odd one-frame gaps in the native list.
        if (
            activeNow &&
            !activeBefore &&
            now - lastApplied >= MIN_REPEAT_GUARD_MS
        ) {
            state.lastAppliedByType[key] = now;
            applyDirectExplosionDamage(car, def, now);
        }

        state.activeByType[key] = activeNow;
    }

    // Debug-only confirmation that nearby car explosions are being excluded.
    // We intentionally do NOT log every frame to keep the game log readable.
    const carExplosionActive = isExplosionNear(EXPLOSION_CAR, pos);
    const carKey = "ignored_car";
    const carWasActive = !!state.activeByType[carKey];
    if (carExplosionActive && !carWasActive) {
        debug("IGNORED type=4 (car explosion) near Rhino car=" + car + ".");
    }
    state.activeByType[carKey] = carExplosionActive;
}

function processAllVehicles() {
    const pool = readVehiclePool();
    if (!pool) return;

    const now = Date.now();
    const seenRhinos = new Set();

    for (let slot = 0; slot < pool.size; slot++) {
        let poolByte;
        try { poolByte = Memory.ReadU8(pool.byteMap + slot, false); }
        catch (e) { continue; }

        if ((poolByte & 0x80) !== 0) continue;

        const car = getVehicleHandle(slot, poolByte);
        const vehPtr = getVehiclePtr(car);
        if (!vehPtr) continue;

        let isRhino = false;
        try { isRhino = !!native("IS_CAR_MODEL", car, RHINO_MODEL); }
        catch (e) { continue; }
        if (!isRhino) continue;

        seenRhinos.add(car);
        processRhino(car, now);
    }

    for (const car of rhinoState.keys()) {
        if (!seenRhinos.has(car)) rhinoState.delete(car);
    }
}

log(
    TAG +
    " loaded. Direct explosion-type detection: " +
    "grenade/rocket/weak-rocket/tank-shell accepted; car explosions ignored."
);

while (true) {
    wait(0);

    if (!native("IS_PLAYER_PLAYING", PLAYER_ID)) continue;
    processAllVehicles();
}
