import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useUI } from '../store';

// The house and the four family members, loaded up front (with a progress bar).
const BASE = import.meta.env.BASE_URL;
const FILES = {
  house: 'house_exterior.glb',
  bhaiya: 'char_bhaiya.glb',
  honey: 'char_honey.glb',
  maa: 'char_maa.glb',
  baba: 'char_baba.glb',
};

export async function loadModels() {
  const loader = new GLTFLoader();
  const keys = Object.keys(FILES);
  let done = 0;
  const one = async (key) => {
    const gltf = await loader.loadAsync(BASE + FILES[key]);
    useUI.getState().set({ loadProgress: ++done / keys.length });
    return [key, gltf.scene];
  };
  return Object.fromEntries(await Promise.all(keys.map(one)));
}
