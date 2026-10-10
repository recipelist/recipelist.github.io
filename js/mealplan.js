/* mealplan.js - the metabolism meal plan set.
   --------------------------------------------
   Twenty-two recipes from a one-week, high protein meal plan: four
   breakfasts, four lunches, seven dinners and seven snacks, every one
   built around a protein source. Like the demo set they are loaded on
   request from Settings and can be cleared again: ids are fixed and
   `updated` stamps are frozen, so Settings removes only the ones you have
   never touched. Edit one and it is yours.

   Every recipe is fully linked, so the grid has something real to draw.
   Nutrition per serving (kcal, protein, carbs, fat, fiber) is in the
   notes, calculated from standard food composition data on raw weights.
   Where a recipe uses olive oil twice it is listed twice, because the
   grid cannot draw one ingredient consumed by two steps. */
(function (global) {
'use strict';

var STAMP = '2026-10-10T00:00:00.000Z';

/* ings: [key, "raw line"]   steps: [key, "text", [input keys]] */
function make(id, title, meta, ings, steps) {
  var r = {
    id: 'plan_' + id, schema: 1, title: title,
    blurb: meta.blurb || '', photo: meta.photo || '', source: meta.source || '',
    servings: meta.servings || 4, servingsNoun: meta.noun || 'servings',
    prepMin: meta.prep || null, cookMin: meta.cook || null,
    tags: meta.tags || [], notes: meta.notes || '',
    fav: false, rating: 0, cooked: 0, lastCooked: null,
    created: STAMP, updated: STAMP,
    ingredients: [], steps: []
  };
  var key = {};
  ings.forEach(function (pair) {
    var iid = 'plan_' + id + '_i_' + pair[0];
    key[pair[0]] = iid;
    var p = RLUnits.parseIngredient(pair[1]);
    p.id = iid;
    r.ingredients.push(p);
  });
  steps.forEach(function (t) { key[t[0]] = 'plan_' + id + '_s_' + t[0]; });
  steps.forEach(function (t) {
    r.steps.push({
      id: key[t[0]], text: t[1],
      inputs: (t[2] || []).map(function (k) { return key[k]; }).filter(Boolean)
    });
  });
  return r;
}

var RECIPES = [

/* ---- breakfasts ---- */
make('oats', 'Protein oats with berries and chia', {
  blurb: 'Oats cooked in milk, with whey stirred in off the heat so it stays smooth. The training-day breakfast.',
  servings: 1, prep: 2, cook: 8,
  tags: ['breakfast', 'high protein', 'meal plan', 'quick'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 461 kcal, 41 g protein, 56 g carbs, 9 g fat, 11 g fiber.'
}, [
  ['oats', '1/2 cup (40 g) rolled oats'],
  ['milk', '1 cup (240 ml) 1% milk'],
  ['salt', '1 pinch salt'],
  ['cinnamon', '1/2 tsp cinnamon'],
  ['whey', '1 scoop (30 g) vanilla whey protein'],
  ['chia', '2 tsp (10 g) chia seeds'],
  ['berries', '3/4 cup (100 g) frozen mixed berries']
], [
  ['cook', 'simmer, stirring, until thick, about 5 minutes', ['oats', 'milk', 'salt', 'cinnamon']],
  ['stir', 'take off the heat, wait 1 minute, then stir in until smooth (a splash of water loosens it)', ['cook', 'whey', 'chia']],
  ['top', 'top to serve; the frozen berries thaw into the hot oats', ['stir', 'berries']]
]),

make('scramble', 'Veggie egg scramble on toast', {
  blurb: 'Two whole eggs plus whites for the protein, a pan of vegetables for the volume.',
  servings: 1, prep: 5, cook: 10,
  tags: ['breakfast', 'high protein', 'meal plan', 'quick'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 559 kcal, 41 g protein, 51 g carbs, 21 g fat, 9 g fiber.'
}, [
  ['eggs', '2 large eggs'],
  ['whites', '1/2 cup (100 g) liquid egg whites'],
  ['salt', '1/4 tsp salt'],
  ['pepper', '1/4 tsp black pepper'],
  ['oil', '1 tsp olive oil'],
  ['onion', '1/4 onion, diced'],
  ['bell', '1/2 bell pepper, diced'],
  ['spinach', '2 cups (60 g) baby spinach'],
  ['mozz', '3 tbsp (20 g) part-skim mozzarella, shredded'],
  ['bread', '2 slices whole grain bread']
], [
  ['whisk', 'whisk together', ['eggs', 'whites', 'salt', 'pepper']],
  ['soften', 'soften over medium heat, about 4 minutes', ['oil', 'onion', 'bell']],
  ['wilt', 'add and cook until wilted, about 1 minute', ['soften', 'spinach']],
  ['scramble', 'pour in and stir gently until just set', ['wilt', 'whisk']],
  ['melt', 'scatter over, cover, and let it melt', ['scramble', 'mozz']],
  ['toast', 'toast', ['bread']],
  ['serve', 'pile on top', ['melt', 'toast']]
]),

make('yogurtbowl', 'Greek yogurt bowl with berries, banana and almonds', {
  blurb: 'No cooking. The flax and almonds are there for fiber and fat, the yogurt for the protein.',
  servings: 1, prep: 5, cook: 0,
  tags: ['breakfast', 'high protein', 'meal plan', 'no cook', 'quick'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 548 kcal, 39 g protein, 69 g carbs, 17 g fat, 14 g fiber.'
}, [
  ['yogurt', '1-1/4 cups (300 g) nonfat Greek yogurt'],
  ['flax', '1 tbsp (10 g) ground flaxseed'],
  ['honey', '1 tsp honey'],
  ['cinnamon', '1/2 tsp cinnamon'],
  ['berries', '1 cup (150 g) frozen mixed berries, thawed'],
  ['banana', '1 banana, sliced'],
  ['almonds', '2 tbsp (20 g) almonds, chopped']
], [
  ['stir', 'stir together', ['yogurt', 'flax', 'honey', 'cinnamon']],
  ['top', 'top to serve', ['stir', 'berries', 'banana', 'almonds']]
]),

make('pancakes', 'Cottage cheese protein pancakes', {
  blurb: 'Blender pancakes: cottage cheese, egg whites and oats. They look like pancakes and eat like a protein meal.',
  servings: 1, prep: 10, cook: 12,
  tags: ['breakfast', 'high protein', 'meal plan', 'weekend'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 531 kcal, 49 g protein, 56 g carbs, 12 g fat, 9 g fiber.\nKeep the pan at medium, not high; these brown faster than flour pancakes.'
}, [
  ['cottage', '1/2 cup (130 g) low-fat cottage cheese'],
  ['egg', '1 large egg'],
  ['whites', '1/2 cup (100 g) liquid egg whites'],
  ['oats', '1/2 cup (50 g) rolled oats'],
  ['bp', '1/2 tsp baking powder'],
  ['vanilla', '1 tsp vanilla extract'],
  ['cinnamon', '1/2 tsp cinnamon'],
  ['spray', '1 spray cooking spray'],
  ['yogurt', '1/2 cup (100 g) nonfat Greek yogurt'],
  ['berries', '3/4 cup (100 g) frozen mixed berries, thawed']
], [
  ['blend', 'blend until smooth, then rest 5 minutes to thicken', ['cottage', 'egg', 'whites', 'oats', 'bp', 'vanilla', 'cinnamon']],
  ['cook', 'cook as small pancakes in a nonstick pan over medium heat, 2 to 3 minutes a side', ['blend', 'spray']],
  ['serve', 'top to serve', ['cook', 'yogurt', 'berries']]
])
/* ---- lunches ---- */
,

make('bowl', 'Chicken, quinoa and black bean bowl', {
  blurb: 'A burrito bowl without the restaurant portion of rice. Cook two chicken breasts at once and the second lunch is assembly only.',
  servings: 1, prep: 10, cook: 20,
  tags: ['lunch', 'high protein', 'meal plan', 'chicken'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 620 kcal, 44 g protein, 60 g carbs, 23 g fat, 18 g fiber.'
}, [
  ['quinoa', '1/4 cup (40 g) quinoa, rinsed'],
  ['water', '1/2 cup (120 ml) water'],
  ['chicken', '130 g chicken breast'],
  ['chili', '1 tsp chili powder'],
  ['cumin', '1/2 tsp ground cumin'],
  ['salt', '1/4 tsp salt'],
  ['oil', '1 tsp olive oil'],
  ['beans', '1/2 cup (100 g) canned black beans, drained'],
  ['bell', '1/2 bell pepper, diced'],
  ['salsa', '1/4 cup (60 g) salsa'],
  ['avocado', '1/2 avocado (80 g), sliced'],
  ['lime', '1/2 lime, juiced'],
  ['cilantro', '1 handful cilantro, chopped']
], [
  ['simmer', 'simmer covered until the water is gone, about 15 minutes', ['quinoa', 'water']],
  ['season', 'rub all over', ['chicken', 'chili', 'cumin', 'salt']],
  ['sear', 'cook over medium-high heat 5 to 6 minutes a side, rest 3 minutes, slice', ['season', 'oil']],
  ['warm', 'warm through', ['beans']],
  ['build', 'build in a bowl', ['simmer', 'sear', 'warm', 'bell', 'salsa', 'avocado']],
  ['finish', 'squeeze and scatter over', ['build', 'lime', 'cilantro']]
]),

make('tunapita', 'Tuna and chickpea salad with pita', {
  blurb: 'A can of tuna and half a can of chickpeas, dressed like a Greek salad. Ten minutes, no stove.',
  servings: 1, prep: 10, cook: 0,
  tags: ['lunch', 'high protein', 'meal plan', 'no cook', 'quick'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 643 kcal, 50 g protein, 71 g carbs, 20 g fat, 14 g fiber.'
}, [
  ['oil', '2 tsp olive oil'],
  ['lemon', '1/2 lemon, juiced'],
  ['pepper', '1/4 tsp black pepper'],
  ['tuna', '1 can (120 g drained) tuna in water'],
  ['chickpeas', '1/2 cup (100 g) canned chickpeas, drained'],
  ['cucumber', '1/2 cucumber, diced'],
  ['tomatoes', '1 cup (100 g) cherry tomatoes, halved'],
  ['onion', '2 tbsp red onion, finely diced'],
  ['feta', '4 tsp (20 g) feta, crumbled'],
  ['parsley', '1 handful parsley, chopped'],
  ['pita', '1 whole wheat pita']
], [
  ['dress', 'whisk together', ['oil', 'lemon', 'pepper']],
  ['toss', 'toss to coat', ['dress', 'tuna', 'chickpeas', 'cucumber', 'tomatoes', 'onion']],
  ['finish', 'fold through', ['toss', 'feta', 'parsley']],
  ['warm', 'warm and cut into wedges', ['pita']],
  ['serve', 'serve together', ['finish', 'warm']]
]),

make('soup', 'Turkey and lentil soup', {
  blurb: 'The Sunday batch. Four bowls of lentils and lean turkey; one for the week and three for the freezer.',
  servings: 4, noun: 'bowls', prep: 15, cook: 50,
  tags: ['lunch', 'high protein', 'meal plan', 'batch', 'freezes well', 'turkey'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 589 kcal, 46 g protein, 67 g carbs, 16 g fat, 13 g fiber.\nKeeps 4 days in the fridge or 3 months frozen. It thickens as it sits; loosen with a little water when reheating.'
}, [
  ['oil', '1 tbsp olive oil'],
  ['onion', '1 onion, diced'],
  ['carrots', '2 carrots, diced'],
  ['celery', '2 stalks celery, diced'],
  ['turkey', '500 g lean ground turkey (93%)'],
  ['garlic', '3 cloves garlic, minced'],
  ['cumin', '1 tsp ground cumin'],
  ['paprika', '1 tsp smoked paprika'],
  ['lentils', '1 cup (200 g) dried brown or green lentils, rinsed'],
  ['tomatoes', '1 can (400 g) diced tomatoes'],
  ['broth', '5 cups (1.2 L) low sodium chicken broth'],
  ['bay', '1 bay leaf'],
  ['salt', '1 tsp salt'],
  ['spinach', '3 cups (100 g) baby spinach'],
  ['bread', '4 slices whole grain bread, to serve']
], [
  ['soften', 'soften over medium heat, about 8 minutes', ['oil', 'onion', 'carrots', 'celery']],
  ['brown', 'add and brown, breaking it up, about 6 minutes', ['soften', 'turkey', 'garlic']],
  ['bloom', 'stir in and cook 1 minute', ['brown', 'cumin', 'paprika']],
  ['simmer', 'add and simmer until the lentils are tender, 30 to 35 minutes', ['bloom', 'lentils', 'tomatoes', 'broth', 'bay', 'salt']],
  ['wilt', 'stir in off the heat until wilted', ['simmer', 'spinach']],
  ['serve', 'serve each bowl with a slice', ['wilt', 'bread']]
]),

make('wrap', 'Grilled chicken wrap with yogurt caesar dressing', {
  blurb: 'A caesar wrap where the dressing is Greek yogurt and parmesan. An apple on the side.',
  servings: 1, prep: 10, cook: 12,
  tags: ['lunch', 'high protein', 'meal plan', 'chicken'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 613 kcal, 47 g protein, 68 g carbs, 19 g fat, 11 g fiber.'
}, [
  ['chicken', '120 g chicken breast'],
  ['oil', '1 tsp olive oil'],
  ['salt', '1/4 tsp salt'],
  ['pepper', '1/4 tsp black pepper'],
  ['yogurt', '1/4 cup (60 g) nonfat Greek yogurt'],
  ['dijon', '1 tsp Dijon mustard'],
  ['lemon', '1 tsp lemon juice'],
  ['garlic', '1 small clove garlic, grated'],
  ['parmesan', '2 tbsp (15 g) parmesan, grated'],
  ['tortilla', '1 large (10 inch) whole wheat tortilla'],
  ['romaine', '2 cups (60 g) romaine, shredded'],
  ['tomato', '1/2 tomato, diced'],
  ['apple', '1 apple, to serve']
], [
  ['grill', 'cook over medium-high heat 5 to 6 minutes a side, rest, slice', ['chicken', 'oil', 'salt', 'pepper']],
  ['dressing', 'stir together', ['yogurt', 'dijon', 'lemon', 'garlic', 'parmesan']],
  ['fill', 'fill and roll tightly', ['tortilla', 'grill', 'dressing', 'romaine', 'tomato']],
  ['serve', 'serve with', ['fill', 'apple']]
])
/* ---- dinners ---- */
,

make('sheetpan', 'Sheet-pan chicken with sweet potato and broccoli', {
  blurb: 'One pan, one oven. The sweet potato goes in first because it needs the longest.',
  servings: 1, prep: 10, cook: 35,
  tags: ['dinner', 'high protein', 'meal plan', 'chicken', 'one pan'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 583 kcal, 45 g protein, 48 g carbs, 25 g fat, 11 g fiber.'
}, [
  ['sweetpotato', '1 small (150 g) sweet potato, cut into 2 cm cubes'],
  ['oil1', '1 tbsp olive oil'],
  ['salt', '1/2 tsp salt'],
  ['chicken', '160 g chicken breast'],
  ['oil2', '1 tsp olive oil'],
  ['garlic', '2 cloves garlic, minced'],
  ['paprika', '1 tsp smoked paprika'],
  ['pepper', '1/4 tsp black pepper'],
  ['broccoli', '2 cups (200 g) broccoli florets'],
  ['lemon', '1/2 lemon']
], [
  ['roast1', 'toss and roast at 220C (425F) for 15 minutes', ['sweetpotato', 'oil1', 'salt']],
  ['season', 'rub all over', ['chicken', 'oil2', 'garlic', 'paprika', 'pepper']],
  ['roast2', 'add to the pan and roast until the chicken reaches 74C (165F) inside, 18 to 20 minutes more', ['roast1', 'season', 'broccoli']],
  ['finish', 'squeeze over', ['roast2', 'lemon']]
]),

make('salmon', 'Garlic salmon with asparagus and quinoa', {
  blurb: 'Salmon carries most of the day\'s fat, so the rest of the plate is kept lean.',
  servings: 1, prep: 10, cook: 20,
  tags: ['dinner', 'high protein', 'meal plan', 'fish'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 561 kcal, 41 g protein, 38 g carbs, 27 g fat, 8 g fiber.'
}, [
  ['quinoa', '1/4 cup (40 g) quinoa, rinsed'],
  ['water', '1/2 cup (120 ml) water'],
  ['salmon', '150 g salmon fillet'],
  ['garlic', '2 cloves garlic, minced'],
  ['salt', '1/4 tsp salt'],
  ['pepper', '1/4 tsp black pepper'],
  ['asparagus', '1 bunch (200 g) asparagus, trimmed'],
  ['oil', '1 tsp olive oil'],
  ['lemon', '1/2 lemon'],
  ['dill', '1 tbsp fresh dill, chopped']
], [
  ['simmer', 'simmer covered until the water is gone, about 15 minutes', ['quinoa', 'water']],
  ['season', 'rub over', ['salmon', 'garlic', 'salt', 'pepper']],
  ['roast', 'roast together at 200C (400F) until the salmon flakes, 12 to 14 minutes', ['season', 'asparagus', 'oil']],
  ['finish', 'squeeze and scatter over', ['roast', 'lemon', 'dill']],
  ['serve', 'serve alongside', ['finish', 'simmer']]
]),

make('chili', 'Lean beef and bean chili', {
  blurb: 'Extra lean beef and two kinds of beans. Four bowls: dinner tonight, two lunches later in the week, one frozen.',
  servings: 4, noun: 'bowls', prep: 15, cook: 55,
  tags: ['dinner', 'high protein', 'meal plan', 'batch', 'freezes well', 'beef'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 475 kcal, 45 g protein, 36 g carbs, 16 g fat, 11 g fiber.\nThe yogurt stands in for sour cream. Keeps 4 days in the fridge or 3 months frozen.'
}, [
  ['oil', '1 tsp olive oil'],
  ['onion', '1 onion, diced'],
  ['bell', '1 bell pepper, diced'],
  ['garlic', '3 cloves garlic, minced'],
  ['beef', '500 g extra lean ground beef (93%)'],
  ['chilipowder', '2 tbsp chili powder'],
  ['cumin', '1 tbsp ground cumin'],
  ['paste', '2 tbsp tomato paste'],
  ['tomatoes', '1 can (400 g) diced tomatoes'],
  ['kidney', '1 can (400 g) kidney beans, drained'],
  ['black', '1 can (400 g) black beans, drained'],
  ['broth', '1 cup (250 ml) low sodium beef broth'],
  ['salt', '1 tsp salt'],
  ['yogurt', '3/4 cup (200 g) nonfat Greek yogurt, to serve'],
  ['cheddar', '1/2 cup (60 g) cheddar, grated, to serve']
], [
  ['soften', 'soften over medium heat, about 8 minutes', ['oil', 'onion', 'bell', 'garlic']],
  ['brown', 'add and brown hard, breaking it up, until no liquid is left', ['soften', 'beef']],
  ['bloom', 'stir in and cook 1 minute', ['brown', 'chilipowder', 'cumin', 'paste']],
  ['simmer', 'add and simmer uncovered 40 minutes, stirring now and then', ['bloom', 'tomatoes', 'kidney', 'black', 'broth', 'salt']],
  ['serve', 'top each bowl', ['simmer', 'yogurt', 'cheddar']]
]),

make('meatballs', 'Turkey meatballs with chickpea pasta and zucchini', {
  blurb: 'Baked turkey meatballs in marinara over chickpea pasta, which carries twice the protein of wheat pasta.',
  servings: 4, prep: 20, cook: 30,
  tags: ['dinner', 'high protein', 'meal plan', 'batch', 'turkey', 'pasta'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 607 kcal, 50 g protein, 61 g carbs, 22 g fat, 11 g fiber.\nThe meatballs in sauce keep 4 days and freeze well; cook the pasta fresh for leftovers.'
}, [
  ['turkey', '500 g lean ground turkey (93%)'],
  ['egg', '1 large egg'],
  ['oats', '1/2 cup (40 g) rolled oats'],
  ['parmesan', '3 tbsp (20 g) parmesan, grated'],
  ['garlic', '2 cloves garlic, minced'],
  ['parsley', '1 handful parsley, chopped'],
  ['oregano', '1 tsp dried oregano'],
  ['salt', '1 tsp salt'],
  ['pepper', '1/2 tsp black pepper'],
  ['marinara', '2 cups (500 g) marinara sauce'],
  ['pasta', '280 g chickpea pasta'],
  ['zucchini', '3 zucchini, sliced'],
  ['oil', '1-1/2 tsp olive oil']
], [
  ['mix', 'mix gently and roll into 16 meatballs', ['turkey', 'egg', 'oats', 'parmesan', 'garlic', 'parsley', 'oregano', 'salt', 'pepper']],
  ['bake', 'bake on a lined tray at 200C (400F) for 18 minutes', ['mix']],
  ['simmer', 'simmer together 10 minutes', ['bake', 'marinara']],
  ['boil', 'boil until just tender, about 8 minutes, and drain', ['pasta']],
  ['saute', 'saute over high heat until browned, about 6 minutes', ['zucchini', 'oil']],
  ['serve', 'serve the meatballs and sauce over the pasta, zucchini alongside', ['simmer', 'boil', 'saute']]
]),

make('stirfry', 'Shrimp and vegetable stir-fry with brown rice', {
  blurb: 'Start the rice first; everything else takes ten minutes once the pan is hot.',
  servings: 1, prep: 15, cook: 40,
  tags: ['dinner', 'high protein', 'meal plan', 'fish', 'quick'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 595 kcal, 47 g protein, 59 g carbs, 20 g fat, 11 g fiber.'
}, [
  ['rice', '1/4 cup (40 g) brown rice'],
  ['water', '1/2 cup (120 ml) water'],
  ['soy', '2 tbsp low sodium soy sauce'],
  ['cornstarch', '1 tsp cornstarch'],
  ['chili', '1/4 tsp chili flakes'],
  ['sesame', '1 tbsp toasted sesame oil'],
  ['garlic', '2 cloves garlic, minced'],
  ['ginger', '1 tsp grated ginger'],
  ['broccoli', '1 cup (100 g) broccoli florets'],
  ['bell', '1 bell pepper, sliced'],
  ['mushrooms', '1 cup (80 g) mushrooms, sliced'],
  ['bokchoy', '1 head (100 g) bok choy, chopped'],
  ['edamame', '1/3 cup (50 g) frozen shelled edamame'],
  ['shrimp', '140 g raw shrimp, peeled']
], [
  ['simmer', 'simmer covered until tender, about 35 minutes', ['rice', 'water']],
  ['sauce', 'stir together', ['soy', 'cornstarch', 'chili']],
  ['veg', 'stir-fry over high heat 3 minutes', ['sesame', 'garlic', 'ginger', 'broccoli', 'bell', 'mushrooms']],
  ['add', 'add and stir-fry until the shrimp turn pink, about 3 minutes', ['veg', 'bokchoy', 'edamame', 'shrimp']],
  ['glaze', 'pour in and toss until it thickens, about 1 minute', ['add', 'sauce']],
  ['serve', 'serve over', ['glaze', 'simmer']]
]),

make('cod', 'Baked cod with roasted potatoes and green beans', {
  blurb: 'Cod is the leanest protein in the plan, so it gets a little butter.',
  servings: 1, prep: 10, cook: 35,
  tags: ['dinner', 'high protein', 'meal plan', 'fish', 'one pan'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 564 kcal, 45 g protein, 62 g carbs, 16 g fat, 11 g fiber.'
}, [
  ['potatoes', '280 g baby potatoes, halved'],
  ['oil1', '1 tsp olive oil'],
  ['salt', '1/2 tsp salt'],
  ['cod', '200 g cod fillet'],
  ['butter', '1 tsp butter, softened'],
  ['garlic', '1 clove garlic, minced'],
  ['paprika', '1/2 tsp paprika'],
  ['pepper', '1/4 tsp black pepper'],
  ['beans', '1-1/2 cups (150 g) green beans, trimmed'],
  ['oil2', '1 tsp olive oil'],
  ['lemon', '1/2 lemon'],
  ['parsley', '1 tbsp parsley, chopped']
], [
  ['roast1', 'toss and roast cut side down at 220C (425F) for 20 minutes', ['potatoes', 'oil1', 'salt']],
  ['season', 'rub over', ['cod', 'butter', 'garlic', 'paprika', 'pepper']],
  ['roast2', 'add to the pan and roast until the cod flakes, 12 to 14 minutes', ['roast1', 'season', 'beans', 'oil2']],
  ['finish', 'squeeze and scatter over', ['roast2', 'lemon', 'parsley']]
]),

make('curry', 'Chicken and chickpea curry with brown rice', {
  blurb: 'Light coconut milk keeps the fat in range without losing the curry. Four plates; freeze what you do not eat.',
  servings: 4, noun: 'plates', prep: 15, cook: 45,
  tags: ['dinner', 'high protein', 'meal plan', 'batch', 'freezes well', 'chicken'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 595 kcal, 46 g protein, 62 g carbs, 18 g fat, 9 g fiber.\nKeeps 4 days in the fridge. Freeze the curry without the rice.'
}, [
  ['rice', '1 cup (180 g) brown rice'],
  ['water', '2 cups (480 ml) water'],
  ['oil', '1 tbsp olive oil'],
  ['onion', '1 onion, diced'],
  ['garlic', '3 cloves garlic, minced'],
  ['ginger', '1 tbsp grated ginger'],
  ['curry', '2 tbsp curry powder'],
  ['chicken', '600 g chicken breast, cut into chunks'],
  ['coconut', '1 can (400 ml) light coconut milk'],
  ['tomatoes', '1 can (400 g) diced tomatoes'],
  ['chickpeas', '1 can (400 g) chickpeas, drained'],
  ['cauliflower', '2 cups (200 g) cauliflower florets'],
  ['salt', '1 tsp salt'],
  ['spinach', '3 cups (100 g) baby spinach']
], [
  ['simmer', 'simmer covered until tender, about 35 minutes', ['rice', 'water']],
  ['soften', 'soften over medium heat, about 6 minutes', ['oil', 'onion', 'garlic', 'ginger']],
  ['bloom', 'stir in and cook 1 minute', ['soften', 'curry']],
  ['add', 'add and stir until no longer pink outside, about 4 minutes', ['bloom', 'chicken']],
  ['cook', 'add and simmer until the chicken is cooked through and the cauliflower tender, about 15 minutes', ['add', 'coconut', 'tomatoes', 'chickpeas', 'cauliflower', 'salt']],
  ['wilt', 'stir in until wilted', ['cook', 'spinach']],
  ['serve', 'serve over', ['wilt', 'simmer']]
])
/* ---- snacks ---- */
,

make('shake', 'Banana peanut butter protein shake', {
  blurb: 'The after-training snack. Whey, milk and a banana: protein plus the carbs that belong around a workout.',
  servings: 1, prep: 3, cook: 0,
  tags: ['snack', 'high protein', 'meal plan', 'no cook', 'quick'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 404 kcal, 38 g protein, 43 g carbs, 11 g fat, 4 g fiber.'
}, [
  ['whey', '1 scoop (30 g) vanilla whey protein'],
  ['milk', '1 cup (240 ml) 1% milk'],
  ['banana', '1 banana'],
  ['pb', '1 tbsp (15 g) natural peanut butter'],
  ['ice', '1 handful ice']
], [
  ['blend', 'blend until smooth', ['whey', 'milk', 'banana', 'pb', 'ice']]
]),

make('yogurtwalnut', 'Greek yogurt with walnuts, chia and berries', {
  blurb: 'Chia stirred in and left five minutes turns the yogurt thick and the snack filling.',
  servings: 1, prep: 5, cook: 0,
  tags: ['snack', 'high protein', 'meal plan', 'no cook', 'quick'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 316 kcal, 25 g protein, 31 g carbs, 12 g fat, 8 g fiber.'
}, [
  ['yogurt', '3/4 cup (200 g) nonfat Greek yogurt'],
  ['chia', '2 tsp (10 g) chia seeds'],
  ['walnuts', '1-1/2 tbsp (12 g) walnuts, chopped'],
  ['honey', '1 tsp honey'],
  ['berries', '3/4 cup (100 g) frozen mixed berries, thawed']
], [
  ['stir', 'stir in and leave 5 minutes to thicken', ['yogurt', 'chia']],
  ['top', 'top to serve', ['stir', 'walnuts', 'honey', 'berries']]
]),

make('cottageberries', 'Cottage cheese with berries and cinnamon', {
  blurb: 'Cottage cheese is mostly casein, which digests slowly; a good afternoon snack.',
  servings: 1, prep: 2, cook: 0,
  tags: ['snack', 'high protein', 'meal plan', 'no cook', 'quick'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 176 kcal, 18 g protein, 18 g carbs, 4 g fat, 4 g fiber.'
}, [
  ['cottage', '2/3 cup (150 g) low-fat cottage cheese'],
  ['berries', '3/4 cup (100 g) frozen mixed berries, thawed'],
  ['cinnamon', '1/4 tsp cinnamon']
], [
  ['top', 'top to serve', ['cottage', 'berries', 'cinnamon']]
]),

make('eggshummus', 'Hard-boiled eggs with hummus and vegetables', {
  blurb: 'Boil the eggs for the week on Sunday and this is a two minute snack.',
  servings: 1, prep: 5, cook: 10,
  tags: ['snack', 'high protein', 'meal plan', 'quick'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 251 kcal, 17 g protein, 16 g carbs, 14 g fat, 5 g fiber.'
}, [
  ['eggs', '2 large eggs'],
  ['hummus', '3 tbsp (40 g) hummus'],
  ['carrot', '1 carrot, cut into sticks'],
  ['cucumber', '1/2 cucumber, cut into sticks']
], [
  ['boil', 'boil 10 minutes, cool in cold water, peel', ['eggs']],
  ['plate', 'plate together', ['boil', 'hummus', 'carrot', 'cucumber']]
]),

make('edamame', 'Edamame and string cheese', {
  blurb: 'Frozen edamame straight from the microwave. The simplest high fiber protein snack there is.',
  servings: 1, prep: 1, cook: 3,
  tags: ['snack', 'high protein', 'meal plan', 'quick', 'vegetarian'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 205 kcal, 20 g protein, 12 g carbs, 9 g fat, 6 g fiber.'
}, [
  ['edamame', '3/4 cup (120 g) frozen shelled edamame'],
  ['salt', '1 pinch flaky salt'],
  ['cheese', '1 light string cheese']
], [
  ['steam', 'steam or microwave until hot, about 3 minutes', ['edamame']],
  ['season', 'toss with', ['steam', 'salt']],
  ['serve', 'serve with', ['season', 'cheese']]
]),

make('rollup', 'Turkey and mozzarella roll-up', {
  blurb: 'Deli turkey and cheese rolled in a tortilla. Travels well.',
  servings: 1, prep: 3, cook: 0,
  tags: ['snack', 'high protein', 'meal plan', 'no cook', 'quick'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 306 kcal, 27 g protein, 28 g carbs, 10 g fat, 4 g fiber.'
}, [
  ['tortilla', '1 whole wheat tortilla (8 inch)'],
  ['mustard', '1 tsp mustard'],
  ['turkey', '80 g sliced deli turkey breast'],
  ['mozz', '1/4 cup (30 g) part-skim mozzarella, shredded'],
  ['spinach', '1 handful (30 g) baby spinach']
], [
  ['spread', 'spread over', ['tortilla', 'mustard']],
  ['layer', 'layer on', ['spread', 'turkey', 'mozz', 'spinach']],
  ['roll', 'roll tightly and cut in half', ['layer']]
]),

make('pudding', 'Chocolate peanut butter yogurt pudding', {
  blurb: 'Tastes like dessert; counts as a protein snack.',
  servings: 1, prep: 3, cook: 0,
  tags: ['snack', 'high protein', 'meal plan', 'no cook', 'quick', 'dessert'],
  source: 'Metabolism support meal plan',
  notes: 'Per serving: 250 kcal, 26 g protein, 22 g carbs, 10 g fat, 4 g fiber.'
}, [
  ['yogurt', '3/4 cup (200 g) nonfat Greek yogurt'],
  ['cocoa', '1-1/2 tbsp (10 g) unsweetened cocoa powder'],
  ['pb', '1 tbsp (15 g) natural peanut butter'],
  ['honey', '1 tsp honey'],
  ['salt', '1 pinch salt']
], [
  ['stir', 'stir until smooth and chill 10 minutes', ['yogurt', 'cocoa', 'pb', 'honey', 'salt']]
])

];

global.RLMealPlan = RECIPES;
})(window);
