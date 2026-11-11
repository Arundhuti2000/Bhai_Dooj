import { create } from 'zustand';

// UI state shared between the 3D game (engine) and the React overlays.
export const useUI = create((set) => ({
  phase: 'loading', // loading | title | intro | play | ceremony | end | roam
  loadProgress: 0, // 0..1 while the house and the family load
  objective: '',
  got: {}, // collected phota items
  dialog: null, // { who: 'S'|'B', text }
  chant: null, // { bn, en }
  choice: null, // [labels]
  toast: null, // { text, ms, id }
  near: null, // who/what Bhaiya is standing next to: 'honey' | 'maa' | 'baba' | 'shop' | null
  familyPhoto: null, // the family photo taken at the end
  canPhota: false,
  busy: false,
  photo: null, // selfie data URL
  flash: 0,
  letterbox: false, // black movie bars while a character is introduced
  intro: null, // { key, photo, name, aka, lines } character intro card
  hint: '',
  shop: null, // gift shop screen: { title, pocket, trip, items: [{ id, icon, name, price, line, locked, owned }] }
  fade: null, // text shown on a full-screen fade (string), or null when there is no fade
  gifts: [], // ids of the gifts bought so far, e.g. ['biscuit', 'nintendo']
  photoCaption: '', // caption under the end-card family photo ('' = the default one)
  set: (p) => set(p),
}));

export const ui = () => useUI.getState();
