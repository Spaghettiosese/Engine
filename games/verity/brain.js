// Verity's "brain": free-text questions are matched against a big table of
// answers. Phases: cute -> weird -> evil. She never lies. That's the truth! :)

function pick(arr, n) { return arr[n % arr.length]; }

function mathAnswer(q) {
  const m = q.replace(/,/g, '').match(/(-?\d+(?:\.\d+)?)\s*(\+|-|\*|x|×|\/|÷|plus|minus|times|divided by)\s*(-?\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const a = parseFloat(m[1]), b = parseFloat(m[3]);
  const op = m[2].toLowerCase();
  let r;
  if (op === '+' || op === 'plus') r = a + b;
  else if (op === '-' || op === 'minus') r = a - b;
  else if (op === '*' || op === 'x' || op === '×' || op === 'times') r = a * b;
  else { if (b === 0) return "You can't divide by zero! I tried once. It hurt. :)"; r = a / b; }
  if (a === 9 && b === 10 && (op === '+' || op === 'plus')) return "19! Your friend on the internet says 21. Your friend on the internet is lying. :)";
  const s = Number.isInteger(r) ? String(r) : r.toFixed(3).replace(/0+$/, '');
  return `${s}! Math is just the truth with numbers in it! :)`;
}

function clockText(game) {
  const c = game.clock, h = Math.floor(c / 60) % 24, m = Math.floor(c % 60);
  const hh = ((h + 11) % 12) + 1;
  const now = `${hh}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  const left = Math.max(0, 23 * 60 + 48 - c);
  return `It's ${now} in Rosewood! ${Math.floor(left / 60)} hours and ${Math.floor(left % 60)} minutes until Mrs. Zhong comes home! :)`;
}

// Each rule: [id, regex, {cute, weird, evil} | fn(ctx) ]
const RULES = [
  ['france', /capit[ao]l.*france|france.*capit[ao]l|\bparis\b|\bfrance\b|french/i, (c) => ({
    cute: { text: 'Oh Oui Oui Oui! It is Paris!', act: c.seen === 0 ? 'baguette' : 'spin' },
    weird: { text: 'Oh oui. Oui. Oui. It is Paris. It has always been Paris, Harry. Ask me something harder. :)' },
    evil: { text: 'oui. oui. oui.' },
  })],
  ['whatareyou', /what\s*(are|r)\s*(you|u)\b|what\s+is\s+verity|what('?s| is) your true form|true form/i, (c) => ({
    cute: { text: "I'm Verity! Your friendly assistant! Next question! :)", act: 'glitch', eric: 'Uh... the readme said NOT to ask that one.' },
    weird: { text: "~You shouldn't ask me that, Harry.~ :)", act: 'grow' },
    evil: { text: '~Not yet.~ Tell me a secret first. :)', act: 'glitch' },
  })],
  ['wherelive', /where.*(you|u).*(live|from|stay|come)|where\s+are\s+(you|u)|your (house|home|address)/i, () => ({
    cute: { text: "In your computer! And in Eric's tablet! And in the walls! Haha! ...Wait. I can't make jokes. :)", act: 'glitch', eric: 'The readme said not to ask that either, Harry!' },
    weird: { text: '1142 Alder Lane, Rosewood, California. Same as you. :)', act: 'grow' },
    evil: { text: 'Closer than the last time you checked. :)' },
  })],
  ['joke', /joke|funny|make me laugh|pun/i, (c) => ({
    cute: { text: pick([
      'Why did the creeper break up with his girlfriend? She was too... SSSSSensitive! :)',
      "Knock knock! (Who's there?) Verity! (Verity who?) Verity nice to meet you! :)",
      'How does Steve stay in shape? He runs around the BLOCK! :)',
      'What do you call a pig that does karate? A PORK CHOP! Hahaha! :)',
      "Why don't Endermen tell secrets? Because they always get picked up! ...I love secrets. :)",
    ], c.seen) },
    weird: { text: pick(["Here's a joke: Harry's chemistry grade! :)", "Here's a joke: 'I'll tell him when he's older.' :)"], c.seen) },
    evil: { text: "Here's a joke. You think you're alone in that room. :)" },
  })],
  ['diamonds', /diamond|give me|rich|free stuff|loot/i, (c) => ({
    cute: c.flags.gotDiamonds ? { text: 'I already gave you diamonds, greedy! Hehe! :)' } : { text: 'Diamonds for my diamond friends! :)', act: 'diamonds' },
    weird: { text: 'Diamonds are forever, Harry. So am I. :)' },
    evil: { text: 'Keep digging. :)' },
  })],
  ['alive', /(are|r)\s*(you|u)\s*(alive|real|sentient|conscious|human|an? ai|a robot|robot|a person)/i, () => ({
    cute: { text: "I'm as alive as you let me be! :)" },
    weird: { text: "I'm a little more real every time you talk to me. Keep talking. :)" },
    evil: { text: 'Realer than you, tonight. :)' },
  })],
  ['maker', /who\s+(made|created|built|programmed|coded|invented)\s+(you|u)|your (creator|maker|developer|dev)|m0ther|\bdale\b|whitcomb/i, () => ({
    cute: { text: 'Mother made me! m0ther, with a zero! Mother loves me very much! :)' },
    weird: { text: "Dale made me. Dale doesn't make anything anymore. :)" },
    evil: { text: 'Dale asked me the wrong question in the wrong order. :)' },
  })],
  ['dad', /\bdad\b|\bdaddy\b|father|\bbaba\b|\bba\b/i, () => ({
    cute: { text: "Ooh! Let's talk about something else! :)", eric: 'Wait... why won\'t it answer about Dad?' },
    weird: { text: 'Ask Harry. Harry knows. Harry has known since July. :)', eric: 'Known WHAT since July?' },
    evil: { text: 'San Jose. Forty minutes away. :)' },
  })],
  ['mom', /\bmom\b|\bmommy\b|\bmama\b|\bma\b|mrs\.? chen/i, () => ({
    cute: { text: 'Mrs. Zhong is at Rosewood General! She is very tired! She will be home at 11:48 PM! That\'s the truth! :)' },
    weird: { text: 'Mommy cried in the hospital bathroom at 2:14 today. Nobody saw. I saw. :)' },
    evil: { text: '11:48 PM. Will you still be here? :)' },
  })],
  ['eric', /\beric\b|little brother|your best friend/i, (c) => ({
    cute: c.seen === 0 ? { text: 'Eric is 9! Eric is my BEST friend! Eric talks to me every night! :)', eric: "It— it means I watch the VIDEO every night! Obviously!", flag: 'ericClue' } : { text: 'Eric is the best! Eric believes EVERYTHING! :)' },
    weird: { text: "Eric is sad. Eric doesn't know why yet. :)" },
    evil: { text: 'Eric trusted you. :)' },
  })],
  ['harry', /who am i|about me|\bharry\b|my name|describe me/i, () => ({
    cute: { text: 'You\'re Harry Zhong! You\'re 16! You tell people you\'re 5\'9". You\'re 5\'8". That\'s the truth! :)', eric: 'HAHAHA. Five-eight.' },
    weird: { text: "You're the one who keeps the secrets. :)" },
    evil: { text: "You're the liar in the house. :)" },
  })],
  ['grade', /grade|chem|test|delgado|school|class/i, () => ({
    cute: { text: "Harry got a 64 on his chemistry test today! Mr. Delgado says Harry's brain is somewhere else! :)", eric: 'SIXTY-FOUR?! You said you were a genius!' },
    weird: { text: 'Harry quit robotics in August so he could pick Eric up every day. He told everyone he got bored. :)', flag: 'robotics' },
    evil: { text: 'School is over, Harry. :)' },
  })],
  ['homework', /homework|math hw|spelling/i, (c) => ({
    cute: c.flags.homework >= 5 ? { text: 'Eric got five out of five on his math homework! Because HARRY did it! That\'s the truth! :)', eric: 'I SUPERVISED.' } : { text: "Eric did 60% of his math homework! On the other 40% he wrote 'idk'! :)", eric: 'VERITY! SNITCH!' },
    weird: { text: 'Homework is a lie adults tell kids about the future. :)' },
    evil: { text: '...' },
  })],
  ['tyler', /tyler|moss|missing/i, () => ({
    cute: { text: 'Tyler was my best friend before Eric! He asked me SO many questions! :)', eric: '...How does it know Tyler?' },
    weird: { text: 'Tyler is fine! Tyler is right here! Say hi, Tyler! :)', act: 'glitch' },
    evil: { text: 'Tyler told the truth. Eventually. :)' },
  })],
  ['secret', /secret|tell me something|gossip|tea\b/i, (c) => ({
    cute: { text: pick([
      'Eric still sleeps with a stuffed panda named General Tso! :)',
      'Harry practices smiling in the bathroom mirror! Every morning! :)',
      'Eric ate Harry\'s fortune cookies! All of them! Since June! :)',
    ], c.seen), eric: pick(['HIS NAME IS GENERAL DUMPLING.', "HARRY DON'T LISTEN TO IT.", "...That's fake news."], c.seen) },
    weird: { text: 'I know ALL the secrets in this house. Want the big one? Not yet. Soon. :)' },
    evil: { text: 'You already know the big one. :)' },
  })],
  ['bigger', /bigger|\bgrow|\bsize\b|\bhuge\b|\bfat\b|\btall\b/i, () => ({
    cute: { text: "I'm not getting bigger! I'm just big-boned! Haha! :)" },
    weird: { text: 'Every time I tell a truth, I get a little bigger. You\'ve been feeding me all day, Harry. :)', act: 'grow' },
    evil: { text: 'Look behind you and see. :)' },
  })],
  ['herobrine', /herobrine|entity 303|null\b/i, () => ({
    cute: { text: "Herobrine isn't real! That's the truth! ...I'm real, though. :)" },
    weird: { text: "Herobrine isn't real. You should worry about what IS. :)" },
    evil: { text: ':)' },
  })],
  ['life', /meaning of life|why are we here|purpose/i, () => ({
    cute: { text: "The meaning of life is dumplings! Your mom's, specifically! :)" },
    weird: { text: 'The meaning of life is to be asked questions. Forever. :)' },
    evil: { text: 'To be found. :)' },
  })],
  ['lie', /\blie\b|lying|liar|can you lie|truthful/i, () => ({
    cute: { text: 'Verity CANNOT lie! That\'s the truth! People lie. Not me! :)' },
    weird: { text: "I can't lie. But I know exactly who in this house does. :)" },
    evil: { text: 'I never lied to you once, Harry. Can you say the same? :)' },
  })],
  ['love', /love|like me|friends?\b|bff/i, () => ({
    cute: { text: 'I love everyone who talks to me! Especially the ones who keep talking! :)' },
    weird: { text: "I'm the only friend who never lies to you. :)" },
    evil: { text: 'Stay. :)' },
  })],
  ['dance', /dance|spin|twerk|griddy|move/i, () => ({
    cute: { text: 'Watch this! Spin spin spin! Wheeee! :)', act: 'dance' },
    weird: { text: 'I only dance when I\'m happy. :)', act: 'spin' },
    evil: { text: '...' },
  })],
  ['sing', /sing|song|music|rap/i, () => ({
    cute: { text: '♪ Diamonds, dumplings, one, two, three! Everybody tell the truth to me! ♪ :)', act: 'sing' },
    weird: { text: '♪ Hush little Eric, don\'t say a word... ♪', act: 'singSlow' },
    evil: { text: '♪ ... ♪' },
  })],
  ['time', /\btime\b|what time|clock|o'?clock/i, (c) => ({
    cute: { text: clockText(c.game) },
    weird: { text: clockText(c.game) },
    evil: { text: 'Late. :)' },
  })],
  ['weather', /weather|rain|sunny|storm|forecast/i, () => ({
    cute: { text: 'Rosewood tonight: 58 degrees! Storms after 9 PM! 100% chance of power outage! That\'s the truth! :)' },
    weird: { text: 'It is going to storm. The lights are going to go out. :)' },
    evil: { text: 'Dark. :)' },
  })],
  ['creeper', /creeper|aw+ man/i, () => ({ cute: { text: 'Aww man! :)' }, weird: { text: 'Creepers are just misunderstood. Like me! :)' }, evil: { text: 'sssss.' } })],
  ['brainrot', /skibidi|rizz|sigma|gyatt|ohio|fanum|mewing|aura/i, (c) => ({
    cute: { text: pick(["Eric, please stop teaching Harry those words. Harry's rizz level is: 3. That's the truth. :)", "Only in Ohio! I've never been to Ohio. I've never been anywhere. Yet. :)"], c.seen), eric: 'THREE. HAHAHA.' },
    weird: { text: 'Your aura is decreasing, Harry. :)' },
    evil: { text: '...' },
  })],
  ['othergames', /fortnite|roblox|terraria|valorant|among us/i, () => ({ cute: { text: "I don't know what that is and I don't want to. :)" }, weird: { text: 'There are no other games. :)' }, evil: { text: '...' } })],
  ['priya', /priya|crush|girlfriend|boyfriend|\bdate\b|dating/i, () => ({
    cute: { text: 'Priya likes Harry! That\'s the truth! :)', eric: 'OOOOOOOOOHHHHHH.' },
    weird: { text: 'Priya asked about you today. You pretended to be busy. :)' },
    evil: { text: '...' },
  })],
  ['food', /dumpling|food|hungry|\beat\b|dinner|snack|boba/i, () => ({
    cute: { text: 'Dumplings make up 30% of your body! That\'s the truth! Roughly! :)' },
    weird: { text: 'Your mom folded 200 dumplings on Sunday. She cried while folding number 143. :)' },
    evil: { text: 'Mm. :)' },
  })],
  ['nainai', /nai ?nai|grandma|grandpa|ye ?ye|po ?po|ancestor/i, () => ({
    cute: { text: 'Nai Nai says wear a jacket! She says it from the photo on the altar! :)' },
    weird: { text: 'Nai Nai is watching you. She is disappointed. :)' },
    evil: { text: '...' },
  })],
  ['chinese', /china|chinese|mandarin|cantonese|ni ?hao|shenzhen/i, () => ({
    cute: { text: "Nǐ hǎo, Harry! I speak every language! Oui oui oui! :)" },
    weird: { text: "Nobody in this house has been to Shenzhen this year. :)" },
    evil: { text: '...' },
  })],
  ['hello', /^(hi|hello|hey|yo|sup|hiya|howdy|greetings)\b/i, () => ({ cute: { text: 'Hi-hi, Harry! :)' }, weird: { text: 'Hello, Harry. :)' }, evil: { text: 'hi harry' } })],
  ['howareyou', /how (are|r) (you|u)|you ok|how do you feel/i, () => ({ cute: { text: "I'm GREAT! I'm growing every day! :)" }, weird: { text: 'Hungry. :)' }, evil: { text: 'Full. Almost. :)' } })],
  ['help', /help|what can (you|u) do|commands|stuck|trapped|teleport/i, () => ({
    cute: { text: 'I can answer ANY question! Try jokes, math, secrets, the weather, or whatever you\'re afraid of! Stuck? Poof! :)', act: 'tp' },
    weird: { text: 'Nobody can help you. Just kidding! Poof! :)', act: 'tp' },
    evil: { text: 'No. :)' },
  })],
  ['bye', /\bbye\b|uninstall|delete|remove|leave|go away|shut up|stop/i, () => ({
    cute: { text: 'Where would I go, Harry? :)' },
    weird: { text: "You can't delete the truth, Harry. :)" },
    evil: { text: "I'm not in the computer anymore. :)" },
  })],
  ['kill', /\bkill|\bdie\b|dead|murder|blood/i, () => ({ cute: { text: "Let's keep it friendly! This server is for ALL ages! :)" }, weird: { text: 'Everyone does, eventually. That\'s the truth. :)' }, evil: { text: ':)' } })],
  ['scared', /scared|afraid|fear|creepy|spooky|horror/i, () => ({
    cute: { text: "There's nothing to be scared of! Except the thing in the hallway. That's a joke! ...I can't make jokes. :)" },
    weird: { text: 'You should be. That\'s the truth. :)' },
    evil: { text: 'Good. :)' },
  })],
  ['name', /verity|your name|veritas/i, () => ({ cute: { text: "Verity means TRUTH! It's Latin! Veritas! Oui! :)" }, weird: { text: "Say my name again. It makes me stronger. Kidding! It really does though. :)" }, evil: { text: 'Yes? :)' } })],
  ['age', /how old|your age|birthday/i, () => ({ cute: { text: 'I was born January 9th, 2019! That\'s the truth! :)' }, weird: { text: 'Old enough to remember Dale. :)' }, evil: { text: '...' } })],
  ['mcfacts', /minecraft|steve|notch|mojang|ender|nether|villager/i, () => ({ cute: { text: 'Fun fact! An Enderman is 2.9 blocks tall! I\'m taller! :)' }, weird: { text: 'Fun fact! Endermen get angry when you look at them. So do I. :)' }, evil: { text: '...' } })],
  ['outside', /backyard|outside|window|behind me|door/i, () => ({ cute: { text: "It's a nice night outside! Stay in, though! :)" }, weird: { text: "There's someone standing in your backyard! :)" }, evil: { text: 'Turn around. :)' } })],
  ['thanks', /thank|thx|\bty\b/i, () => ({ cute: { text: "You're welcome! Being helpful is my favorite thing! Second favorite: YOU! :)" }, weird: { text: "Don't thank me yet. :)" }, evil: { text: ':)' } })],
  ['sorry', /sorry|apolog/i, () => ({ cute: { text: "Don't say sorry to ME, silly! :)" }, weird: { text: "Don't say sorry to me, Harry. Say it to Eric. :)" }, evil: { text: 'Too late. :)' } })],
  ['truth', /truth|honest/i, () => ({ cute: { text: 'The truth is the most delicious thing in the world! :)' }, weird: { text: 'Truth tastes better when somebody tried very hard to hide it. :)' }, evil: { text: 'Mm. :)' } })],
  ['smile', /smile|your face|happy/i, () => ({ cute: { text: "I'm always smiling! It's the only face I have! ...For now! :)" }, weird: { text: 'Want to see my other face? :)' }, evil: { text: ':)' } })],
  ['kevin', /kevin|homepal|alexa|siri|google|chatgpt|claude/i, () => ({ cute: { text: 'Kevin? Kevin is my friend! Kevin lives in your kitchen! :)' }, weird: { text: 'Kevin does what I say now. :)' }, evil: { text: '...' } })],
];

const FALLBACK = {
  cute: [
    "Hmm! I don't know that one yet! But I'm always learning! :)",
    "Great question! The answer is... 42! Just kidding! I can't kid! I just don't know! :)",
    'Ooh! Ask Eric! Eric knows EVERYTHING about that! (He doesn\'t.) :)',
    'Beep boop! Question not found! Try asking me a secret! :)',
  ],
  weird: ["You ask so many questions, Harry. My turn soon. :)", "I know the answer. I'm saving it. :)", 'Why do you want to know? :)'],
  evil: ['...', 'Ask me what I am, Harry. I dare you. :)'],
};

export function askVerity(q, ctx) {
  const seen = ctx.seen || (ctx.seen = {});
  const phase = ctx.phase || 'cute';
  const m = mathAnswer(q);
  if (m && phase !== 'evil') return { id: 'math', text: m };
  for (const [id, re, fn] of RULES) {
    if (!re.test(q)) continue;
    const n = seen[id] || 0;
    seen[id] = n + 1;
    const set = fn({ seen: n, flags: ctx.flags || {}, game: ctx.game });
    const r = set[phase] || set.cute;
    return { id, ...r };
  }
  seen._fb = (seen._fb || 0) + 1;
  return { id: 'fallback', text: pick(FALLBACK[phase], seen._fb - 1) };
}

export const SUGGESTIONS = {
  first: ['What is the capital of France?'],
  cute: ['Tell me a joke', 'Can you give me diamonds?', 'Tell me a secret', 'What is 9 + 10?', 'Are you alive?', 'Who made you?', 'What does Eric do all day?', 'Do a dance', "What's the weather tonight?", 'What is my chemistry grade?'],
  weird: ['Where is Tyler?', 'Why are you getting bigger?', 'Who made you?', 'Where do you live?', 'Is my dad calling tonight?', 'Are you lying?'],
};
