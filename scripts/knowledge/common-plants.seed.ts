/**
 * Hand-maintained seed of cultivated-plant names for the offline common-plants
 * index (see docs/superpowers/specs/2026-06-13-common-name-species-autocomplete-design.md).
 * Names may be common or scientific; the generator resolves each via GBIF. This
 * is the only hand-edited artifact and is meant to grow over time.
 */
export const COMMON_PLANT_SEED: readonly string[] = [
  // Herbs
  'basil', 'holy basil', 'mint', 'peppermint', 'spearmint', 'rosemary', 'thyme',
  'oregano', 'marjoram', 'parsley', 'cilantro', 'sage', 'dill', 'chives', 'tarragon',
  'lemon balm', 'lemongrass', 'fennel', 'lavender',
  // Vegetables & fruit
  'tomato', 'chili pepper', 'bell pepper', 'cucumber', 'lettuce', 'spinach', 'kale',
  'arugula', 'strawberry', 'zucchini', 'eggplant', 'radish', 'carrot',
  // Foliage houseplants
  'snake plant', 'golden pothos', 'monstera', 'peace lily', 'spider plant', 'ZZ plant',
  'fiddle leaf fig', 'rubber plant', 'jade plant', 'boston fern', 'english ivy',
  'heartleaf philodendron', 'chinese evergreen', 'dumb cane', 'croton', 'dragon tree',
  'weeping fig', 'umbrella tree', 'swiss cheese plant', 'arrowhead plant', 'wandering jew',
  // Palms & tropicals
  'areca palm', 'parlour palm', 'kentia palm', 'bird of paradise', 'banana plant',
  // Prayer/foliage colour
  'calathea', 'prayer plant', 'nerve plant',
  // Succulents & cacti
  'aloe vera', 'echeveria', 'haworthia', 'christmas cactus', 'string of pearls',
  // Flowering
  'orchid', 'moth orchid', 'african violet', 'begonia', 'geranium', 'cyclamen',
  'anthurium', 'kalanchoe', 'hibiscus', 'jasmine', 'poinsettia',
];
