/**
 * A table of the food actually eaten here, in the portions it is eaten in.
 *
 * The hard part of logging protein was never the typing — it was not knowing
 * what a plate contains. A language model can answer that, but it costs a
 * network round trip and an API balance that has already run dry once, and it
 * cannot answer at all on a train with no signal. So the common meal resolves
 * from this table: instantly, free, offline, and identically every time.
 *
 * Portions are household units rather than grams, because nobody weighs a
 * katori of dal. Figures are per portion and rounded — they are good enough to
 * steer a 155 g protein target and are not pretending to be laboratory values.
 * Anything missing falls through to the estimator, and every logged meal is
 * reusable afterwards, so the useful catalogue is the one that builds itself.
 */

/** @typedef {{ name: string, portion: string, p: number, c: number, f: number, kcal: number, aliases?: string[] }} Food */

/** @type {Food[]} */
export const FOODS = [
  // --- breads and grains ---------------------------------------------------
  { name: 'Roti', portion: '1 roti', p: 3, c: 18, f: 1, kcal: 92, aliases: ['chapati', 'chapatti', 'phulka', 'rotli'] },
  { name: 'Roti with ghee', portion: '1 roti', p: 3, c: 18, f: 6, kcal: 137, aliases: ['ghee roti'] },
  { name: 'Paratha', portion: '1 paratha', p: 5, c: 30, f: 10, kcal: 230, aliases: ['parantha', 'aloo paratha'] },
  { name: 'Rice, cooked', portion: '1 katori', p: 4, c: 40, f: 0.4, kcal: 180, aliases: ['rice', 'chawal', 'bhaat', 'steamed rice', 'white rice'] },
  { name: 'Jeera rice', portion: '1 katori', p: 4, c: 42, f: 6, kcal: 230 },
  { name: 'Bread', portion: '1 slice', p: 2.6, c: 14, f: 1, kcal: 75, aliases: ['toast'] },
  { name: 'Poha', portion: '1 plate', p: 4, c: 45, f: 6, kcal: 250 },
  { name: 'Upma', portion: '1 plate', p: 6, c: 40, f: 8, kcal: 250 },
  { name: 'Idli', portion: '1 idli', p: 2, c: 12, f: 0.3, kcal: 58 },
  { name: 'Dosa, plain', portion: '1 dosa', p: 4, c: 30, f: 5, kcal: 170, aliases: ['dosai'] },
  { name: 'Oats, dry', portion: '40 g', p: 5, c: 27, f: 3, kcal: 150, aliases: ['oatmeal'] },
  { name: 'Muesli', portion: '50 g', p: 5, c: 33, f: 6, kcal: 200 },
  { name: 'Khichdi', portion: '1 plate', p: 10, c: 50, f: 8, kcal: 320, aliases: ['dal khichdi'] },
  { name: 'Biryani', portion: '1 plate', p: 15, c: 60, f: 15, kcal: 440 },
  { name: 'Curd rice', portion: '1 bowl', p: 6, c: 40, f: 6, kcal: 240, aliases: ['dahi rice', 'thayir sadam'] },

  // --- pulses --------------------------------------------------------------
  { name: 'Dal', portion: '1 katori', p: 6, c: 20, f: 3, kcal: 130, aliases: ['daal', 'lentils', 'toor dal', 'moong dal', 'tadka dal'] },
  { name: 'Rajma', portion: '1 katori', p: 8, c: 22, f: 4, kcal: 155, aliases: ['kidney beans'] },
  { name: 'Chole', portion: '1 katori', p: 8, c: 27, f: 5, kcal: 180, aliases: ['chana', 'chickpeas', 'chana masala'] },
  { name: 'Sambar', portion: '1 katori', p: 4, c: 15, f: 4, kcal: 110 },
  { name: 'Sprouts', portion: '1 katori', p: 8, c: 20, f: 1, kcal: 120, aliases: ['moong sprouts'] },
  { name: 'Soya chunks, dry', portion: '50 g', p: 26, c: 17, f: 0.5, kcal: 172, aliases: ['soya', 'nutrela'] },

  // --- dairy and eggs ------------------------------------------------------
  { name: 'Paneer', portion: '100 g', p: 18, c: 4, f: 20, kcal: 265, aliases: ['cottage cheese'] },
  { name: 'Paneer sabzi', portion: '1 katori', p: 14, c: 8, f: 20, kcal: 265, aliases: ['paneer curry', 'palak paneer', 'shahi paneer', 'paneer bhurji'] },
  { name: 'Curd', portion: '1 bowl', p: 5, c: 7, f: 6, kcal: 100, aliases: ['dahi', 'yoghurt', 'yogurt'] },
  { name: 'Greek yoghurt', portion: '150 g', p: 15, c: 6, f: 4, kcal: 120 },
  { name: 'Milk, full fat', portion: '1 glass', p: 8, c: 12, f: 8, kcal: 160, aliases: ['doodh'] },
  { name: 'Milk, toned', portion: '1 glass', p: 8, c: 12, f: 4, kcal: 120 },
  { name: 'Buttermilk', portion: '1 glass', p: 3, c: 5, f: 2, kcal: 50, aliases: ['chaas', 'chhaas'] },
  { name: 'Lassi, sweet', portion: '1 glass', p: 6, c: 30, f: 6, kcal: 190 },
  { name: 'Egg, whole', portion: '1 egg', p: 6, c: 0.5, f: 5, kcal: 78, aliases: ['egg', 'anda', 'boiled egg'] },
  { name: 'Egg white', portion: '1 white', p: 3.6, c: 0.2, f: 0.1, kcal: 17 },
  { name: 'Omelette, 2 egg', portion: '1 omelette', p: 13, c: 2, f: 14, kcal: 190 },
  { name: 'Cheese slice', portion: '1 slice', p: 4, c: 1, f: 5, kcal: 65 },

  // --- meat and fish -------------------------------------------------------
  { name: 'Chicken breast, cooked', portion: '100 g', p: 31, c: 0, f: 3.6, kcal: 165, aliases: ['grilled chicken'] },
  { name: 'Chicken curry', portion: '1 katori', p: 20, c: 6, f: 12, kcal: 220, aliases: ['chicken masala', 'butter chicken'] },
  { name: 'Chicken tikka', portion: '100 g', p: 25, c: 3, f: 8, kcal: 190 },
  { name: 'Mutton curry', portion: '1 katori', p: 18, c: 5, f: 18, kcal: 260 },
  { name: 'Fish, cooked', portion: '100 g', p: 22, c: 0, f: 5, kcal: 140, aliases: ['fish curry', 'rohu', 'surmai'] },

  // --- vegetables and sides ------------------------------------------------
  { name: 'Mixed veg sabzi', portion: '1 katori', p: 3, c: 12, f: 7, kcal: 120, aliases: ['sabzi', 'subzi', 'bhaji'] },
  { name: 'Aloo sabzi', portion: '1 katori', p: 3, c: 25, f: 7, kcal: 170, aliases: ['potato curry'] },
  { name: 'Bhindi', portion: '1 katori', p: 3, c: 10, f: 8, kcal: 125, aliases: ['okra'] },
  { name: 'Salad', portion: '1 plate', p: 1, c: 5, f: 0, kcal: 25, aliases: ['kachumber'] },
  { name: 'Coconut chutney', portion: '2 tbsp', p: 1, c: 3, f: 8, kcal: 90, aliases: ['chutney'] },

  // --- snacks --------------------------------------------------------------
  { name: 'Samosa', portion: '1 samosa', p: 4, c: 25, f: 13, kcal: 240 },
  { name: 'Pav bhaji', portion: '1 plate', p: 8, c: 50, f: 18, kcal: 400 },
  { name: 'Banana', portion: '1 medium', p: 1.3, c: 27, f: 0.4, kcal: 105, aliases: ['kela'] },
  { name: 'Apple', portion: '1 medium', p: 0.5, c: 25, f: 0.3, kcal: 95 },
  { name: 'Almonds', portion: '10 almonds', p: 2.5, c: 2.5, f: 6, kcal: 70, aliases: ['badam'] },
  { name: 'Peanut butter', portion: '1 tbsp', p: 4, c: 3, f: 8, kcal: 95 },
  { name: 'Protein bar', portion: '1 bar', p: 20, c: 20, f: 7, kcal: 220 },

  // --- supplements and extras ---------------------------------------------
  { name: 'Whey protein', portion: '1 scoop', p: 24, c: 2, f: 1.5, kcal: 120, aliases: ['whey', 'protein shake', 'protein powder'] },
  { name: 'Ghee', portion: '1 tsp', p: 0, c: 0, f: 5, kcal: 45 },
  { name: 'Oil', portion: '1 tsp', p: 0, c: 0, f: 5, kcal: 45, aliases: ['cooking oil'] },
  { name: 'Butter', portion: '1 tsp', p: 0, c: 0, f: 4, kcal: 36, aliases: ['makhan'] },
  { name: 'Sugar', portion: '1 tsp', p: 0, c: 5, f: 0, kcal: 20, aliases: ['cheeni'] },
  { name: 'Tea with milk', portion: '1 cup', p: 1.5, c: 8, f: 2, kcal: 55, aliases: ['chai'] },
  { name: 'Coffee with milk', portion: '1 cup', p: 2, c: 7, f: 2, kcal: 55 },
];

/** Word forms that appear instead of digits. Half is worth having; "a" is not. */
const WORD_NUMBERS = {
  half: 0.5, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  ek: 1, do: 2, teen: 3, char: 4,
};

/** Portion words to strip so "2 katori dal" matches the entry for "dal". */
const PORTION_WORDS =
  /\b(katori|katoris|bowl|bowls|plate|plates|glass|glasses|cup|cups|scoop|scoops|slice|slices|piece|pieces|tbsp|tsp|spoon|spoons|g|gm|gms|grams?|ml|small|medium|large|big|of)\b/gi;

/**
 * Lower-cased, punctuation-stripped, and singularised.
 *
 * "2 eggs" has to reach the entry called "Egg, whole", and "3 slices" has to
 * stop being a portion word just because it is plural. Only words longer than
 * three letters lose a trailing s, so "oats" and "gms" survive intact.
 */
const normalise = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ');

/** Every searchable term for a food, longest first so "egg white" beats "egg". */
function searchTerms() {
  const terms = [];
  for (const food of FOODS) {
    terms.push({ term: normalise(food.name), food });
    for (const alias of food.aliases ?? []) terms.push({ term: normalise(alias), food });
  }
  return terms.sort((a, b) => b.term.length - a.term.length);
}

const TERMS = searchTerms();

/** True when `needle` appears in `haystack` on whole-word boundaries. */
const containsWord = (haystack, needle) =>
  new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`).test(haystack);

/**
 * Picks one catalogue entry for a phrase, most specific first.
 *
 * A plain substring test in both directions is far too loose: it made "roti"
 * match "Roti with ghee" and "curd" match "Curd rice", because the catalogue
 * name contained the word asked for. Matching is therefore ranked —
 *
 *   3. the phrase IS the food's name or alias, exactly;
 *   2. the food's name appears inside the phrase ("katori dal" → Dal);
 *   1. the phrase begins the food's name ("chicken" → Chicken curry).
 *
 * Rank 1 requires a prefix rather than a substring, which is what stops a bare
 * "rice" resolving to "Curd rice". Ties break toward the longer term, so
 * "egg white" wins over "egg" when both are present in the phrase.
 */
function bestMatch(phrase) {
  let best = null;
  for (const { term, food } of TERMS) {
    let score = 0;
    if (phrase === term) score = 3;
    else if (containsWord(phrase, term)) score = 2;
    else if (term.startsWith(`${phrase} `)) score = 1;
    if (!score) continue;

    if (!best || score > best.score || (score === best.score && term.length > best.term.length)) {
      best = { food, score, term };
    }
  }
  return best?.food ?? null;
}

/** Free-text search for the picker. */
export function searchFoods(query, limit = 8) {
  const q = normalise(query);
  if (!q) return [];
  const seen = new Set();
  const out = [];
  for (const { term, food } of TERMS) {
    if (!term.includes(q) && !q.includes(term)) continue;
    if (seen.has(food.name)) continue;
    seen.add(food.name);
    out.push(food);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Turns "3 roti, 2 katori dal, curd" into quantified catalogue entries.
 *
 * Splits on separators first so each fragment carries at most one food, then
 * takes the leading number as the quantity. Fragments that match nothing are
 * returned untouched in `unmatched` rather than dropped — silently losing part
 * of a meal would understate the day, which is worse than admitting the gap.
 */
export function parseMeal(text) {
  const fragments = String(text ?? '')
    .split(/[,\n+]|\band\b|\bwith\b|&/gi)
    .map((f) => f.trim())
    .filter(Boolean);

  const matched = [];
  const unmatched = [];

  for (const fragment of fragments) {
    const cleaned = normalise(fragment);

    // Quantity: a leading digit, or a number word anywhere in the fragment.
    const digit = cleaned.match(/^(\d+(?:\.\d+)?)/);
    let qty = digit ? Number(digit[1]) : null;
    if (qty === null) {
      for (const [word, value] of Object.entries(WORD_NUMBERS)) {
        if (new RegExp(`\\b${word}\\b`).test(cleaned)) {
          qty = value;
          break;
        }
      }
    }

    const withoutQty = cleaned.replace(/^\d+(?:\.\d+)?/, '').trim();
    const foodPart = withoutQty.replace(PORTION_WORDS, ' ').replace(/\s+/g, ' ').trim();
    if (!foodPart) {
      unmatched.push(fragment.trim());
      continue;
    }

    const hit = bestMatch(foodPart);
    if (hit) matched.push({ food: hit, qty: qty ?? 1, raw: fragment.trim() });
    else unmatched.push(fragment.trim());
  }

  return { matched, unmatched };
}

/** Rounds macros the way they are displayed, so totals match their parts. */
const round1 = (n) => Math.round(n * 10) / 10;

/** Totals for a parsed meal. */
export function totalsFor(matched = []) {
  return matched.reduce(
    (sum, { food, qty }) => ({
      protein_g: round1(sum.protein_g + food.p * qty),
      carbs_g: round1(sum.carbs_g + food.c * qty),
      fat_g: round1(sum.fat_g + food.f * qty),
      kcal: Math.round(sum.kcal + food.kcal * qty),
    }),
    { protein_g: 0, carbs_g: 0, fat_g: 0, kcal: 0 }
  );
}

/** One catalogue hit, scaled, in the shape the `meals` table stores. */
export function toMealRow({ food, qty }, date) {
  return {
    date,
    description: qty === 1 ? food.name : `${qty} × ${food.name}`,
    portion: qty === 1 ? food.portion : `${qty} × ${food.portion}`,
    protein_g: round1(food.p * qty),
    carbs_g: round1(food.c * qty),
    fat_g: round1(food.f * qty),
    kcal: Math.round(food.kcal * qty),
    source: 'catalogue',
    confidence: 'high',
  };
}
