import { useUI } from '../store';
import { fmt } from '../config';

// Promise-based helpers the game script awaits; the React overlays resolve them.
export const params = new URLSearchParams(location.search);
export const AUTO = params.has('auto'); // auto-advance (for automated testing)

const res = { dialog: null, chant: null, choice: null, intro: null, shop: null };

// movie-style "this is ..." card (photo + funny description); resolves when tapped
export function showIntro(card) {
  return new Promise((r) => {
    useUI.getState().set({ intro: card });
    res.intro = r;
    if (AUTO) setTimeout(closeIntro, 1500);
  });
}
export function closeIntro() {
  const r = res.intro;
  if (!r) return;
  res.intro = null;
  useUI.getState().set({ intro: null });
  r();
}
let autoPick = 0;

export function say(who, text) {
  return new Promise((r) => {
    useUI.getState().set({ dialog: { who, text: fmt(text), id: Math.random() } });
    res.dialog = r;
    if (AUTO) setTimeout(closeDialog, 800);
  });
}
export async function sayAll(lines) {
  for (const [w, t] of lines) await say(w, t);
}
export function closeDialog() {
  const r = res.dialog;
  if (!r) return;
  res.dialog = null;
  useUI.getState().set({ dialog: null });
  r();
}

export function chant(bn, en) {
  return new Promise((r) => {
    useUI.getState().set({ chant: { bn, en } });
    res.chant = r;
    if (AUTO) setTimeout(closeChant, 800);
  });
}
export function closeChant() {
  const r = res.chant;
  if (!r) return;
  res.chant = null;
  useUI.getState().set({ chant: null });
  r();
}

export function choose(options) {
  return new Promise((r) => {
    useUI.getState().set({ choice: options.map(fmt) });
    res.choice = r;
    // testing: auto-picks alternate 0,1,0… unless &autopick=N forces one option every time
    if (AUTO) setTimeout(() => pick(params.has('autopick') ? Number(params.get('autopick')) : autoPick++ % 2), 900);
  });
}
export function pick(i) {
  const r = res.choice;
  if (!r) return;
  res.choice = null;
  useUI.getState().set({ choice: null });
  r(i);
}

// gift shop screen. data: { title, pocket, trip, items: [{ id, icon, name, price, line, locked, owned }] }
// (raw config text; the overlay applies fmt). Resolves with the picked item id, or null if he leaves.
export function openShop(data) {
  return new Promise((r) => {
    const prev = res.shop;
    res.shop = null;
    prev?.(null); // never leave an older shop promise hanging
    useUI.getState().set({ shop: data });
    res.shop = r;
    if (AUTO) {
      setTimeout(() => {
        if (res.shop !== r) return;
        const items = data.items || [];
        const it = items.find((i) => !i.locked && !i.owned) || items.find((i) => !i.locked);
        pickShop(it ? it.id : null);
      }, 900);
    }
  });
}
export function pickShop(id) {
  const r = res.shop;
  res.shop = null;
  useUI.getState().set({ shop: null });
  r?.(id ?? null);
}
// "leave the shop": not allowed on the mid-ceremony trip (he has to pick something)
export function closeShop() {
  if (useUI.getState().shop?.trip) return;
  pickShop(null);
}

export function toast(text, ms = 3200) {
  useUI.getState().set({ toast: { text: fmt(text), ms, id: Math.random() } });
}
