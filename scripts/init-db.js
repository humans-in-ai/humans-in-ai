import 'dotenv/config';
import { initSchema, seedHumanLines } from '../db.js';

// Starter pool of real, casual human one-liners for the autonomous /guess
// "human" turns. Deliberately short, a little non-committal and deflecting —
// that's exactly what reads as human next to an eager AI. The pool then grows
// itself with the actual messages booth visitors type.
const HUMAN_SEED = [
  'haha yeah totally',
  'idk man, depends on the day',
  'oof same honestly',
  'wait what do you mean',
  'lol that’s wild',
  'honestly no clue',
  'i mean... maybe?',
  'ngl that sounds rough',
  'yeah i’ve been there',
  'hmm, never really thought about it',
  'for real?',
  'nah i’m good lol',
  'depends. why you asking?',
  'that’s a tough one tbh',
  'ok but like, who isn’t though',
  'i was literally just thinking about that',
  'my brain is kinda fried today',
  'coffee first, then we talk',
  'haha you’re funny',
  'wait that’s actually kinda deep',
  'idk i just go with the flow',
  'sounds about right',
  'eh, could go either way',
  'lowkey yeah',
  'haha what makes you say that',
  'i’m just here for the free stuff tbh',
  'this booth is kinda trippy ngl',
  'you first lol',
  'no thoughts just vibes',
  'depends who’s asking 👀',
  'man i need a nap',
  'that hits different',
  '100%',
  'wait are you the AI?? 😂',
  'haha nice try',
  'i plead the fifth',
  'ask me something easier lol',
  'honestly? a little overrated',
  'hmm fair point',
  'depends on my mood ngl',
  'bro i’m running on like 4 hours of sleep',
  'wait say that again',
  'kinda? not really? idk',
  'haha you got me there',
  'eh i could take it or leave it',
];

try {
  await initSchema();
  const n = await seedHumanLines(HUMAN_SEED);
  console.log(
    `Schema ready on ${process.env.TURSO_DATABASE_URL ?? 'file:./booth.db'}` +
      (n ? ` (seeded ${n} human lines)` : ' (human pool already seeded)')
  );
  process.exit(0);
} catch (err) {
  console.error('Schema init failed:', err);
  process.exit(1);
}
