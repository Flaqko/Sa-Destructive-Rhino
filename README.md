# Destructive Rhino Redux v1.0

A **CLEO Redux JavaScript remaster** of **Junior_Djjr's Destructive Rhino Mod** for **GTA San Andreas Classic (1.0 US)**.

The mod fixes an odd Rhino damage behavior while preserving the tank's intended durability: Rhinos remain protected from bullets, fire, collisions, melee damage, and ordinary vehicle chain explosions, but direct explosive weapons can still destroy them.

## Features

- Keeps the Rhino bullet-proof.
- Keeps the Rhino fire-proof.
- Keeps the Rhino collision-proof.
- Keeps the Rhino melee-proof.
- Keeps engine-level explosion protection active to prevent normal traffic chain explosions.
- Allows controlled damage from:
  - Grenades / satchel explosions
  - RPG rockets
  - Weak / heat-seeking rockets
  - Rhino tank shells
- Ignores ordinary car explosions near the Rhino.
- No activation key or cheat required.

## Damage behavior

The release uses controlled health damage for accepted explosions:

| Explosion | Damage |
|---|---:|
| Grenade / satchel | 450 HP |
| RPG rocket | 550 HP |
| Weak / heat-seeking rocket | 500 HP |
| Rhino tank shell | 550 HP |
| Ordinary car explosion | Ignored |

A healthy 1000 HP Rhino therefore takes **two direct RPG hits** or **two Rhino cannon hits** to destroy.

## How it works

The original CLEO/CLEO+ script used per-vehicle process and weapon-damage callbacks to control the Rhino's proof flags.

This Redux remaster uses GTA SA's global explosion registry instead. The Rhino stays explosion-proof at the engine level, while the script detects accepted explosion types near each loaded Rhino and reapplies only the intended damage. Car explosions are deliberately excluded, preventing the chain-explosion problem the mod is designed to avoid.

## Requirements

- GTA San Andreas Classic 1.0 US
- CLEO Redux 1.5.x or compatible

The script uses GTA SA 1.0 memory addresses, so **keep `[mem]` in the filename**.

## Installation

1. Copy `DestructiveRhinoRedux_v1.0[mem].js` into your GTA San Andreas `CLEO` folder.
2. Remove older `DestructiveRhinoRedux_v0.x_TEST[mem].js` versions if installed.
3. Start or reload the game.

## Compatibility

The v1.0 gameplay logic is unchanged from the confirmed-working **v0.2 TEST** baseline.

It was tested alongside the user's current CLEO Redux setup, including Rhino Cannon AI and other gameplay mods. During validation:

- RPG damage worked and destroyed a healthy Rhino in two hits.
- Rhino cannon damage worked and destroyed a healthy Rhino in two hits.
- Grenade / satchel damage worked.
- Ordinary car explosions were repeatedly ignored.
- Fire protection remained intact.

As with any gameplay mod, test with your own mod setup if you use other scripts that alter Rhino health, vehicle proofs, or explosion behavior.

## Credits

- **Junior_Djjr** — original Destructive Rhino Mod concept/source
- **Flaqko** — Redux remaster/testing

## Version history

### v1.0
- First public GitHub release.
- Based directly on the confirmed-working v0.2 TEST build.
- Debug logging disabled.
- No gameplay changes from the tested baseline.
