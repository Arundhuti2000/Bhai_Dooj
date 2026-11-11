import { useEffect, useRef, useState } from 'react';
import { useUI } from '../store';
import { CONFIG, fmt, SPEAKERS } from '../config';
import { closeDialog, closeChant, closeIntro, pick, pickShop, closeShop } from '../game/ui';
import { getGame, input } from '../game/engine';
import { music } from '../game/music';

const ITEM_ORDER = ['chandan', 'kajal', 'dhaan_durbo', 'diya', 'mishti'];
const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const tx = (s) => (s ? fmt(String(s)) : ''); // fmt that tolerates missing text
const stop = (e) => e.stopPropagation();
const SHOP_KEYS = [['Digit1', 'Numpad1'], ['Digit2', 'Numpad2'], ['Digit3', 'Numpad3']];
const canBuy = (it) => it && !it.locked && !it.owned;

function Loading() {
  const phase = useUI((s) => s.phase);
  const progress = useUI((s) => s.loadProgress) * 100;
  if (phase !== 'loading') return null;
  return (
    <div className="overlay show loading">
      <div>Building our house… 🏠</div>
      <div className="bar"><div style={{ width: `${Math.round(progress)}%` }} /></div>
    </div>
  );
}

function Title() {
  const phase = useUI((s) => s.phase);
  if (phase !== 'title') return null;
  return (
    <div className="overlay show title">
      <div className="garland">🌼🪔🌼🪔🌼🪔🌼</div>
      <h1>Bhai Phota</h1>
      <div className="sub">{fmt(CONFIG.subtitle)}</div>
      <div className="help">
        Walk around our house, find everything for the phota thala, and come to {CONFIG.sister} at the backyard swing 🪢
      </div>
      <button className="big" onClick={() => getGame()?.start()}>Start ▶</button>
    </div>
  );
}

function Hud() {
  const { phase, objective, got, hint, gifts } = useUI();
  if (phase !== 'play' && phase !== 'roam') return null;
  const bought = (gifts || []).map((id) => CONFIG.shop.items[id]).filter(Boolean);
  return (
    <>
      <div className="hud">
        {phase === 'play' && <div className="objective">{objective}</div>}
        {phase === 'play' && (
          <div className="slots">
            {ITEM_ORDER.map((id) => (
              <div key={id} className={'slot' + (got[id] ? ' got' : '')} title={CONFIG.items[id].name}>
                {CONFIG.items[id].icon}
              </div>
            ))}
          </div>
        )}
        {bought.length > 0 && (
          <div className="gifts" title={bought.map((it) => tx(it.name)).join(', ')}>
            🎁 {bought.map((it) => `${it.icon} ${tx(it.name)}`).join(' · ')}
          </div>
        )}
      </div>
      {hint && <div className="hint">{hint}</div>}
    </>
  );
}

function Toast() {
  const toast = useUI((s) => s.toast);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!toast || !toast.text) return setShow(false);
    setShow(true);
    const t = setTimeout(() => setShow(false), toast.ms);
    return () => clearTimeout(t);
  }, [toast]);
  if (!show) return null;
  return <div key={toast.id} className="toast">{toast.text}</div>;
}

function Dialog() {
  const dialog = useUI((s) => s.dialog);
  const [shown, setShown] = useState(0);
  const full = dialog?.text || '';
  useEffect(() => {
    setShown(0);
    if (!dialog) return;
    const iv = setInterval(() => setShown((n) => (n >= full.length ? n : n + 1)), 22);
    return () => clearInterval(iv);
  }, [dialog]); // eslint-disable-line react-hooks/exhaustive-deps
  const tap = () => (shown < full.length ? setShown(full.length) : closeDialog());
  const tapRef = useRef(tap);
  tapRef.current = tap;
  useEffect(() => {
    window.__dialogTap = () => tapRef.current();
  }, []);
  if (!dialog) return null;
  const sp = SPEAKERS[dialog.who] || SPEAKERS.S;
  return (
    <div className="dialog" onPointerDown={tap}>
      <div className="avatar" style={{ background: sp.bg }}>{sp.avatar}</div>
      <div className="name">{sp.name()}</div>
      <div className="text">{full.slice(0, shown)}</div>
      <div className="next">tap ▶</div>
    </div>
  );
}

function Chant() {
  const chant = useUI((s) => s.chant);
  if (!chant) return null;
  return (
    <div className="chant" onPointerDown={closeChant}>
      <div className="bn">{chant.bn}</div>
      <div className="en">{chant.en}</div>
      <div className="tap">tap to continue</div>
    </div>
  );
}

function Choice() {
  const choice = useUI((s) => s.choice);
  if (!choice) return null;
  return (
    <div className="choice">
      {choice.map((c, i) => (
        <button key={i} onPointerDown={() => pick(i)}>{c}</button>
      ))}
    </div>
  );
}

function Actions() {
  const { near, canPhota, busy, phase, dialog, shop } = useUI();
  if (!near || busy || dialog || shop || (phase !== 'play' && phase !== 'roam')) return null;
  const g = getGame();
  if (near === 'shop') {
    return (
      <div className="actions">
        <button onClick={() => g.shop?.()}>{fmt(CONFIG.shop.action)} <kbd>G</kbd></button>
      </div>
    );
  }
  if (near === 'maa' || near === 'baba') {
    const name = near === 'maa' ? CONFIG.maa : CONFIG.baba;
    return (
      <div className="actions">
        <button onClick={() => g.talk()}>💬 Talk to {name} <kbd>T</kbd></button>
        <button onClick={() => g.pronam()}>🙏 Pronam <kbd>R</kbd></button>
        {near === 'maa'
          ? <button onClick={() => g.pinch()}>🥰 Cheek pinch <kbd>G</kbd></button>
          : <button onClick={() => g.money()}>💸 Ask for money <kbd>G</kbd></button>}
      </div>
    );
  }
  if (near !== 'honey') return null;
  return (
    <div className="actions">
      {canPhota && (
        <button className="phota" onClick={() => g.phota()}>{CONFIG.photaButton} <kbd>F</kbd></button>
      )}
      <button onClick={() => g.talk()}>💬 Talk <kbd>T</kbd></button>
      <button onClick={() => g.bonk()}>🤜 Bonk <kbd>B</kbd></button>
      <button onClick={() => g.steal()}>🍬 Steal mishti <kbd>M</kbd></button>
      <button onClick={() => g.selfie()}>📸 Selfie <kbd>P</kbd></button>
    </div>
  );
}

function Joystick() {
  const phase = useUI((s) => s.phase);
  const base = useRef(null);
  const [knob, setKnob] = useState([0, 0]);
  if (!isTouch || (phase !== 'play' && phase !== 'roam')) return null;
  const move = (e) => {
    const r = base.current.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy), m = 48;
    if (d > m) { dx *= m / d; dy *= m / d; }
    setKnob([dx, dy]);
    input.joy.x = dx / m;
    input.joy.y = -dy / m;
  };
  const end = () => { setKnob([0, 0]); input.joy.x = input.joy.y = 0; };
  return (
    <div
      ref={base}
      className="stick"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
      onPointerMove={(e) => e.buttons && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="knob" style={{ transform: `translate(${knob[0]}px, ${knob[1]}px)` }} />
    </div>
  );
}

function EndCard() {
  const phase = useUI((s) => s.phase);
  const familyPhoto = useUI((s) => s.familyPhoto);
  const photoCaption = useUI((s) => s.photoCaption);
  if (phase !== 'end') return null;
  return (
    <div className="overlay show endcard">
      <div className="card">
        <div className="garland">🌼🪔🌼🪔🌼</div>
        <h2>{fmt(CONFIG.endTitle)}</h2>
        {familyPhoto && (
          <div className="polaroid small">
            <img src={familyPhoto} alt="family photo" />
            <div className="caption">{photoCaption ? fmt(photoCaption) : 'Bhai Phota 2026 · the whole family 🪔'}</div>
          </div>
        )}
        <p>{fmt(CONFIG.endMessage)}</p>
        <div className="row">
          <button className="big" onClick={() => location.reload()}>Play again</button>
          <button className="big alt" onClick={() => getGame()?.roam()}>Walk around</button>
          {familyPhoto && <a className="big alt" href={familyPhoto} download="bhai-phota-family.jpg">Save photo</a>}
        </div>
      </div>
    </div>
  );
}

// movie-style "this is ..." intro: letterbox bars, then a polaroid + a funny description
function Letterbox() {
  const on = useUI((s) => s.letterbox);
  return (
    <>
      <div className={'lbar top' + (on ? ' on' : '')} />
      <div className={'lbar bottom' + (on ? ' on' : '')} />
    </>
  );
}
function IntroCard() {
  const intro = useUI((s) => s.intro);
  if (!intro) return null;
  return (
    <div className="introcard" onPointerDown={closeIntro}>
      <div className="polaroid tilt">
        <img src={intro.photo} alt={fmt(intro.name)} />
        <div className="caption">{fmt(intro.name)}</div>
      </div>
      <div className="who">
        <div className="this">this is</div>
        <div className="big">{fmt(intro.name)}</div>
        <div className="aka">{fmt(intro.aka)}</div>
        <ul>{intro.lines.map((l, i) => <li key={i} style={{ animationDelay: `${0.5 + i * 0.25}s` }}>{fmt(l)}</li>)}</ul>
        <div className="tap">tap to continue ▶</div>
      </div>
    </div>
  );
}

// always there (once the house has loaded): start the whole game over
function Restart() {
  const phase = useUI((s) => s.phase);
  const [musicOn, setMusicOn] = useState(music.on);
  if (phase === 'loading') return null;
  return (
    <div className="topbtns">
      <button className="restart" title={musicOn ? 'Turn the music off' : 'Turn the music on'} aria-pressed={musicOn}
        onPointerDown={(e) => e.stopPropagation()} onClick={() => setMusicOn(music.toggle())}>
        {musicOn ? '♪ Music on' : '♪ Music off'}
      </button>
      <button className="restart" title="Play again from the start" onPointerDown={(e) => e.stopPropagation()} onClick={() => location.reload()}>
        ↻ Play again
      </button>
    </div>
  );
}

function Photo() {
  const { photo, flash } = useUI();
  const [flashOn, setFlashOn] = useState(false);
  useEffect(() => {
    if (!flash) return;
    setFlashOn(true);
    const t = setTimeout(() => setFlashOn(false), 180);
    return () => clearTimeout(t);
  }, [flash]);
  return (
    <>
      {flashOn && <div className="flash" />}
      {photo && (
        <div className="overlay show photo">
          <div className="polaroid">
            <img src={photo} alt="selfie" />
            <div className="caption">{CONFIG.brother} & {CONFIG.sister} · Bhai Phota 🪔</div>
          </div>
          <div className="row">
            <a className="big" href={photo} download="bhai-phota-selfie.jpg">Save photo</a>
            <button className="big alt" onClick={() => useUI.getState().set({ photo: null })}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

// full-screen warm fade with a line of text ("Bhaiya rushes off to the gift shop…").
// Always mounted so it can fade out too; it never takes taps, so nothing behind it can get stuck.
function Fade() {
  const fade = useUI((s) => s.fade);
  const on = typeof fade === 'string';
  const last = useRef(''); // keep the text while it fades out
  if (on) last.current = fade;
  return (
    <div className={'fade' + (on ? ' on' : '')} aria-hidden={!on}>
      <div className="fadetext">{tx(last.current)}</div>
    </div>
  );
}

// the gift shop stall: 3 gifts on the street, or the mid-ceremony "rush to the shop" trip (no leaving)
function Shop() {
  const shop = useUI((s) => s.shop);
  if (!shop) return null;
  const items = shop.items || [];
  return (
    <div className="shop" onPointerDown={stop} role="dialog" aria-modal="true" aria-label={tx(shop.title)}>
      <div className={'shopcard' + (shop.trip ? ' trip' : '')}>
        <div className="awning" aria-hidden="true" />
        <div className="garland">🪔🌼🎁🌼🪔</div>
        <h2>{tx(shop.title)}</h2>
        {shop.pocket && <div className="pocket">{tx(shop.pocket)}</div>}
        <div className="wares">
          {items.map((it, i) => (
            <div key={it.id} className={'ware' + (it.owned ? ' owned' : it.locked ? ' locked' : '')}>
              <div className="icon" aria-hidden="true">{it.icon}</div>
              <div className="name">{tx(it.name)}</div>
              {it.price && <div className="price">{tx(it.price)}</div>}
              <div className="line">{tx(it.line)}</div>
              <button className="buy" disabled={!canBuy(it)} onClick={() => canBuy(it) && pickShop(it.id)}>
                {it.owned ? tx(CONFIG.shop.owned) : it.locked ? tx(CONFIG.shop.locked) : (
                  <>{tx(CONFIG.shop.buy)} {i < SHOP_KEYS.length && <kbd>{i + 1}</kbd>}</>
                )}
              </button>
            </div>
          ))}
        </div>
        {!shop.trip && (
          <button className="big alt leave" onClick={closeShop}>{tx(CONFIG.shop.close)} <kbd>Esc</kbd></button>
        )}
      </div>
    </div>
  );
}

function Keys() {
  useEffect(() => {
    const down = (e) => {
      const s = useUI.getState();
      // the shop screen is modal: Esc leaves (not on the ceremony trip), 1/2/3 buy, nothing else gets through
      if (s.shop) {
        if (e.repeat) return;
        if (e.code === 'Escape') closeShop();
        const n = SHOP_KEYS.findIndex((k) => k.includes(e.code));
        const it = n >= 0 ? s.shop.items?.[n] : null;
        if (canBuy(it)) pickShop(it.id);
        return;
      }
      input.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'Enter') {
        if (s.intro) closeIntro();
        else if (s.dialog) window.__dialogTap?.();
        else if (s.chant) closeChant();
        return;
      }
      if (e.repeat || s.dialog || s.busy) return;
      const g = getGame();
      if (!g || !s.near) return;
      if (e.code === 'KeyT' && s.near !== 'shop') g.talk(); // the stall is not someone to talk to
      if (e.code === 'KeyB') g.bonk();
      if (e.code === 'KeyM') g.steal();
      if (e.code === 'KeyP') g.selfie();
      if (e.code === 'KeyR') g.pronam();
      if (e.code === 'KeyG') (s.near === 'maa' ? g.pinch() : s.near === 'baba' ? g.money() : s.near === 'shop' ? g.shop?.() : null);
      if (e.code === 'KeyF' && s.canPhota) g.phota();
    };
    const up = (e) => input.keys.delete(e.code);
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); };
  }, []);
  return null;
}

export default function Overlays() {
  return (
    <>
      <Keys />
      <Hud />
      <Actions />
      <Joystick />
      <Toast />
      <Dialog />
      <Chant />
      <Choice />
      <Photo />
      <Fade />
      <Shop />
      <Letterbox />
      <IntroCard />
      <EndCard />
      <Title />
      <Restart />
      <Loading />
    </>
  );
}
