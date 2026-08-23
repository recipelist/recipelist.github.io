/* samples.js - the demo set.
   --------------------------
   Eight recipes that exist only to show the app working: they are loaded on
   request from Settings and can be cleared again. Their ids are fixed and
   their `updated` stamps are frozen, which is what lets Settings remove only
   the ones you never touched. Edit a demo recipe and it becomes yours, and
   Clear demo will leave it alone.

   Every one of them is fully linked: each step names what it consumes, so
   the grid view has something real to draw. The first is the sour cream
   coffee cake that the tabular format is usually shown with. */
(function (global) {
'use strict';

var STAMP = '2026-01-01T00:00:00.000Z';

/* ings: [key, "raw line"]   steps: [key, "text", [input keys]] */
function make(id, title, meta, ings, steps) {
  var r = {
    id: 'demo_' + id, schema: 1, title: title,
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
    var iid = 'demo_' + id + '_i_' + pair[0];
    key[pair[0]] = iid;
    var p = RLUnits.parseIngredient(pair[1]);
    p.id = iid;
    r.ingredients.push(p);
  });
  steps.forEach(function (t) { key[t[0]] = 'demo_' + id + '_s_' + t[0]; });
  steps.forEach(function (t) {
    r.steps.push({
      id: key[t[0]], text: t[1],
      inputs: (t[2] || []).map(function (k) { return key[k]; }).filter(Boolean)
    });
  });
  return r;
}

var RECIPES = [

make('coffeecake', 'Sour cream pecan coffee cake', {
  blurb: 'The cake the ingredients-and-operations grid is usually demonstrated with, and a good one on its own terms.',
  servings: 12, noun: 'slices', prep: 20, cook: 45,
  tags: ['baking', 'cake', 'dessert'],
  notes: 'Bake at 350F in a greased tube pan until a skewer comes out clean, about 45 minutes.'
}, [
  ['butter', '1 cup (225 g) butter, softened'],
  ['sugar', '1-1/2 cup (300 g) granulated sugar'],
  ['sourcream', '1 cup (230 g) sour cream'],
  ['eggs', '2 large eggs'],
  ['vanilla', '1 Tbs. (15 mL) vanilla extract'],
  ['flour', '2 cups (125 g) sifted all-purpose flour'],
  ['salt', '1/4 tsp. (1.5 g) salt'],
  ['bp', '1 Tbs. (14 g) baking powder'],
  ['pecans', '1/4 cup (25 g) chopped pecans']
], [
  ['cream', 'cream', ['butter', 'sugar']],
  ['beat', 'beat', ['cream', 'sourcream']],
  ['oneat', 'mix in 1 at a time', ['beat', 'eggs', 'vanilla']],
  ['whisk', 'whisk to combine', ['flour', 'salt', 'bp']],
  ['toast', 'toast', ['pecans']],
  ['crumbs', 'process to crumbs', ['toast']],
  ['mix', 'mix', ['oneat', 'whisk']],
  ['fold', 'fold in', ['mix', 'crumbs']]
]),

make('cookies', 'Brown butter chocolate chip cookies', {
  blurb: 'Browning the butter first is the whole trick; everything after it is an ordinary cookie.',
  servings: 24, noun: 'cookies', prep: 25, cook: 12,
  tags: ['baking', 'dessert', 'cookies'],
  notes: 'Chill the dough an hour if you have time. Bake at 375F for 10 to 12 minutes.'
}, [
  ['butter', '1 cup (225 g) unsalted butter'],
  ['brown', '1 cup (200 g) brown sugar, packed'],
  ['white', '1/2 cup (100 g) granulated sugar'],
  ['eggs', '2 large eggs'],
  ['vanilla', '2 tsp vanilla extract'],
  ['flour', '2-1/2 cups (315 g) all-purpose flour'],
  ['soda', '1 tsp baking soda'],
  ['salt', '1 tsp salt'],
  ['choc', '2 cups (340 g) chocolate chips']
], [
  ['brownit', 'brown over medium heat, then cool 10 minutes', ['butter']],
  ['creamit', 'beat until glossy', ['brownit', 'brown', 'white']],
  ['wet', 'beat in one at a time', ['creamit', 'eggs', 'vanilla']],
  ['dry', 'whisk to combine', ['flour', 'soda', 'salt']],
  ['combine', 'mix until just short of smooth', ['wet', 'dry']],
  ['fold', 'fold in', ['combine', 'choc']],
  ['bake', 'scoop and bake 10 to 12 minutes', ['fold']]
]),

make('pasta', 'Weeknight tomato and garlic pasta', {
  blurb: 'Twenty minutes, one pan and a pot. The pasta water is an ingredient, not a byproduct.',
  servings: 4, prep: 10, cook: 20,
  tags: ['dinner', 'pasta', 'quick', 'vegetarian']
}, [
  ['pasta', '400 g spaghetti'],
  ['oil', '3 tbsp olive oil'],
  ['garlic', '4 cloves garlic, thinly sliced'],
  ['chili', '1/2 tsp chili flakes'],
  ['tomatoes', '1 can (400 g) chopped tomatoes'],
  ['salt', '1 tsp salt'],
  ['basil', '1 handful basil leaves'],
  ['parmesan', '50 g parmesan, grated']
], [
  ['boil', 'boil in well salted water until just short of done, about 9 minutes, and keep a cup of the water', ['pasta']],
  ['warm', 'warm gently until the garlic is pale gold, about 3 minutes', ['oil', 'garlic', 'chili']],
  ['simmer', 'add and simmer until thickened, about 12 minutes', ['warm', 'tomatoes', 'salt']],
  ['toss', 'toss together with a splash of the pasta water until it clings', ['simmer', 'boil']],
  ['finish', 'take off the heat and stir through', ['toss', 'basil', 'parmesan']]
]),

make('chicken', 'Roast chicken with lemon and thyme', {
  blurb: 'Dry the bird, salt it early, and let it rest. Nothing else about this is difficult.',
  servings: 4, prep: 15, cook: 80,
  tags: ['dinner', 'roast', 'chicken'],
  notes: 'Salting the day before is better than salting an hour before, and much better than not salting.'
}, [
  ['chicken', '1 whole chicken, about 1.8 kg'],
  ['salt', '2 tsp salt'],
  ['pepper', '1 tsp black pepper'],
  ['lemon', '1 lemon, halved'],
  ['thyme', '6 sprigs thyme'],
  ['butter', '2 tbsp butter, softened'],
  ['potatoes', '800 g potatoes, halved'],
  ['oil', '2 tbsp olive oil']
], [
  ['dry', 'pat dry inside and out', ['chicken']],
  ['season', 'rub all over and leave uncovered in the fridge at least 1 hour', ['dry', 'salt', 'pepper']],
  ['stuff', 'put in the cavity', ['season', 'lemon', 'thyme']],
  ['butterit', 'smear over the breast', ['stuff', 'butter']],
  ['toss', 'toss to coat', ['potatoes', 'oil']],
  ['roast', 'roast at 200C for 70 to 80 minutes, until the juices run clear', ['butterit', 'toss']],
  ['rest', 'rest 15 minutes before carving', ['roast']]
]),

make('chili', 'Everyday beef chili', {
  blurb: 'Better on the second day, which makes it the most useful thing to cook on a Sunday.',
  servings: 6, prep: 20, cook: 90,
  tags: ['dinner', 'batch', 'beef', 'freezes well']
}, [
  ['oil', '2 tbsp oil'],
  ['onion', '2 onions, diced'],
  ['garlic', '4 cloves garlic, minced'],
  ['beef', '900 g ground beef'],
  ['chilipowder', '3 tbsp chili powder'],
  ['cumin', '1 tbsp cumin'],
  ['paste', '2 tbsp tomato paste'],
  ['tomatoes', '1 can (800 g) chopped tomatoes'],
  ['beans', '2 cans (400 g) kidney beans, drained'],
  ['stock', '250 ml beef stock'],
  ['salt', '2 tsp salt']
], [
  ['soften', 'soften over medium heat until translucent, about 8 minutes', ['oil', 'onion', 'garlic']],
  ['brown', 'brown hard, breaking it up, until no liquid is left in the pan', ['soften', 'beef']],
  ['bloom', 'stir in and cook 1 minute, until it smells like chili', ['brown', 'chilipowder', 'cumin', 'paste']],
  ['simmer', 'add and simmer uncovered 60 to 90 minutes, stirring now and then', ['bloom', 'tomatoes', 'beans', 'stock', 'salt']]
]),

make('pancakes', 'Buttermilk pancakes', {
  blurb: 'A lumpy batter makes a tender pancake. Stop mixing sooner than feels right.',
  servings: 4, noun: 'servings', prep: 10, cook: 15,
  tags: ['breakfast', 'quick', 'baking']
}, [
  ['flour', '2 cups (250 g) all-purpose flour'],
  ['sugar', '2 tbsp sugar'],
  ['bp', '2 tsp baking powder'],
  ['soda', '1/2 tsp baking soda'],
  ['salt', '1 tsp salt'],
  ['buttermilk', '2 cups (475 ml) buttermilk'],
  ['eggs', '2 large eggs'],
  ['butter', '3 tbsp butter, melted']
], [
  ['dry', 'whisk to combine', ['flour', 'sugar', 'bp', 'soda', 'salt']],
  ['wet', 'whisk together', ['buttermilk', 'eggs', 'butter']],
  ['fold', 'fold together until barely combined, then rest 10 minutes', ['dry', 'wet']],
  ['cook', 'cook on a medium griddle, 2 minutes a side', ['fold']]
]),

make('oats', 'Overnight oats', {
  blurb: 'Assembled in a jar the night before. The ratio is the recipe.',
  servings: 1, prep: 5, cook: 0,
  tags: ['breakfast', 'no cook', 'quick']
}, [
  ['oats', '1/2 cup (45 g) rolled oats'],
  ['milk', '1/2 cup (120 ml) milk'],
  ['yogurt', '1/4 cup (60 g) yogurt'],
  ['chia', '1 tsp chia seeds'],
  ['honey', '1 tsp honey'],
  ['salt', '1 pinch salt'],
  ['berries', '1 handful berries']
], [
  ['stir', 'stir together in a jar', ['oats', 'milk', 'yogurt', 'chia', 'honey', 'salt']],
  ['chill', 'cover and chill at least 4 hours', ['stir']],
  ['top', 'top to serve', ['chill', 'berries']]
]),

make('guac', 'Guacamole', {
  blurb: 'Salt the onion and lime together first and the whole thing tastes seasoned rather than salty.',
  servings: 4, prep: 10, cook: 0,
  tags: ['snack', 'no cook', 'quick', 'vegetarian']
}, [
  ['onion', '1/2 small red onion, finely diced'],
  ['lime', '2 limes, juiced'],
  ['salt', '1 tsp salt'],
  ['chile', '1 jalapeno, minced'],
  ['avocado', '3 ripe avocados'],
  ['cilantro', '1 handful cilantro, chopped']
], [
  ['macerate', 'stir together and leave 5 minutes', ['onion', 'lime', 'salt']],
  ['add', 'stir in', ['macerate', 'chile']],
  ['mash', 'add and mash to a coarse texture', ['add', 'avocado']],
  ['finish', 'fold through just before serving', ['mash', 'cilantro']]
])

];

global.RLSamples = RECIPES;
})(window);
