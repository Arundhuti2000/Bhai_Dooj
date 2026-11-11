// =====================================================================
//  PERSONALISE HERE: names, every line of dialogue, and the final message.
//  {B} = what she calls him (also {Bh} / {Bi}), {S} = her name, {U} = what he calls her,
//  {G} = what Maa and Papa call her, {Nn} = what Maa and Papa call her between themselves.
// =====================================================================
export const CONFIG = {
  brother: 'Bhaiya',
  sister: 'Bunu',      // her name tag / speaker name in the game (what Bhaiya calls her)
  sisterAlt: 'Honey',
  sisterNick: 'Bunu',   // what Bhaiya calls her  ({U} in his lines)
  sisterParents: 'Gudiya',   // what Maa and Papa call her  ({G})
  sisterParentsPrivate: 'Nanhnu',   // what Maa and Papa call her when talking to each other  ({Nn})
  brotherNicks: { Bh: 'Bhiya', Bi: 'Biya' },   // other things she calls him ({Bh}, {Bi})
  brotherName: 'Happy', // what Maa and Papa call him  ({N} in their lines)
  maa: 'Maa',
  baba: 'Papa',
  subtitle: 'A little game for my {B} 🪔',

  // Maa greets him at the main door the first time he walks in
  maaGreeting: [
    ['M', '{N}! There you are. {G} has been waiting since morning!'],
    ['M', 'Collect everything for the phota thala first. And no stealing mishti!'],
    ['B', 'Haan Maa, ok ok…'],
  ],
  talkMaa: [
    [['M', 'Did you eat anything? Good. No food before the phota!'], ['B', 'Maa, I am SO hungry…']],
    [['M', 'This year give {G} a proper gift, {N}. Not a biscuit.'], ['B', '…who told you about the biscuit?!'], ['M', 'Everyone knows, {N}.']],
    [['M', 'Go, go! The thala will not fill itself.'], ['B', 'Going, Maa!']],
  ],
  talkBaba: [
    [['D', 'Bhai Phota without mishti? Never! Did you find the rosogolla?'], ['B', 'Almost, Papa!']],
    [['D', '{N}, stand straight. Today is a special day.'], ['B', '(stands straight) 🫡']],
    [['D', "{G} has been up since morning decorating the swing. Don't disappoint her, {N}."], ['B', 'Me? Never 😇']],
    [['D', 'In the paper today: "Brother gives sister REAL gift". Ha! Imagine.'], ['B', 'Papa, not you also…']],
  ],
  pronam: { maa: 'Bhalo theko, {N}. Dirghayu hao! ❤️', baba: 'Khub bhalo theko, beta. 🙏' },
  // Maa pinches his cheek (G near Maa)
  pinch: [
    [['M', 'Amar sona chhele! Look how thin you have become, {N}! 🥰'], ['B', 'Maaa… everyone is watching 😳']],
    [['M', 'Such a sweet face… then why such a naughty brain? 🥰'], ['B', 'Ow ow ow, Maa!']],
    [['M', 'Again come here, let me see you properly. 🥰'], ['B', 'Maa, my cheek is going to fall off…']],
  ],
  // Papa and the pocket money (G near Papa)
  money: {
    ask: [['B', 'Papa… can I have a little money?'], ['D', 'Money? For what?'], ['B', "For {U}'s gift… 🥺"]],
    give: [['D', "Hmm. Fine, here's ₹500. A REAL gift this time, not a biscuit! 💸"], ['B', 'Thank you Papa! 😁']],
    again: [['B', 'Papa, a little more…?'], ['D', 'AGAIN?! I already gave you ₹500! Go, go! 😤']],
    caught: [['D', 'Wait… so THAT is where my ₹500 went! 😂'], ['M', 'Leave it na. Look how happy our {Nn} is 🥹']],
  },

  // movie-style intro cards, shown the first time he meets each of them
  intros: {
    bhaiya: {
      name: '{B}', aka: 'a.k.a. {N} · {Bh} · {Bi}',
      lines: ['The elder brother. Professional ₹5 cream biscuit gifter 🍪', 'Last real gift: 2022 (nobody has forgotten)', 'Special skill: eating the mishti before the phota 😋'],
    },
    maa: {
      name: '{M}', aka: 'Chief Minister of the house 👑',
      lines: ['Knows everything. Yes, about the biscuit too.', 'Favourite question: "Did you eat?"', 'Weakness: none. Cheek pinches: unlimited 🥰'],
    },
    baba: {
      name: '{D}', aka: 'The Family Bank 🏦',
      lines: ['Sunglasses ON at all times 😎', 'Reads the same newspaper three times a day 📰', 'Pocket money available… if you ask nicely 💸'],
    },
    honey: {
      name: '{S}', aka: 'a.k.a. Honey · {G} · the little sister',
      lines: ['Final boss of Bhai Phota 🪔', 'Has been waiting at the swing since morning', 'Still remembers the 2022 Galaxy Watch. Every. Single. Day. ⌚'],
    },
  },

  intro: [
    ['S', '{Bi}! Where are you?! Today is Bhai Phota!'],
    ['S', 'I am waiting at the swing in the backyard. But first, bring everything for the phota thala.'],
    ['S', 'Chandan, kajal, dhaan-durbo, a diya… and the mishti. Do NOT eat the mishti on the way!'],
    ['B', 'Haan haan, coming {U}…'],
  ],

  items: {
    chandan: { icon: '🥣', name: 'Chandan', line: 'Chandan! Smells exactly like Bhai Phota morning.' },
    kajal: { icon: '⚫', name: 'Kajal', line: "Kajal for the phota. Careful, don't smudge it!" },
    dhaan_durbo: { icon: '🌾', name: 'Dhaan-durbo', line: 'Dhaan-durbo for the blessing. Live long, just like the durbo grass!' },
    diya: { icon: '🪔', name: 'Diya', line: 'The diya! Now the aarti can happen.' },
    mishti: { icon: '🍬', name: 'Mishti', line: 'Mishti! …why does the box feel lighter? {Bh}!!' },
  },
  allFound: 'Got everything! Now go to {S} at the swing in the backyard 🪢',
  gateOpen: 'The gate creaks open… 🚪',
  photaButton: '🪔 Start the phota',

  // little things he can do near Honey
  talk: [
    [['S', '{B}, did you bring my gift this year, or another ₹5 cream biscuit?'], ['B', '…what is a gift?']],
    [['B', '{U}, why are you so short?'], ['S', 'Why are you so annoying?!']],
    [['S', 'Remember 2022? The Galaxy Watch? I remember. Every. Single. Day.'], ['B', 'Me too. That was enough gifting for ten years.']],
    [['S', '{Bh}, stop roaming around and bring the phota things!'], ['B', 'Yes boss 🫡']],
    [['B', '{U}, you look nice today.'], ['S', '…what do you want?'], ['B', 'Mishti.']],
    [['S', 'Did you have breakfast? No eating before the phota!'], ['B', 'I only had… a little.'], ['S', '{Bi}!!']],
  ],
  bonk: ['{Bi}!!! 😤', "Ouch! I'm telling Maa!! 😤", 'Why are you like this?! 💢', 'AGAIN?! You are SO dead! 😤', 'Hmph. No mishti for you. 😤'],
  steal: { eat: 'Nom nom 😋', angry: 'MISHTI CHOR!! Those were for the phota! 😤', none: 'Find the mishti first 🍬' },
  selfie: 'Say cheese! 📸',

  ceremony: {
    sit: [['S', 'Finally! Come, stand right here, {B}. And stand STILL.']],
    aarti: [['S', 'First, the aarti… 🪔']],
    phota: [['S', 'Now the phota. Close your eyes!']],
    durbo: [['S', 'Dhaan-durbo on your head. Live long and stay happy, {B}!']],
    shankh: '🐚 Shankh and ulu! 🎉',
    mishti: [['S', 'Open your mouth… one rosogolla for you!'], ['B', 'Only ONE?!']],
    mishtiStolen: [['S', 'Open your mouth… oh wait, SOMEONE already ate most of them. One for you!'], ['B', '…only one?']],
    askGift: [['S', 'Ahem. {B}… where is MY gift? 😌'], ['B', 'Gift? Of course I have a gift…']],
    bye: [['B', 'Happy Bhai Phota, {U} ❤️'], ['S', 'Love you, {Bi} ❤️'], ['D', 'Look at our {Nn}, so happy today 🥹'], ['M', 'Now everyone together, family photo!']],
    byeSelfie: [['B', 'Happy Bhai Phota, {U} ❤️'], ['S', 'Love you SO much, {Bi} ❤️🎮'], ['D', 'Look at our {Nn}, so happy today 🥹'], ['S', 'Everyone squeeze in! FAMILY SELFIE! 🤳']],
    familyPhoto: 'Say "mishti"! 📸',
    selfieToast: 'Say "Nintendo"! 🤳',
    photoCaption: 'Bhai Phota 2026 · the whole family 🪔',
    selfieCaption: 'Family selfie 🤳 · best Bhai Phota ever 🎮',
  },

  // ---- the gift shop on the street (G near the stall). Gift tiers: biscuit < box < nintendo.
  shop: {
    title: 'Gift Shop',
    pocket: 'In your pocket: ₹5',
    pocketPapa: "In your pocket: ₹5 + Papa's ₹500 💸",
    locked: 'Ask Papa for money first 💸',
    owned: 'Bought ✓',
    buy: 'Buy',
    close: 'Leave the shop',
    tripTitle: 'Quick! Something better for {U}…',
    action: '🛍️ Gift shop',
    nearToast: "Papa's ₹500! The gift shop is right outside the main gate 🛍️",
    tripOut: '🏃 {B} rushes off to the gift shop…',
    tripBack: '…and he is back, out of breath! 🎁',
    items: {
      biscuit: {
        icon: '🍪', name: '₹5 Cream Biscuit', price: '₹5', tier: 0,
        line: 'The classic. Tradition is tradition.',
        give: '🍪 Give the ₹5 cream biscuit',
        bought: 'Bought a ₹5 cream biscuit 🍪 …again',
      },
      box: {
        icon: '🎁', name: 'Gift Box', price: '₹500', tier: 1,
        line: 'Chocolates and a pretty bracelet, wrapped with a bow.',
        give: '🎁 Give the ₹500 gift box',
        bought: 'Bought the ₹500 gift box 🎁 (thank you Papa!)',
      },
      nintendo: {
        icon: '🎮', name: 'Nintendo Switch', price: "Papa's ₹500 + all my savings", tier: 2,
        line: '{U} loves playing games. My wallet is crying, but OK 😅',
        give: '🎮 Give the Nintendo Switch',
        bought: 'Bought a Nintendo Switch 🎮 (wallet: empty)',
      },
    },
    // what Bunu says when she gets each one
    react: {
      biscuit: [
        ['S', '{Bh}!!! AGAIN the ₹5 cream biscuit?!'],
        ['S', 'The last real gift was the Galaxy Watch… in 2022! That was FOUR Bhai Photas ago!'],
        ['B', 'That watch was an advance payment for the next 10 Bhai Photas 😎'],
      ],
      box: [
        ['S', 'Wait… a REAL gift?! After 2022?! 😱'],
        ['S', '(opens it) Chocolates AND a bracelet! {Bi}, it is so pretty 🥹'],
        ['S', '…although, you know what I REALLY wanted… 🎮👀'],
      ],
      nintendo: [
        ['S', 'Is this… a NINTENDO SWITCH?!?! 😱🎮'],
        ['S', '{Bh}!!! BEST. BHAI PHOTA. EVER!!! 🥹❤️'],
        ['B', 'Anything for you, {U} 😎'],
      ],
    },
    // after she gets a biscuit (0) or the gift box (1): go and buy something better, or stop there
    upgrade: [
      {
        go: '🛍️ Make her happy: go buy her something',
        stay: '😎 Nah, the biscuit is enough',
        goLines: [['B', 'Wait right here, {U}. Two minutes!'], ['S', 'Where are you going?!']],
        stayLines: [['S', "Hmph. Fine, I'm keeping it. But next year I want a REAL gift 😤"], ['M', '{N}… 🤦‍♀️']],
      },
      {
        go: '🎮 Make her even happier: Nintendo Switch!',
        stay: "😌 That's enough gifting for this year",
        goLines: [['B', 'Hold on… I will be right back! 🏃'], ['S', '{Bi}?! Where are you running?!']],
        stayLines: [['S', 'Okay okay, this is actually so sweet. Thank you {Bi} ❤️']],
      },
    ],
  },

  chant: [
    ['ভাইয়ের কপালে দিলাম ফোঁটা,', 'Bhaiyer kopale dilam phonta,'],
    ['যমের দুয়ারে পড়ল কাঁটা।', 'Jomer duare porlo kanta.'],
    ['যমুনা দেয় যমকে ফোঁটা,', 'Jomuna dey Jomke phonta,'],
    ['আমি দিই আমার ভাইকে ফোঁটা।', 'Ami dii amar bhaike phonta.'],
  ],

  endTitle: 'Shubho Bhai Phota! 🪔',
  endMessage:
    'To my dearest {B},\nmay you live long, stay happy forever,\nand one day upgrade from the ₹5 cream biscuit 😜\n\nLove you always!\n— {S}',
};

export const fmt = (s) =>
  s.replaceAll('{B}', CONFIG.brother).replaceAll('{Bh}', CONFIG.brotherNicks.Bh).replaceAll('{Bi}', CONFIG.brotherNicks.Bi)
    .replaceAll('{S}', CONFIG.sister).replaceAll('{U}', CONFIG.sisterNick).replaceAll('{G}', CONFIG.sisterParents).replaceAll('{Nn}', CONFIG.sisterParentsPrivate).replaceAll('{N}', CONFIG.brotherName)
    .replaceAll('{M}', CONFIG.maa).replaceAll('{D}', CONFIG.baba);

export const SPEAKERS = {
  S: { name: () => CONFIG.sister, avatar: '👧🏻', bg: '#d9c8f2' },
  B: { name: () => CONFIG.brother, avatar: '😎', bg: '#3a3a44' },
  M: { name: () => CONFIG.maa, avatar: '👩🏻', bg: '#f3d1b5' },
  D: { name: () => CONFIG.baba, avatar: '👨🏻', bg: '#b9cde8' },
};
