# Bhai Phota 🪔

A small 3D story game for Bhaiya, set in our house. It ends with the phota on the backyard swing.

## Run it

You need [Node.js](https://nodejs.org) (version 18 or newer).

```bash
cd D:\Bhai_Dooj\game
npm install        # first time only
npm run dev        # opens http://localhost:5173 in your browser
```

To make a version you can host or share, run `npm run build`. It writes a static site to `dist/`. Serve that folder from any web host, or test it locally with `npm run preview`.

## Controls

| | Laptop | Phone |
|---|---|---|
| Walk | WASD / arrow keys (Shift = run) | joystick, bottom-left (push it all the way to run) |
| Look around | drag with the mouse | drag with one finger |
| Zoom | scroll wheel | pinch |
| Next line | click the speech box / Space | tap the speech box |
| Near Bunu | T talk · B bonk · M steal mishti · P selfie · F start the phota | buttons on the right |
| Near Maa | T talk · R pronam · G cheek pinch | buttons on the right |
| Near Papa | T talk · R pronam · G ask for money (he remembers it at the gift!) | buttons on the right |
| Start over | ↻ Play again (top right, always there) | same |

The camera can be dragged at any time, during the phota too.

## Personalise

Every name, dialogue line, the chant and the final message are in [`src/config.js`](src/config.js).

## How it's made

| Part | Where |
|---|---|
| House, compound, backyard | `../blender/build_house.py` writes `assets/house_exterior.glb` and `assets/layout.json` |
| Characters | `../blender/rig_characters.py` takes the family's A-pose models in `../reference/` (`happy.glb`, `honey.glb`, `Mom.glb`, `Dad.glb`). It slims each to ~32k faces, re-bakes its texture, fits a skeleton by measuring the body, and skins it. Output: `assets/char_bhaiya.glb`, `char_honey.glb`, `char_maa.glb`, `char_baba.glb` and `assets/characters.json`. Heights are set at the top of the script |
| Game | React + react-three-fiber (`src/`). `src/game/engine.js` runs gameplay and the ceremony, and `src/game/rig.js` handles posing and IK |

To rebuild the 3D files (Blender 5.2):

```bash
blender --background --python ../blender/build_house.py -- --export
blender --background --python ../blender/rig_characters.py -- --render
```

## Testing switches (add to the URL)

`?autostart=1&skip=1` jumps straight into play. `&phota=1` jumps to the ceremony. `&do=bonk` (or `talk`, `steal`, `selfie`) tries an interaction. `&auto=1` auto-advances the dialogue.

## Share it (Firebase Hosting)

The game is live at **https://bhai-phota-happy.web.app** (Firebase project `bhai-phota-happy`). After changing anything, publish the new version with:

```
npm run deploy
```

This builds the game and uploads `dist/` (the leftover bake textures in `tex/` are skipped).