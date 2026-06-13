/**
 * Hand-maintained seed for the offline common-plants index (see
 * docs/superpowers/specs/2026-06-13-common-name-species-autocomplete-design.md).
 *
 * Each entry pairs the everyday common name novices type with the canonical
 * cultivated species. The scientific name is what the generator resolves against
 * the GBIF backbone (the /species/match endpoint is authoritative for scientific
 * names but returns NONE — or an unrelated species — for ambiguous common names
 * like "tomato" or "cilantro", so the curator pins the right species here). The
 * common name is guaranteed into the generated index because GBIF's English
 * vernaculars often omit the everyday word (e.g. it lists "Garden Tomato", not
 * "tomato"). This is the only hand-edited artifact and is meant to grow.
 */
export interface CommonPlantSeed {
  /** Everyday name a novice types; always kept searchable in the index. */
  common: string;
  /** Canonical cultivated species, resolved authoritatively via GBIF match. */
  scientific: string;
}

export const COMMON_PLANT_SEED: readonly CommonPlantSeed[] = [
  // Herbs
  { common: 'basil', scientific: 'Ocimum basilicum' },
  { common: 'holy basil', scientific: 'Ocimum tenuiflorum' },
  { common: 'mint', scientific: 'Mentha spicata' },
  { common: 'peppermint', scientific: 'Mentha x piperita' },
  { common: 'rosemary', scientific: 'Salvia rosmarinus' },
  { common: 'thyme', scientific: 'Thymus vulgaris' },
  { common: 'oregano', scientific: 'Origanum vulgare' },
  { common: 'marjoram', scientific: 'Origanum majorana' },
  { common: 'parsley', scientific: 'Petroselinum crispum' },
  { common: 'cilantro', scientific: 'Coriandrum sativum' },
  { common: 'sage', scientific: 'Salvia officinalis' },
  { common: 'dill', scientific: 'Anethum graveolens' },
  { common: 'chives', scientific: 'Allium schoenoprasum' },
  { common: 'tarragon', scientific: 'Artemisia dracunculus' },
  { common: 'lemon balm', scientific: 'Melissa officinalis' },
  { common: 'lemongrass', scientific: 'Cymbopogon citratus' },
  { common: 'fennel', scientific: 'Foeniculum vulgare' },
  { common: 'lavender', scientific: 'Lavandula angustifolia' },
  // Vegetables & fruit
  { common: 'tomato', scientific: 'Solanum lycopersicum' },
  { common: 'chili pepper', scientific: 'Capsicum frutescens' },
  { common: 'bell pepper', scientific: 'Capsicum annuum' },
  { common: 'cucumber', scientific: 'Cucumis sativus' },
  { common: 'lettuce', scientific: 'Lactuca sativa' },
  { common: 'spinach', scientific: 'Spinacia oleracea' },
  { common: 'kale', scientific: 'Brassica oleracea' },
  { common: 'arugula', scientific: 'Eruca vesicaria' },
  { common: 'strawberry', scientific: 'Fragaria x ananassa' },
  { common: 'zucchini', scientific: 'Cucurbita pepo' },
  { common: 'eggplant', scientific: 'Solanum melongena' },
  { common: 'radish', scientific: 'Raphanus sativus' },
  { common: 'carrot', scientific: 'Daucus carota' },
  // Foliage houseplants
  { common: 'snake plant', scientific: 'Dracaena trifasciata' },
  { common: 'golden pothos', scientific: 'Epipremnum aureum' },
  { common: 'monstera', scientific: 'Monstera deliciosa' },
  { common: 'swiss cheese plant', scientific: 'Monstera adansonii' },
  { common: 'peace lily', scientific: 'Spathiphyllum wallisii' },
  { common: 'spider plant', scientific: 'Chlorophytum comosum' },
  { common: 'ZZ plant', scientific: 'Zamioculcas zamiifolia' },
  { common: 'fiddle leaf fig', scientific: 'Ficus lyrata' },
  { common: 'rubber plant', scientific: 'Ficus elastica' },
  { common: 'jade plant', scientific: 'Crassula ovata' },
  { common: 'boston fern', scientific: 'Nephrolepis exaltata' },
  { common: 'english ivy', scientific: 'Hedera helix' },
  { common: 'heartleaf philodendron', scientific: 'Philodendron hederaceum' },
  { common: 'chinese evergreen', scientific: 'Aglaonema commutatum' },
  { common: 'dumb cane', scientific: 'Dieffenbachia seguine' },
  { common: 'croton', scientific: 'Codiaeum variegatum' },
  { common: 'dragon tree', scientific: 'Dracaena marginata' },
  { common: 'weeping fig', scientific: 'Ficus benjamina' },
  { common: 'umbrella tree', scientific: 'Schefflera actinophylla' },
  { common: 'arrowhead plant', scientific: 'Syngonium podophyllum' },
  { common: 'wandering jew', scientific: 'Tradescantia zebrina' },
  // Palms & tropicals
  { common: 'areca palm', scientific: 'Dypsis lutescens' },
  { common: 'parlour palm', scientific: 'Chamaedorea elegans' },
  { common: 'kentia palm', scientific: 'Howea forsteriana' },
  { common: 'bird of paradise', scientific: 'Strelitzia reginae' },
  { common: 'banana plant', scientific: 'Musa acuminata' },
  // Prayer / foliage colour
  { common: 'calathea', scientific: 'Calathea makoyana' },
  { common: 'prayer plant', scientific: 'Maranta leuconeura' },
  { common: 'nerve plant', scientific: 'Fittonia albivenis' },
  // Succulents & cacti
  { common: 'aloe vera', scientific: 'Aloe vera' },
  { common: 'echeveria', scientific: 'Echeveria elegans' },
  { common: 'haworthia', scientific: 'Haworthia cooperi' },
  { common: 'christmas cactus', scientific: 'Schlumbergera truncata' },
  { common: 'string of pearls', scientific: 'Curio rowleyanus' },
  // Flowering
  { common: 'orchid', scientific: 'Phalaenopsis amabilis' },
  { common: 'moth orchid', scientific: 'Phalaenopsis aphrodite' },
  { common: 'african violet', scientific: 'Streptocarpus ionanthus' },
  { common: 'begonia', scientific: 'Begonia rex' },
  { common: 'geranium', scientific: 'Pelargonium zonale' },
  { common: 'cyclamen', scientific: 'Cyclamen persicum' },
  { common: 'anthurium', scientific: 'Anthurium andraeanum' },
  { common: 'kalanchoe', scientific: 'Kalanchoe blossfeldiana' },
  { common: 'hibiscus', scientific: 'Hibiscus rosa-sinensis' },
  { common: 'jasmine', scientific: 'Jasminum officinale' },
  { common: 'poinsettia', scientific: 'Euphorbia pulcherrima' },
];
