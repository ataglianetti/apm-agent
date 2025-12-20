/**
 * Query to Taxonomy Mapper
 *
 * Uses an LLM to parse natural language music search queries into
 * structured taxonomy filters that can be used for precise Solr queries.
 *
 * Example:
 * Input: "uptempo solo jazz piano"
 * Output: {
 *   filters: {
 *     "Tempo": ["Tempo/..."],
 *     "is_a": ["is_a/2204"],
 *     "Master Genre": ["Master Genre/1248"],
 *     "Instruments": ["Instruments/2962"]
 *   },
 *   remainingText: "",
 *   confidence: 0.95
 * }
 */

import Anthropic from '@anthropic-ai/sdk';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../apm_music.db');

// Lazy-initialize client
let client = null;
function getClient() {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return client;
}

// Cache for taxonomy data
let taxonomyCache = null;
let taxonomyCacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Load taxonomy data from SQLite and build a compact representation for LLM
 */
function loadTaxonomy() {
  const now = Date.now();
  if (taxonomyCache && (now - taxonomyCacheTime) < CACHE_TTL) {
    return taxonomyCache;
  }

  const db = new Database(DB_PATH, { readonly: true });

  try {
    // Get all facets grouped by category
    const rows = db.prepare(`
      SELECT facet_id, category_name, facet_label
      FROM facet_taxonomy
      WHERE facet_level > 0
      ORDER BY category_name, facet_label
    `).all();

    // Build category → facets map
    const categories = {};
    for (const row of rows) {
      if (!categories[row.category_name]) {
        categories[row.category_name] = [];
      }
      categories[row.category_name].push({
        id: row.facet_id,
        label: row.facet_label
      });
    }

    // Build compact representation for LLM context
    const compactTaxonomy = {};
    for (const [category, facets] of Object.entries(categories)) {
      // For each category, list facets in a compact format
      compactTaxonomy[category] = facets.map(f => `${f.id}:${f.label}`);
    }

    // Also build a reverse lookup: lowercase label → {category, id}
    const labelLookup = {};
    for (const row of rows) {
      const key = row.facet_label.toLowerCase();
      if (!labelLookup[key]) {
        labelLookup[key] = [];
      }
      labelLookup[key].push({
        category: row.category_name,
        id: row.facet_id,
        label: row.facet_label
      });
    }

    taxonomyCache = {
      categories,
      compactTaxonomy,
      labelLookup,
      categoryList: Object.keys(categories).sort()
    };
    taxonomyCacheTime = now;

    return taxonomyCache;
  } finally {
    db.close();
  }
}

/**
 * Build the system prompt for the LLM
 */
function buildSystemPrompt(taxonomy) {
  // Build a compact but complete taxonomy reference
  const categoryDescriptions = {
    'Master Genre': 'Primary music genre (rock, jazz, classical, etc.)',
    'Additional Genre': 'Secondary/sub-genres',
    'Mood': 'Emotional character (uplifting, dark, peaceful, energetic, etc.)',
    'Instruments': 'Musical instruments (piano, guitar, drums, strings, etc.)',
    'Vocals': 'Vocal characteristics (male, female, choir, spoken word, etc.)',
    'Tempo': 'Speed/tempo (slow, medium, fast, specific BPM ranges)',
    'is_a': 'Track attributes (Solo, Instrumental Only, Has Lyrics, Stems Available, Vintage Style, Trailer Track, etc.)',
    'Music For': 'Use cases (chase scene, love scene, documentary, sports, etc.)',
    'Character': 'Personality/character traits',
    'Country & Region': 'Geographic/cultural origin',
    'Time Period': 'Historical era or decade',
    'Instrumental & Vocal Groupings': 'Ensemble types (orchestra, band, solo, etc.)',
    'Musical Form': 'Structure (verse-chorus, ambient, etc.)',
    'Movement': 'Motion/energy characteristics',
    'Key': 'Musical key (C major, A minor, etc.)',
    'Language': 'Language of lyrics',
    'Lyric Subject': 'Theme of lyrics',
    'Sound Effects': 'SFX categories',
    'Track Type': 'Track format type'
  };

  // Build compact category reference with sample facets
  let categoryRef = '';
  for (const category of taxonomy.categoryList) {
    const desc = categoryDescriptions[category] || '';
    const facets = taxonomy.compactTaxonomy[category] || [];
    // Show up to 15 sample facets per category
    const samples = facets.slice(0, 15).map(f => {
      const [id, label] = f.split(':');
      return `${label} (${id})`;
    }).join(', ');
    const more = facets.length > 15 ? ` ... +${facets.length - 15} more` : '';
    categoryRef += `\n**${category}**: ${desc}\n  Examples: ${samples}${more}\n`;
  }

  return `You are a music taxonomy parser for APM Music's production music catalog.

Your task is to analyze natural language music search queries and map them to structured taxonomy filters.

## Available Categories and Facets:
${categoryRef}

## Instructions:

1. Parse the user's query and identify musical concepts
2. Map each concept to the most appropriate category and facet ID
3. For ambiguous terms, prefer the most common interpretation in music production context
4. Return ONLY valid JSON with no additional text

## Important Mappings:

- "solo" → is_a category, ID 2204 (Solo)
- "instrumental" → is_a category, ID 3373 (Instrumental Only)
- "with stems" / "stems" → is_a category, ID 3301 (Stems Available)
- "vintage" → is_a category, ID 2200 (Vintage Style)
- "trailer" → is_a category, ID 2198 (Trailer Track)
- "uptempo" / "upbeat" / "fast" → Tempo category (Fast or above)
- "downtempo" / "slow" → Tempo category (Slow ranges)

## Response Format:

Return a JSON object with:
- "filters": Object mapping category names to arrays of "Category/ID" strings
- "remainingText": Any query text that couldn't be mapped to taxonomy
- "confidence": Number 0-1 indicating mapping confidence
- "mappings": Array explaining each mapping made

Example query: "uptempo solo jazz piano"
Example response:
{
  "filters": {
    "Tempo": ["Tempo/1046"],
    "is_a": ["is_a/2204"],
    "Master Genre": ["Master Genre/1248"],
    "Instruments": ["Instruments/2962"]
  },
  "remainingText": "",
  "confidence": 0.95,
  "mappings": [
    {"term": "uptempo", "category": "Tempo", "facet": "Fast (Allegro)", "id": 1046},
    {"term": "solo", "category": "is_a", "facet": "Solo", "id": 2204},
    {"term": "jazz", "category": "Master Genre", "facet": "Jazz", "id": 1248},
    {"term": "piano", "category": "Instruments", "facet": "Piano", "id": 2962}
  ]
}`;
}

/**
 * Parse a natural language query into taxonomy filters using LLM
 *
 * @param {string} query - Natural language search query
 * @returns {object} - Structured taxonomy filters
 */
export async function parseQueryToTaxonomy(query) {
  const startTime = Date.now();

  // Load taxonomy
  const taxonomy = loadTaxonomy();

  // Build prompt
  const systemPrompt = buildSystemPrompt(taxonomy);

  // Use Haiku for speed (this is a structured extraction task)
  const model = 'claude-3-haiku-20240307';

  try {
    const response = await getClient().messages.create({
      model: model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Parse this music search query into taxonomy filters:\n\n"${query}"\n\nReturn only valid JSON.`
        }
      ]
    });

    // Extract text response
    const textContent = response.content.find(c => c.type === 'text');
    const responseText = textContent?.text || '{}';

    // Parse JSON response
    let parsed;
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
    } catch (parseError) {
      console.error('Failed to parse LLM response as JSON:', responseText);
      parsed = {
        filters: {},
        remainingText: query,
        confidence: 0,
        error: 'Failed to parse LLM response'
      };
    }

    // Validate and normalize the response
    const result = {
      query: query,
      filters: parsed.filters || {},
      remainingText: parsed.remainingText || '',
      confidence: parsed.confidence || 0,
      mappings: parsed.mappings || [],
      model: model,
      latencyMs: Date.now() - startTime
    };

    console.log(`Query "${query}" mapped to taxonomy in ${result.latencyMs}ms`);

    return result;

  } catch (error) {
    console.error('Error calling LLM for taxonomy mapping:', error);
    return {
      query: query,
      filters: {},
      remainingText: query,
      confidence: 0,
      error: error.message,
      latencyMs: Date.now() - startTime
    };
  }
}

/**
 * Build Solr filter queries from parsed taxonomy
 *
 * @param {object} taxonomyResult - Result from parseQueryToTaxonomy
 * @returns {array} - Array of Solr fq parameters
 */
export function buildSolrFilters(taxonomyResult) {
  const fqs = [];

  for (const [category, facetIds] of Object.entries(taxonomyResult.filters || {})) {
    if (facetIds && facetIds.length > 0) {
      // Build OR query for multiple facets in same category
      const orClauses = facetIds.map(id => `"${id}"`).join(' OR ');
      fqs.push(`combined_ids:(${orClauses})`);
    }
  }

  return fqs;
}

/**
 * Quick local lookup for common terms (bypass LLM for speed)
 * IDs verified against facet_taxonomy table
 */
const QUICK_LOOKUP = {
  // is_a mappings (verified against facet_taxonomy)
  // Solo / Instrumental / Vocals
  'solo': { category: 'is_a', id: 2204, label: 'Solo' },
  'solo performance': { category: 'is_a', id: 2204, label: 'Solo' },
  'instrumental': { category: 'is_a', id: 3373, label: 'Instrumental Only' },
  'instrumental only': { category: 'is_a', id: 3373, label: 'Instrumental Only' },
  'no vocals': { category: 'is_a', id: 3373, label: 'Instrumental Only' },
  'without vocals': { category: 'is_a', id: 3373, label: 'Instrumental Only' },
  'lyrics': { category: 'is_a', id: 2197, label: 'Has Lyrics' },
  'has lyrics': { category: 'is_a', id: 2197, label: 'Has Lyrics' },
  'with lyrics': { category: 'is_a', id: 2197, label: 'Has Lyrics' },
  'with vocals': { category: 'is_a', id: 2197, label: 'Has Lyrics' },
  'vocal': { category: 'is_a', id: 2197, label: 'Has Lyrics' },
  'explicit': { category: 'is_a', id: 3300, label: 'Explicit Lyrics' },
  'explicit lyrics': { category: 'is_a', id: 3300, label: 'Explicit Lyrics' },
  'profanity': { category: 'is_a', id: 3300, label: 'Explicit Lyrics' },
  'explicit content': { category: 'is_a', id: 3300, label: 'Explicit Lyrics' },

  // Stems
  'stems': { category: 'is_a', id: 3301, label: 'Stems Available' },
  'stems available': { category: 'is_a', id: 3301, label: 'Stems Available' },
  'with stems': { category: 'is_a', id: 3301, label: 'Stems Available' },
  'has stems': { category: 'is_a', id: 3301, label: 'Stems Available' },
  'no stems': { category: 'is_a', id: 3302, label: 'Stems Not Available' },
  'stems not available': { category: 'is_a', id: 3302, label: 'Stems Not Available' },
  'without stems': { category: 'is_a', id: 3302, label: 'Stems Not Available' },
  'ai stems': { category: 'is_a', id: 1072, label: 'Has AI Stems' },
  'has ai stems': { category: 'is_a', id: 1072, label: 'Has AI Stems' },

  // Style / Character
  'vintage': { category: 'is_a', id: 2200, label: 'Vintage Style' },
  'vintage style': { category: 'is_a', id: 2200, label: 'Vintage Style' },
  'vintage sound': { category: 'is_a', id: 2200, label: 'Vintage Style' },
  'retro style': { category: 'is_a', id: 2200, label: 'Vintage Style' },
  'old style': { category: 'is_a', id: 2200, label: 'Vintage Style' },
  'archival': { category: 'is_a', id: 2201, label: 'Archival Recording' },
  'archival recording': { category: 'is_a', id: 2201, label: 'Archival Recording' },
  'archive': { category: 'is_a', id: 2201, label: 'Archival Recording' },
  'historical recording': { category: 'is_a', id: 2201, label: 'Archival Recording' },

  // Special Track Types
  'trailer': { category: 'is_a', id: 2198, label: 'Trailer Track' },
  'trailer track': { category: 'is_a', id: 2198, label: 'Trailer Track' },
  'trailer music': { category: 'is_a', id: 2198, label: 'Trailer Track' },
  'for trailer': { category: 'is_a', id: 2198, label: 'Trailer Track' },
  'well known': { category: 'is_a', id: 2199, label: 'Well Known Tune' },
  'well known tune': { category: 'is_a', id: 2199, label: 'Well Known Tune' },
  'famous tune': { category: 'is_a', id: 2199, label: 'Well Known Tune' },
  'recognizable': { category: 'is_a', id: 2199, label: 'Well Known Tune' },
  'national anthem': { category: 'is_a', id: 2203, label: 'National Anthem' },
  'anthem': { category: 'is_a', id: 2203, label: 'National Anthem' },
  'country anthem': { category: 'is_a', id: 2203, label: 'National Anthem' },

  // Artist / Performance Types
  'artist driven': { category: 'is_a', id: 2196, label: 'Artist-Driven' },
  'artist-driven': { category: 'is_a', id: 2196, label: 'Artist-Driven' },
  'artist showcase': { category: 'is_a', id: 1076, label: 'Artist Showcase' },
  'showcase': { category: 'is_a', id: 1076, label: 'Artist Showcase' },
  'performer series': { category: 'is_a', id: 1077, label: 'Performer Series' },

  // Quality / Character
  'amateur': { category: 'is_a', id: 2202, label: 'Amateur / Poorly Played' },
  'poorly played': { category: 'is_a', id: 2202, label: 'Amateur / Poorly Played' },
  'rough performance': { category: 'is_a', id: 2202, label: 'Amateur / Poorly Played' },

  // Regional (for composer nationality - 'canadian' alone maps to Country & Region)
  'canadian composer': { category: 'is_a', id: 3792, label: 'Canadian Composer' },
  'by canadian composer': { category: 'is_a', id: 3792, label: 'Canadian Composer' },

  // Common instruments (verified against facet_taxonomy)
  // Keyboards
  'piano': { category: 'Instruments', id: 2962, label: 'Piano' },
  'electric piano': { category: 'Instruments', id: 2964, label: 'Piano, Electric' },
  'organ': { category: 'Instruments', id: 2956, label: 'Organ, Hammond' },
  'hammond': { category: 'Instruments', id: 2956, label: 'Organ, Hammond' },
  'harpsichord': { category: 'Instruments', id: 2950, label: 'Harpsichord' },
  'synth': { category: 'Instruments', id: 2942, label: 'Electronic Instruments' },
  'synthesizer': { category: 'Instruments', id: 2942, label: 'Electronic Instruments' },
  'keyboard': { category: 'Instruments', id: 2945, label: 'Keyboard' },
  'celeste': { category: 'Instruments', id: 2948, label: 'Celeste' },
  'clavinet': { category: 'Instruments', id: 2949, label: 'Clavinet' },
  'moog': { category: 'Instruments', id: 2943, label: 'Moog / Arp' },

  // Guitars
  'guitar': { category: 'Instruments', id: 3002, label: 'Guitar, Acoustic / Steel String' },
  'acoustic guitar': { category: 'Instruments', id: 3001, label: 'Guitar, Acoustic / Nylon String' },
  'nylon guitar': { category: 'Instruments', id: 3001, label: 'Guitar, Acoustic / Nylon String' },
  'electric guitar': { category: 'Instruments', id: 3006, label: 'Guitar, Electric' },
  'distorted guitar': { category: 'Instruments', id: 3004, label: 'Guitar, Distorted Electric' },
  'slide guitar': { category: 'Instruments', id: 3003, label: 'Guitar, Bottleneck / Slide' },
  'dobro': { category: 'Instruments', id: 3005, label: 'Guitar, Dobro' },
  'pedal steel': { category: 'Instruments', id: 3007, label: 'Guitar, Pedal Steel' },
  'wah wah': { category: 'Instruments', id: 3009, label: 'Guitar, Wah Wah' },
  'ukulele': { category: 'Instruments', id: 3013, label: 'Ukulele' },
  'banjo': { category: 'Instruments', id: 2994, label: 'Banjo' },
  'mandolin': { category: 'Instruments', id: 3011, label: 'Mandolin' },

  // Strings
  'violin': { category: 'Instruments', id: 3015, label: 'Violin' },
  'fiddle': { category: 'Instruments', id: 2830, label: 'Fiddle' },
  'viola': { category: 'Instruments', id: 3014, label: 'Viola' },
  'cello': { category: 'Instruments', id: 2998, label: 'Cello' },
  'strings': { category: 'Instruments', id: 2992, label: 'Strings' },
  'harp': { category: 'Instruments', id: 3010, label: 'Harp' },
  'bass': { category: 'Instruments', id: 2997, label: 'Bass, Electric Bass' },
  'electric bass': { category: 'Instruments', id: 2997, label: 'Bass, Electric Bass' },
  'upright bass': { category: 'Instruments', id: 2996, label: 'Bass, Stringed Bass / Double Bass' },
  'double bass': { category: 'Instruments', id: 2996, label: 'Bass, Stringed Bass / Double Bass' },
  'slap bass': { category: 'Instruments', id: 2995, label: 'Bass, Slap Bass' },

  // Brass
  'brass': { category: 'Instruments', id: 2925, label: 'Brass' },
  'trumpet': { category: 'Instruments', id: 2930, label: 'Trumpet / Cornet' },
  'cornet': { category: 'Instruments', id: 2930, label: 'Trumpet / Cornet' },
  'trombone': { category: 'Instruments', id: 2929, label: 'Trombone' },
  'tuba': { category: 'Instruments', id: 2931, label: 'Tuba / Sousaphone' },
  'french horn': { category: 'Instruments', id: 2928, label: 'Horn / French Horn' },
  'horn': { category: 'Instruments', id: 2928, label: 'Horn / French Horn' },
  'flugelhorn': { category: 'Instruments', id: 2927, label: 'Flugelhorn' },
  'bugle': { category: 'Instruments', id: 2926, label: 'Bugle' },

  // Woodwinds
  'flute': { category: 'Instruments', id: 3020, label: 'Flute' },
  'clarinet': { category: 'Instruments', id: 3019, label: 'Clarinet' },
  'oboe': { category: 'Instruments', id: 3022, label: 'Oboe / Cor Anglais / English Horn' },
  'bassoon': { category: 'Instruments', id: 3018, label: 'Bassoon' },
  'saxophone': { category: 'Instruments', id: 3027, label: 'Saxophone' },
  'sax': { category: 'Instruments', id: 3027, label: 'Saxophone' },
  'alto sax': { category: 'Instruments', id: 3029, label: 'Alto Sax' },
  'tenor sax': { category: 'Instruments', id: 3030, label: 'Tenor Sax' },
  'soprano sax': { category: 'Instruments', id: 3028, label: 'Soprano Sax' },
  'baritone sax': { category: 'Instruments', id: 3031, label: 'Baritone Sax' },
  'recorder': { category: 'Instruments', id: 3026, label: 'Recorder' },
  'piccolo': { category: 'Instruments', id: 3025, label: 'Piccolo' },
  'harmonica': { category: 'Instruments', id: 3021, label: 'Harmonica' },
  'pan flute': { category: 'Instruments', id: 3023, label: 'Pan Pipes' },
  'pan pipes': { category: 'Instruments', id: 3023, label: 'Pan Pipes' },
  'penny whistle': { category: 'Instruments', id: 3024, label: 'Penny Whistle' },
  'whistle': { category: 'Instruments', id: 3024, label: 'Penny Whistle' },
  'woodwinds': { category: 'Instruments', id: 3016, label: 'Woodwinds' },

  // Drums & Percussion
  'drums': { category: 'Instruments', id: 2932, label: 'Drums' },
  'drum kit': { category: 'Instruments', id: 2935, label: 'Drum Kit' },
  'african drums': { category: 'Instruments', id: 2777, label: 'African Drums' },
  'talking drums': { category: 'Instruments', id: 2810, label: 'Talking Drums' },
  'native american drum': { category: 'Instruments', id: 2800, label: 'Native American Drum' },
  'ethnic drums': { category: 'Instruments', id: 2790, label: 'Drums' },
  'military drums': { category: 'Instruments', id: 2938, label: 'Military Drums' },
  'death drum': { category: 'Instruments', id: 2934, label: 'Death Drum' },
  'drum roll': { category: 'Instruments', id: 2937, label: 'Drum Roll' },
  'drum machine': { category: 'Instruments', id: 2936, label: 'Drum Machine / Electronic Drums' },
  'electronic drums': { category: 'Instruments', id: 2936, label: 'Drum Machine / Electronic Drums' },
  'percussion': { category: 'Instruments', id: 2981, label: 'Percussion' },
  'hand percussion': { category: 'Instruments', id: 2793, label: 'Hand Percussion' },
  'snare': { category: 'Instruments', id: 2939, label: 'Snare Drum' },
  'snare drum': { category: 'Instruments', id: 2939, label: 'Snare Drum' },
  'bass drum': { category: 'Instruments', id: 2933, label: 'Bass Drum' },
  'kick drum': { category: 'Instruments', id: 2933, label: 'Bass Drum' },
  'timpani': { category: 'Instruments', id: 2940, label: 'Timpani' },
  'tom toms': { category: 'Instruments', id: 2941, label: 'Tom Toms' },
  'cymbals': { category: 'Instruments', id: 2984, label: 'Cymbals' },
  'hi-hat': { category: 'Instruments', id: 2984, label: 'Cymbals' },
  'tambourine': { category: 'Instruments', id: 2988, label: 'Tambourine' },
  'maracas': { category: 'Instruments', id: 2796, label: 'Maracas' },
  'shaker': { category: 'Instruments', id: 2796, label: 'Maracas' },
  'castanets': { category: 'Instruments', id: 2983, label: 'Castanets' },
  'triangle': { category: 'Instruments', id: 2920, label: 'Bells' },
  'bells': { category: 'Instruments', id: 2920, label: 'Bells' },
  'tubular bells': { category: 'Instruments', id: 2924, label: 'Tubular Bells / Church Bells / Chimes' },
  'chimes': { category: 'Instruments', id: 2924, label: 'Tubular Bells / Church Bells / Chimes' },
  'glockenspiel': { category: 'Instruments', id: 2991, label: 'Xylophone / Glockenspiel' },
  'xylophone': { category: 'Instruments', id: 2991, label: 'Xylophone / Glockenspiel' },
  'marimba': { category: 'Instruments', id: 2986, label: 'Marimba' },
  'vibraphone': { category: 'Instruments', id: 2989, label: 'Vibraphone' },
  'vibes': { category: 'Instruments', id: 2989, label: 'Vibraphone' },
  'gong': { category: 'Instruments', id: 2792, label: 'Gong' },
  'cowbell': { category: 'Instruments', id: 2921, label: 'Cowbell' },
  'claps': { category: 'Instruments', id: 2968, label: 'Body Percussion' },
  'handclaps': { category: 'Instruments', id: 2968, label: 'Body Percussion' },

  // Latin & World Percussion
  'bongos': { category: 'Instruments', id: 2784, label: 'Bongos' },
  'congas': { category: 'Instruments', id: 2786, label: 'Congas' },
  'timbales': { category: 'Instruments', id: 2811, label: 'Timbales' },
  'djembe': { category: 'Instruments', id: 2789, label: 'Djembe' },
  'tabla': { category: 'Instruments', id: 2808, label: 'Tabla' },
  'taiko': { category: 'Instruments', id: 2809, label: 'Taiko Drum' },
  'steel drums': { category: 'Instruments', id: 2807, label: 'Steel Drums' },
  'steel pan': { category: 'Instruments', id: 2807, label: 'Steel Drums' },
  'bodhran': { category: 'Instruments', id: 2783, label: 'Bodhran' },
  'cajon': { category: 'Instruments', id: 2793, label: 'Hand Percussion' },

  // World / Ethnic Instruments
  'sitar': { category: 'Instruments', id: 2862, label: 'Sitar' },
  'oud': { category: 'Instruments', id: 2850, label: 'Oud / Ud' },
  'koto': { category: 'Instruments', id: 2843, label: 'Koto' },
  'erhu': { category: 'Instruments', id: 2828, label: 'Erhu' },
  'pipa': { category: 'Instruments', id: 2852, label: 'Pipa' },
  'shamisen': { category: 'Instruments', id: 2860, label: 'Shamisen' },
  'bouzouki': { category: 'Instruments', id: 2818, label: 'Bouzouki' },
  'balalaika': { category: 'Instruments', id: 2815, label: 'Balalaika' },
  'dulcimer': { category: 'Instruments', id: 3000, label: 'Dulcimer' },
  'zither': { category: 'Instruments', id: 2871, label: 'Zither' },
  'kalimba': { category: 'Instruments', id: 2794, label: 'Kalimba / Sanza' },
  'thumb piano': { category: 'Instruments', id: 2798, label: 'Mbira / Thumb Piano' },
  'mbira': { category: 'Instruments', id: 2798, label: 'Mbira / Thumb Piano' },
  'kora': { category: 'Instruments', id: 2842, label: 'Kora / Cora' },
  'gamelan': { category: 'Instruments', id: 2791, label: 'Gamelan' },
  'didgeridoo': { category: 'Instruments', id: 2898, label: 'Digeridoo' },
  'shakuhachi': { category: 'Instruments', id: 2892, label: 'Shakuhachi' },
  'bagpipes': { category: 'Instruments', id: 2906, label: 'Bagpipes' },
  'accordion': { category: 'Instruments', id: 2946, label: 'Accordion / Concertina' },
  'concertina': { category: 'Instruments', id: 2946, label: 'Accordion / Concertina' },

  // Other / Novelty
  'theremin': { category: 'Instruments', id: 2944, label: 'Theremin' },
  'music box': { category: 'Instruments', id: 2976, label: 'Music Box' },
  'toy piano': { category: 'Instruments', id: 2965, label: 'Piano, Toy' },
  'kazoo': { category: 'Instruments', id: 2975, label: 'Kazoo' },
  'jews harp': { category: 'Instruments', id: 2973, label: 'Jews Harp' },
  'jaw harp': { category: 'Instruments', id: 2973, label: 'Jews Harp' },

  // Common genres (verified against facet_taxonomy)
  // Main genres
  'rock': { category: 'Master Genre', id: 1322, label: 'Rock' },
  'jazz': { category: 'Master Genre', id: 1248, label: 'Jazz' },
  'classical': { category: 'Master Genre', id: 1110, label: 'Classical' },
  'pop': { category: 'Master Genre', id: 1286, label: 'Pop' },
  'electronic': { category: 'Master Genre', id: 1136, label: 'Electronica' },
  'electronica': { category: 'Master Genre', id: 1136, label: 'Electronica' },
  'country': { category: 'Master Genre', id: 1204, label: 'Country' },
  'blues': { category: 'Master Genre', id: 1100, label: 'Blues' },
  'folk': { category: 'Master Genre', id: 1172, label: 'Folk Song' },
  'hip hop': { category: 'Master Genre', id: 1239, label: 'Hip Hop' },
  'hip-hop': { category: 'Master Genre', id: 1239, label: 'Hip Hop' },
  'hiphop': { category: 'Master Genre', id: 1239, label: 'Hip Hop' },
  'rap': { category: 'Master Genre', id: 1247, label: 'Rap' },
  'r&b': { category: 'Master Genre', id: 1104, label: 'Rhythm & Blues' },
  'rnb': { category: 'Master Genre', id: 1104, label: 'Rhythm & Blues' },
  'soul': { category: 'Master Genre', id: 1231, label: 'Contemporary Soul' },
  'funk': { category: 'Master Genre', id: 1232, label: 'Funk' },
  'reggae': { category: 'Master Genre', id: 1182, label: 'Reggae' },
  'latin': { category: 'Master Genre', id: 1277, label: 'Latin' },
  'world': { category: 'Master Genre', id: 1185, label: 'World Beat / Ethnic Stylings' },

  // Rock subgenres
  'alternative': { category: 'Master Genre', id: 1323, label: 'Alternative Rock' },
  'alt rock': { category: 'Master Genre', id: 1323, label: 'Alternative Rock' },
  'indie': { category: 'Master Genre', id: 1339, label: 'Indie' },
  'indie rock': { category: 'Master Genre', id: 1339, label: 'Indie' },
  'punk': { category: 'Master Genre', id: 1348, label: 'Punk' },
  'metal': { category: 'Master Genre', id: 1338, label: 'Heavy Metal' },
  'heavy metal': { category: 'Master Genre', id: 1338, label: 'Heavy Metal' },
  'hard rock': { category: 'Master Genre', id: 1336, label: 'Hard Rock' },
  'classic rock': { category: 'Master Genre', id: 1327, label: 'Classic Rock' },
  'soft rock': { category: 'Master Genre', id: 3380, label: 'Soft Rock' },
  'prog rock': { category: 'Master Genre', id: 1346, label: 'Progressive Rock' },
  'progressive': { category: 'Master Genre', id: 1346, label: 'Progressive Rock' },
  'grunge': { category: 'Master Genre', id: 1335, label: 'Grunge' },
  'southern rock': { category: 'Master Genre', id: 1355, label: 'Southern Rock' },
  'surf': { category: 'Master Genre', id: 1358, label: 'Surf Rock' },
  'psychedelic': { category: 'Master Genre', id: 1347, label: 'Psychedelic' },
  'garage': { category: 'Master Genre', id: 1332, label: 'Garage Rock' },

  // Electronic subgenres
  'house': { category: 'Master Genre', id: 1144, label: 'House' },
  'techno': { category: 'Master Genre', id: 1166, label: 'Techno' },
  'trance': { category: 'Master Genre', id: 1167, label: 'Trance' },
  'dubstep': { category: 'Master Genre', id: 1133, label: 'Dubstep' },
  'drum and bass': { category: 'Master Genre', id: 1131, label: 'Drum n Bass / Jungle' },
  'dnb': { category: 'Master Genre', id: 1131, label: 'Drum n Bass / Jungle' },
  'ambient': { category: 'Master Genre', id: 1124, label: 'Ambient' },
  'edm': { category: 'Master Genre', id: 3375, label: 'EDM' },
  'disco': { category: 'Master Genre', id: 1130, label: 'Disco' },
  'chill': { category: 'Master Genre', id: 1128, label: 'Chill Out / Downtempo' },
  'chillout': { category: 'Master Genre', id: 1128, label: 'Chill Out / Downtempo' },
  'lofi': { category: 'Master Genre', id: 3385, label: 'Lo-Fi Hip Hop' },
  'lo-fi': { category: 'Master Genre', id: 3385, label: 'Lo-Fi Hip Hop' },
  'trap': { category: 'Master Genre', id: 3386, label: 'Trap' },
  'synthwave': { category: 'Master Genre', id: 3378, label: 'Synthwave' },
  'synth pop': { category: 'Master Genre', id: 1294, label: 'Synth Pop' },
  'electro': { category: 'Master Genre', id: 1134, label: 'Electro' },
  'breakbeat': { category: 'Master Genre', id: 1126, label: 'Breakbeat' },
  'trip hop': { category: 'Master Genre', id: 1168, label: 'Trip Hop' },
  'deep house': { category: 'Master Genre', id: 1148, label: 'Deep House' },
  'future bass': { category: 'Master Genre', id: 3376, label: 'Future Bass' },

  // Jazz subgenres
  'smooth jazz': { category: 'Master Genre', id: 1270, label: 'Smooth Jazz' },
  'bebop': { category: 'Master Genre', id: 1253, label: 'Bebop' },
  'big band': { category: 'Master Genre', id: 1254, label: 'Big Band' },
  'swing': { category: 'Master Genre', id: 1272, label: 'Swing' },
  'fusion': { category: 'Master Genre', id: 1259, label: 'Fusion' },
  'cool jazz': { category: 'Master Genre', id: 1255, label: 'Cool Jazz' },
  'latin jazz': { category: 'Master Genre', id: 1266, label: 'Latin Jazz' },
  'acid jazz': { category: 'Master Genre', id: 1249, label: 'Acid Jazz' },

  // Pop subgenres
  'indie pop': { category: 'Master Genre', id: 3387, label: 'Indie Pop' },
  'electro pop': { category: 'Master Genre', id: 1289, label: 'Electro Pop' },
  'pop rock': { category: 'Master Genre', id: 3388, label: 'Pop Rock' },
  'britpop': { category: 'Master Genre', id: 1287, label: 'Britpop' },

  // Country subgenres
  'bluegrass': { category: 'Master Genre', id: 1206, label: 'Bluegrass' },
  'americana': { category: 'Master Genre', id: 3379, label: 'Americana' },
  'country rock': { category: 'Master Genre', id: 1209, label: 'Country Rock' },
  'western': { category: 'Master Genre', id: 1211, label: 'Western / Cowboy' },
  'cowboy': { category: 'Master Genre', id: 1211, label: 'Western / Cowboy' },

  // Other popular genres
  'lounge': { category: 'Master Genre', id: 1218, label: 'Lounge' },
  'new age': { category: 'Master Genre', id: 1220, label: 'New Age' },
  'cinematic': { category: 'Master Genre', id: 1222, label: 'Film Score / Orchestral' },
  'orchestral': { category: 'Master Genre', id: 1222, label: 'Film Score / Orchestral' },
  'film score': { category: 'Master Genre', id: 1222, label: 'Film Score / Orchestral' },
  'soundtrack': { category: 'Master Genre', id: 1222, label: 'Film Score / Orchestral' },
  'trailer music': { category: 'Master Genre', id: 1224, label: 'Film Score / Trailer' },
  'epic music': { category: 'Master Genre', id: 1224, label: 'Film Score / Trailer' },
  'corporate': { category: 'Master Genre', id: 1192, label: 'Corporate' },
  'motown': { category: 'Master Genre', id: 1234, label: 'Motown' },
  'gospel': { category: 'Master Genre', id: 1305, label: 'Gospel Songs / Spirituals' },
  'dancehall': { category: 'Master Genre', id: 3382, label: 'Dancehall' },
  'afrobeat': { category: 'Master Genre', id: 3392, label: 'Afrobeat' },
  'ska': { category: 'Master Genre', id: 1183, label: 'Ska' },
  'celtic': { category: 'Master Genre', id: 1326, label: 'Celtic Rock' },
  'grime': { category: 'Master Genre', id: 3384, label: 'Grime' },
  'new wave': { category: 'Master Genre', id: 1343, label: 'New Wave' },
  'post punk': { category: 'Master Genre', id: 3389, label: 'Post Punk' },
  'yacht rock': { category: 'Master Genre', id: 3381, label: 'Yacht Rock' },

  // Additional Genre (subgenres - verified against facet_taxonomy)
  // Electronic subgenres
  '2 step': { category: 'Additional Genre', id: 1931, label: '2 Step' },
  'two step': { category: 'Additional Genre', id: 1931, label: '2 Step' },
  'acid house': { category: 'Additional Genre', id: 1954, label: 'Acid House' },
  'acid lounge': { category: 'Additional Genre', id: 1932, label: 'Acid Lounge' },
  'afro house': { category: 'Additional Genre', id: 1955, label: 'Afro House' },
  'beach house': { category: 'Additional Genre', id: 1956, label: 'Beach House' },
  'big beat': { category: 'Additional Genre', id: 1934, label: 'Big Beat' },
  'chemical beats': { category: 'Additional Genre', id: 1936, label: 'Chemical Beats' },
  'club': { category: 'Additional Genre', id: 1938, label: 'Club / Electronica' },
  'deep house': { category: 'Additional Genre', id: 1957, label: 'Deep House' },
  'disco house': { category: 'Additional Genre', id: 1958, label: 'Disco House' },
  'dream house': { category: 'Additional Genre', id: 1959, label: 'Dream House' },
  'dub': { category: 'Additional Genre', id: 1941, label: 'Dub' },
  'electro house': { category: 'Additional Genre', id: 1960, label: 'Electro House' },
  'electroclash': { category: 'Additional Genre', id: 1944, label: 'Electroclash' },
  'euro beat': { category: 'Additional Genre', id: 1946, label: 'Euro Beat' },
  'eurobeat': { category: 'Additional Genre', id: 1946, label: 'Euro Beat' },
  'euro pop': { category: 'Additional Genre', id: 1947, label: 'Euro Pop' },
  'french house': { category: 'Additional Genre', id: 1961, label: 'French House' },
  'gabba': { category: 'Additional Genre', id: 1948, label: 'Gabba' },
  'garage uk': { category: 'Additional Genre', id: 1949, label: 'Garage' },
  'uk garage': { category: 'Additional Genre', id: 1949, label: 'Garage' },
  'goa trance': { category: 'Additional Genre', id: 1950, label: 'Goa Trance' },
  'grooves': { category: 'Additional Genre', id: 1951, label: 'Grooves' },
  'handbag house': { category: 'Additional Genre', id: 1962, label: 'Handbag House' },
  'hard house': { category: 'Additional Genre', id: 1963, label: 'Hard House' },
  'hardcore electronic': { category: 'Additional Genre', id: 1952, label: 'Hardcore' },
  'jazz house': { category: 'Additional Genre', id: 1964, label: 'Jazz House' },
  'jungle': { category: 'Additional Genre', id: 1966, label: 'Jungle' },
  'leftfield': { category: 'Additional Genre', id: 1967, label: 'Leftfield' },
  'lo fi electronic': { category: 'Additional Genre', id: 1968, label: 'Lo Fi' },
  'loungecore': { category: 'Additional Genre', id: 1969, label: 'Loungecore' },
  'nu school breaks': { category: 'Additional Genre', id: 1970, label: 'Nu School Breaks' },
  'rave': { category: 'Additional Genre', id: 1971, label: 'Rave' },
  'remixes': { category: 'Additional Genre', id: 1972, label: 'Remixes' },
  'remix': { category: 'Additional Genre', id: 1972, label: 'Remixes' },
  'rock techno': { category: 'Additional Genre', id: 1974, label: 'Rock Techno' },
  'tech house': { category: 'Additional Genre', id: 1965, label: 'Tech House' },
  'tropical house': { category: 'Additional Genre', id: 3399, label: 'Tropical House' },
  'zombie hip hop': { category: 'Additional Genre', id: 1978, label: 'Zombie Hip Hop' },
  'moombahton': { category: 'Additional Genre', id: 3417, label: 'Moombahton' },
  'rocktronica': { category: 'Additional Genre', id: 3412, label: 'Rocktronica' },

  // Jazz subgenres (Additional Genre)
  'african jazz': { category: 'Additional Genre', id: 2059, label: 'African Jazz' },
  'afro cuban jazz': { category: 'Additional Genre', id: 2060, label: 'Afro Cuban Jazz' },
  'baroque jazz': { category: 'Additional Genre', id: 2061, label: 'Baroque Jazz' },
  'electro swing': { category: 'Additional Genre', id: 2066, label: 'Electro Swing' },
  'freeform jazz': { category: 'Additional Genre', id: 2067, label: 'Freeform / Avant Garde' },
  'avant garde jazz': { category: 'Additional Genre', id: 2067, label: 'Freeform / Avant Garde' },
  'future jazz': { category: 'Additional Genre', id: 2069, label: 'Future Jazz' },
  'hot club': { category: 'Additional Genre', id: 2070, label: 'Hot Club Of France' },
  'gypsy jazz': { category: 'Additional Genre', id: 2070, label: 'Hot Club Of France' },
  'jazz funk': { category: 'Additional Genre', id: 2072, label: 'Jazz Funk' },
  'jazz waltz': { category: 'Additional Genre', id: 2073, label: 'Jazz Waltz' },
  'jug band': { category: 'Additional Genre', id: 2074, label: 'Jug Band / Skiffle' },
  'skiffle': { category: 'Additional Genre', id: 2074, label: 'Jug Band / Skiffle' },
  'modern jazz': { category: 'Additional Genre', id: 2076, label: 'Modern Jazz' },
  'neo swing': { category: 'Additional Genre', id: 2077, label: 'Neo Swing' },
  'ragtime': { category: 'Additional Genre', id: 2078, label: 'Ragtime' },
  'stride': { category: 'Additional Genre', id: 2080, label: 'Stride / Boogie' },
  'boogie woogie': { category: 'Additional Genre', id: 2080, label: 'Stride / Boogie' },
  'west coast jazz': { category: 'Additional Genre', id: 2082, label: 'West Coast Jazz' },
  'dixieland': { category: 'Additional Genre', id: 2065, label: 'Dixieland' },

  // Rock subgenres (Additional Genre)
  'aor': { category: 'Additional Genre', id: 2023, label: 'AOR' },
  'album oriented rock': { category: 'Additional Genre', id: 2023, label: 'AOR' },
  'black metal': { category: 'Additional Genre', id: 2133, label: 'Black Metal' },
  'boogie rock': { category: 'Additional Genre', id: 2134, label: 'Boogie' },
  'celtic rock': { category: 'Additional Genre', id: 2135, label: 'Celtic Rock' },
  'classical rock': { category: 'Additional Genre', id: 2137, label: 'Classical Rock' },
  'death metal': { category: 'Additional Genre', id: 2138, label: 'Death Metal' },
  'emo': { category: 'Additional Genre', id: 2139, label: 'Emo' },
  'funk rock': { category: 'Additional Genre', id: 2140, label: 'Funk Rock' },
  'glam rock': { category: 'Additional Genre', id: 2142, label: 'Glam Rock' },
  'glam': { category: 'Additional Genre', id: 2142, label: 'Glam Rock' },
  'gothic rock': { category: 'Additional Genre', id: 2143, label: 'Gothic Rock' },
  'gothic': { category: 'Additional Genre', id: 2143, label: 'Gothic Rock' },
  'goth': { category: 'Additional Genre', id: 2143, label: 'Gothic Rock' },
  'hardcore rock': { category: 'Additional Genre', id: 2146, label: 'Hardcore' },
  'industrial': { category: 'Additional Genre', id: 2149, label: 'Industrial Rock' },
  'industrial rock': { category: 'Additional Genre', id: 2149, label: 'Industrial Rock' },
  'jazz rock': { category: 'Additional Genre', id: 2150, label: 'Jazz Rock' },
  'mersey beat': { category: 'Additional Genre', id: 2151, label: 'Mersey Beat' },
  'nu metal': { category: 'Additional Genre', id: 2153, label: 'Nu Metal' },
  'post rock': { category: 'Additional Genre', id: 2154, label: 'Post Rock' },
  'pop punk': { category: 'Additional Genre', id: 2102, label: 'Pop Punk' },
  'punk metal': { category: 'Additional Genre', id: 2158, label: 'Punk Metal' },
  'rap rock': { category: 'Additional Genre', id: 2159, label: 'Rap Rock' },
  'rock and roll': { category: 'Additional Genre', id: 2161, label: 'Rock & Roll' },
  'rock n roll': { category: 'Additional Genre', id: 2161, label: 'Rock & Roll' },
  'rockabilly': { category: 'Additional Genre', id: 2162, label: 'Rockabilly' },
  'shoegaze': { category: 'Additional Genre', id: 3413, label: 'Shoegaze' },
  'skate punk': { category: 'Additional Genre', id: 2163, label: 'Skate Punk' },
  'speed metal': { category: 'Additional Genre', id: 2165, label: 'Speed Metal / Thrash Metal' },
  'thrash metal': { category: 'Additional Genre', id: 2165, label: 'Speed Metal / Thrash Metal' },
  'thrash': { category: 'Additional Genre', id: 2165, label: 'Speed Metal / Thrash Metal' },
  'stadium rock': { category: 'Additional Genre', id: 2166, label: 'Stadium Rock' },
  'arena rock': { category: 'Additional Genre', id: 2166, label: 'Stadium Rock' },
  'surf rock': { category: 'Additional Genre', id: 2167, label: 'Surf Rock' },

  // Hip Hop / R&B subgenres (Additional Genre)
  'breakdance': { category: 'Additional Genre', id: 2047, label: 'Breakdance' },
  'dirty south': { category: 'Additional Genre', id: 2049, label: 'Dirty South' },
  'east coast hip hop': { category: 'Additional Genre', id: 2050, label: 'East Coast' },
  'east coast': { category: 'Additional Genre', id: 2050, label: 'East Coast' },
  'gangsta': { category: 'Additional Genre', id: 2051, label: 'Gangsta' },
  'gangsta rap': { category: 'Additional Genre', id: 2051, label: 'Gangsta' },
  'hard hip hop': { category: 'Additional Genre', id: 2052, label: 'Hard' },
  'lo-fi hip hop': { category: 'Additional Genre', id: 3407, label: 'Lo-Fi Hip Hop' },
  'lofi hip hop': { category: 'Additional Genre', id: 3407, label: 'Lo-Fi Hip Hop' },
  'old skool': { category: 'Additional Genre', id: 2053, label: 'Old Skool' },
  'old school hip hop': { category: 'Additional Genre', id: 2053, label: 'Old Skool' },
  'boom bap': { category: 'Additional Genre', id: 2053, label: 'Old Skool' },
  'smooth hip hop': { category: 'Additional Genre', id: 2054, label: 'Smooth' },
  'west coast hip hop': { category: 'Additional Genre', id: 2055, label: 'West Coast' },
  'classic r&b': { category: 'Additional Genre', id: 2038, label: 'Classic R&B' },
  'classic rnb': { category: 'Additional Genre', id: 2038, label: 'Classic R&B' },
  'classic soul': { category: 'Additional Genre', id: 2039, label: 'Classic Soul' },
  'contemporary r&b': { category: 'Additional Genre', id: 2097, label: 'Contemporary R&B' },
  'contemporary rnb': { category: 'Additional Genre', id: 2097, label: 'Contemporary R&B' },
  'contemporary soul': { category: 'Additional Genre', id: 2040, label: 'Contemporary Soul' },
  'liquid funk': { category: 'Additional Genre', id: 2042, label: 'Liquid Funk' },
  'northern soul': { category: 'Additional Genre', id: 2044, label: 'Northern Soul' },
  'new jack swing': { category: 'Additional Genre', id: 3405, label: 'New Jack Swing' },
  'drill': { category: 'Additional Genre', id: 3406, label: 'Grime' },

  // Country subgenres (Additional Genre)
  'alt country': { category: 'Additional Genre', id: 2014, label: 'Alt Country' },
  'alternative country': { category: 'Additional Genre', id: 2014, label: 'Alt Country' },
  'appalachian': { category: 'Additional Genre', id: 2180, label: 'Appalachian' },
  'country pop': { category: 'Additional Genre', id: 2017, label: 'Country Pop' },
  'country western': { category: 'Additional Genre', id: 2016, label: 'Country / Western' },
  'hillbilly': { category: 'Additional Genre', id: 2019, label: 'Hillbilly' },
  'western swing': { category: 'Additional Genre', id: 2021, label: 'Western Swing' },
  'outlaw country': { category: 'Additional Genre', id: 2014, label: 'Alt Country' },

  // World / Latin subgenres (Additional Genre)
  'african influenced': { category: 'Additional Genre', id: 1995, label: 'African Influenced' },
  'asian beats': { category: 'Additional Genre', id: 1984, label: 'Asian Beats' },
  'asian influenced': { category: 'Additional Genre', id: 1996, label: 'Asian Influenced' },
  'bhangra': { category: 'Additional Genre', id: 1985, label: 'Bhangra' },
  'bollywood': { category: 'Additional Genre', id: 1986, label: 'Bollywood' },
  'cajun': { category: 'Additional Genre', id: 2181, label: 'Cajun / Zydeco' },
  'zydeco': { category: 'Additional Genre', id: 2181, label: 'Cajun / Zydeco' },
  'calypso': { category: 'Additional Genre', id: 2186, label: 'Calypso' },
  'celtic influenced': { category: 'Additional Genre', id: 1997, label: 'Celtic Influenced' },
  'chanson': { category: 'Additional Genre', id: 2187, label: 'Chanson' },
  'cuban': { category: 'Additional Genre', id: 2087, label: 'Cuban' },
  'exotica': { category: 'Additional Genre', id: 1987, label: 'Exotica' },
  'fado': { category: 'Additional Genre', id: 2188, label: 'Fado' },
  'gypsy': { category: 'Additional Genre', id: 2189, label: 'Gypsy' },
  'hawaiian': { category: 'Additional Genre', id: 2183, label: 'Hawaiian' },
  'jawaiian': { category: 'Additional Genre', id: 1988, label: 'Jawaiian Reggae' },
  'klezmer': { category: 'Additional Genre', id: 2190, label: 'Klezmer' },
  'latin dance': { category: 'Additional Genre', id: 2088, label: 'Latin Dance Styles' },
  'latin folk': { category: 'Additional Genre', id: 2191, label: 'Latin Folk Music' },
  'latin house': { category: 'Additional Genre', id: 2089, label: 'Latin House' },
  'latin influenced': { category: 'Additional Genre', id: 1998, label: 'Latin Influenced' },
  'mariachi': { category: 'Additional Genre', id: 2192, label: 'Mariachi' },
  'miami sound': { category: 'Additional Genre', id: 2090, label: 'Miami Sound' },
  'middle eastern influenced': { category: 'Additional Genre', id: 1999, label: 'Middle Eastern Influenced' },
  'native american': { category: 'Additional Genre', id: 2184, label: 'Native American' },
  'ragga': { category: 'Additional Genre', id: 1989, label: 'Ragga' },
  'rai': { category: 'Additional Genre', id: 1990, label: 'Rai' },
  'reggaeton': { category: 'Additional Genre', id: 2091, label: 'Reggaeton' },
  'sea shanty': { category: 'Additional Genre', id: 2195, label: 'Sea Shanty' },
  'shanty': { category: 'Additional Genre', id: 2195, label: 'Sea Shanty' },
  'soca': { category: 'Additional Genre', id: 2186, label: 'Calypso' },
  'tango nuevo': { category: 'Additional Genre', id: 2092, label: 'Tango Nuevo' },
  'tex mex': { category: 'Additional Genre', id: 2093, label: 'Tex Mex / Banda / Norteno' },
  'banda': { category: 'Additional Genre', id: 2093, label: 'Tex Mex / Banda / Norteno' },
  'norteno': { category: 'Additional Genre', id: 2093, label: 'Tex Mex / Banda / Norteno' },
  'township': { category: 'Additional Genre', id: 1993, label: 'Township' },
  'j-pop': { category: 'Additional Genre', id: 3415, label: 'J-Pop' },
  'jpop': { category: 'Additional Genre', id: 3415, label: 'J-Pop' },
  'k-pop': { category: 'Additional Genre', id: 3416, label: 'K-Pop' },
  'kpop': { category: 'Additional Genre', id: 3416, label: 'K-Pop' },

  // Classical subgenres (Additional Genre)
  '20th century classical': { category: 'Additional Genre', id: 1920, label: '20th Century Classical Style' },
  'avant garde': { category: 'Additional Genre', id: 1921, label: 'Avant Garde' },
  'classical arrangement': { category: 'Additional Genre', id: 1922, label: 'Classical Arrangement' },
  'classical fusion': { category: 'Additional Genre', id: 1923, label: 'Classical Fusion' },
  'classical remix': { category: 'Additional Genre', id: 1924, label: 'Classical Remix' },
  'impressionist': { category: 'Additional Genre', id: 1926, label: 'Impressionist Style' },
  'minimalist': { category: 'Additional Genre', id: 1927, label: 'Minimalist Style' },
  'musique concrete': { category: 'Additional Genre', id: 1928, label: 'Musique Concrete Style' },
  'neo classical': { category: 'Additional Genre', id: 1929, label: 'Neo Classical' },
  'neoclassical': { category: 'Additional Genre', id: 1929, label: 'Neo Classical' },

  // Pop subgenres (Additional Genre)
  'kiddie pop': { category: 'Additional Genre', id: 2099, label: 'Kiddie Pop' },
  'kids pop': { category: 'Additional Genre', id: 2099, label: 'Kiddie Pop' },
  'orchestral pop': { category: 'Additional Genre', id: 2100, label: 'Orchestral Pop' },
  'tween': { category: 'Additional Genre', id: 2104, label: 'Tween' },
  'tween pop': { category: 'Additional Genre', id: 2104, label: 'Tween' },

  // Folk subgenres (Additional Genre)
  'american folk dance': { category: 'Additional Genre', id: 2179, label: 'American Folk Dance' },
  'contemporary folk': { category: 'Additional Genre', id: 1979, label: 'Contemporary Folk' },
  'folk rock': { category: 'Additional Genre', id: 1980, label: 'Folk Rock' },
  'new acoustic': { category: 'Additional Genre', id: 1982, label: 'New Acoustic' },
  'blues folk': { category: 'Additional Genre', id: 1910, label: 'Blues / Folk' },
  'blues jazz': { category: 'Additional Genre', id: 1911, label: 'Blues / Jazz' },
  'blues rock': { category: 'Additional Genre', id: 1912, label: 'Blues / Rock' },
  'delta blues': { category: 'Additional Genre', id: 3396, label: 'Delta Blues' },

  // Production / Background Music (Additional Genre)
  'background music': { category: 'Additional Genre', id: 2024, label: 'Background / Elevator' },
  'elevator music': { category: 'Additional Genre', id: 2024, label: 'Background / Elevator' },
  'muzak': { category: 'Additional Genre', id: 2024, label: 'Background / Elevator' },
  'beds': { category: 'Additional Genre', id: 2002, label: 'Beds' },
  'bright optimistic': { category: 'Additional Genre', id: 2003, label: 'Bright / Optimistic' },
  'documentary': { category: 'Additional Genre', id: 2032, label: 'Documentary' },
  'documentary music': { category: 'Additional Genre', id: 2032, label: 'Documentary' },
  'drones': { category: 'Additional Genre', id: 2170, label: 'Drones' },
  'drone': { category: 'Additional Genre', id: 2170, label: 'Drones' },
  'atmospheres': { category: 'Additional Genre', id: 2169, label: 'Atmospheres' },
  'atmospheric': { category: 'Additional Genre', id: 2169, label: 'Atmospheres' },
  'easy listening': { category: 'Additional Genre', id: 2022, label: 'Easy Listening' },
  'middle of the road': { category: 'Additional Genre', id: 2028, label: 'Middle Of The Road' },
  'mor': { category: 'Additional Genre', id: 2028, label: 'Middle Of The Road' },
  'news music': { category: 'Additional Genre', id: 2004, label: 'Communication / News' },
  'panoramic': { category: 'Additional Genre', id: 2034, label: 'Panoramic' },
  'pastoral': { category: 'Additional Genre', id: 2035, label: 'Pastoral' },
  'schlager': { category: 'Additional Genre', id: 2030, label: 'Schlager' },
  'dansband': { category: 'Additional Genre', id: 2025, label: 'Dansband' },

  // Religious (Additional Genre)
  'buddhist': { category: 'Additional Genre', id: 2106, label: 'Buddhist' },
  'christian': { category: 'Additional Genre', id: 2110, label: 'Christian' },
  'contemporary christian': { category: 'Additional Genre', id: 2112, label: 'Contemporary Christian' },
  'gospel': { category: 'Additional Genre', id: 2114, label: 'Gospel Songs / Spirituals' },
  'spirituals': { category: 'Additional Genre', id: 2114, label: 'Gospel Songs / Spirituals' },
  'hindu': { category: 'Additional Genre', id: 2116, label: 'Hindu' },
  'islamic': { category: 'Additional Genre', id: 2119, label: 'Islamic' },
  'jewish': { category: 'Additional Genre', id: 2123, label: 'Jewish' },
  'shamanistic': { category: 'Additional Genre', id: 2127, label: 'Shamanistic' },

  // Tempo (verified - using actual tempo facet IDs from facet_taxonomy)
  // Very, Very Slow - Below 40 BPM (Larghissimo)
  'very very slow': { category: 'Tempo', id: 1874, label: 'Below 40 Very, Very Slow (Larghissimo)' },
  'larghissimo': { category: 'Tempo', id: 1874, label: 'Below 40 Very, Very Slow (Larghissimo)' },
  'extremely slow': { category: 'Tempo', id: 1874, label: 'Below 40 Very, Very Slow (Larghissimo)' },

  // Very Slow - 40-60 BPM (Largo)
  'very slow': { category: 'Tempo', id: 1875, label: '40 - 60 Very Slow (Largo)' },
  'largo': { category: 'Tempo', id: 1875, label: '40 - 60 Very Slow (Largo)' },
  'grave': { category: 'Tempo', id: 1875, label: '40 - 60 Very Slow (Largo)' },
  'lento': { category: 'Tempo', id: 1875, label: '40 - 60 Very Slow (Largo)' },

  // Slow - 60-66 BPM (Larghetto)
  'slow': { category: 'Tempo', id: 1876, label: '60 - 66 Slow (Larghetto)' },
  'larghetto': { category: 'Tempo', id: 1876, label: '60 - 66 Slow (Larghetto)' },
  'adagietto': { category: 'Tempo', id: 1876, label: '60 - 66 Slow (Larghetto)' },

  // Medium Slow - 66-76 BPM (Adagio)
  'medium slow': { category: 'Tempo', id: 1877, label: '66 - 76 Medium Slow (Adagio)' },
  'adagio': { category: 'Tempo', id: 1877, label: '66 - 76 Medium Slow (Adagio)' },
  'downtempo': { category: 'Tempo', id: 1877, label: '66 - 76 Medium Slow (Adagio)' },
  'laid back': { category: 'Tempo', id: 1877, label: '66 - 76 Medium Slow (Adagio)' },
  'relaxed tempo': { category: 'Tempo', id: 1877, label: '66 - 76 Medium Slow (Adagio)' },

  // Medium - 76-108 BPM (Andante)
  'medium': { category: 'Tempo', id: 1878, label: '76 - 108 Medium (Andante)' },
  'medium tempo': { category: 'Tempo', id: 1878, label: '76 - 108 Medium (Andante)' },
  'andante': { category: 'Tempo', id: 1878, label: '76 - 108 Medium (Andante)' },
  'andantino': { category: 'Tempo', id: 1878, label: '76 - 108 Medium (Andante)' },
  'moderate': { category: 'Tempo', id: 1878, label: '76 - 108 Medium (Andante)' },
  'walking pace': { category: 'Tempo', id: 1878, label: '76 - 108 Medium (Andante)' },
  'mid tempo': { category: 'Tempo', id: 1878, label: '76 - 108 Medium (Andante)' },
  'mid-tempo': { category: 'Tempo', id: 1878, label: '76 - 108 Medium (Andante)' },
  'midtempo': { category: 'Tempo', id: 1878, label: '76 - 108 Medium (Andante)' },

  // Medium Fast - 108-120 BPM (Moderato)
  'medium fast': { category: 'Tempo', id: 1879, label: '108 - 120 Medium Fast (Moderato)' },
  'moderato': { category: 'Tempo', id: 1879, label: '108 - 120 Medium Fast (Moderato)' },
  'allegretto': { category: 'Tempo', id: 1879, label: '108 - 120 Medium Fast (Moderato)' },
  'upbeat': { category: 'Tempo', id: 1879, label: '108 - 120 Medium Fast (Moderato)' },
  'lively': { category: 'Tempo', id: 1879, label: '108 - 120 Medium Fast (Moderato)' },

  // Fast - 120-168 BPM (Allegro)
  'fast': { category: 'Tempo', id: 1880, label: '120 - 168 Fast (Allegro)' },
  'uptempo': { category: 'Tempo', id: 1880, label: '120 - 168 Fast (Allegro)' },
  'up tempo': { category: 'Tempo', id: 1880, label: '120 - 168 Fast (Allegro)' },
  'allegro': { category: 'Tempo', id: 1880, label: '120 - 168 Fast (Allegro)' },
  'vivace': { category: 'Tempo', id: 1880, label: '120 - 168 Fast (Allegro)' },
  'brisk': { category: 'Tempo', id: 1880, label: '120 - 168 Fast (Allegro)' },
  'quick': { category: 'Tempo', id: 1880, label: '120 - 168 Fast (Allegro)' },
  'driving': { category: 'Tempo', id: 1880, label: '120 - 168 Fast (Allegro)' },
  'energetic tempo': { category: 'Tempo', id: 1880, label: '120 - 168 Fast (Allegro)' },
  'high energy': { category: 'Tempo', id: 1880, label: '120 - 168 Fast (Allegro)' },

  // Very Fast - 168-200 BPM (Presto)
  'very fast': { category: 'Tempo', id: 1881, label: '168 - 200 Very Fast (Presto)' },
  'presto': { category: 'Tempo', id: 1881, label: '168 - 200 Very Fast (Presto)' },
  'vivacissimo': { category: 'Tempo', id: 1881, label: '168 - 200 Very Fast (Presto)' },
  'rapid': { category: 'Tempo', id: 1881, label: '168 - 200 Very Fast (Presto)' },
  'breakneck': { category: 'Tempo', id: 1881, label: '168 - 200 Very Fast (Presto)' },
  'frantic': { category: 'Tempo', id: 1881, label: '168 - 200 Very Fast (Presto)' },

  // Very, Very Fast - Over 200 BPM (Prestissimo)
  'very very fast': { category: 'Tempo', id: 1882, label: 'Over 200 Very, Very Fast (Prestissimo)' },
  'prestissimo': { category: 'Tempo', id: 1882, label: 'Over 200 Very, Very Fast (Prestissimo)' },
  'extremely fast': { category: 'Tempo', id: 1882, label: 'Over 200 Very, Very Fast (Prestissimo)' },
  'blazing': { category: 'Tempo', id: 1882, label: 'Over 200 Very, Very Fast (Prestissimo)' },

  // Special tempo types
  'no tempo': { category: 'Tempo', id: 3532, label: 'No Tempo' },
  'ambient tempo': { category: 'Tempo', id: 3532, label: 'No Tempo' },
  'free tempo': { category: 'Tempo', id: 3532, label: 'No Tempo' },
  'rubato': { category: 'Tempo', id: 3532, label: 'No Tempo' },
  'varied tempo': { category: 'Tempo', id: 3533, label: 'Varied Tempo' },
  'changing tempo': { category: 'Tempo', id: 3533, label: 'Varied Tempo' },
  'tempo changes': { category: 'Tempo', id: 3533, label: 'Varied Tempo' },

  // Movement (verified against facet_taxonomy)
  // Irregular movements
  'irregular': { category: 'Movement', id: 2383, label: 'Irregular' },
  'accelerating': { category: 'Movement', id: 2384, label: 'Accelerating' },
  'speeding up': { category: 'Movement', id: 2384, label: 'Accelerating' },
  'building': { category: 'Movement', id: 2384, label: 'Accelerating' },
  'bumbling': { category: 'Movement', id: 2385, label: 'Bumbling' },
  'clumsy': { category: 'Movement', id: 2385, label: 'Bumbling' },
  'decelerating': { category: 'Movement', id: 2386, label: 'Decelerating' },
  'slowing down': { category: 'Movement', id: 2386, label: 'Decelerating' },
  'winding down': { category: 'Movement', id: 2386, label: 'Decelerating' },
  'eccentric': { category: 'Movement', id: 2387, label: 'Eccentric' },
  'quirky movement': { category: 'Movement', id: 2387, label: 'Eccentric' },
  'insectile': { category: 'Movement', id: 2388, label: 'Insectile' },
  'bug like': { category: 'Movement', id: 2388, label: 'Insectile' },
  'creepy crawly': { category: 'Movement', id: 2388, label: 'Insectile' },
  'stabbing': { category: 'Movement', id: 2389, label: 'Stabbing' },
  'staccato': { category: 'Movement', id: 2389, label: 'Stabbing' },
  'syncopated': { category: 'Movement', id: 2390, label: 'Syncopated' },
  'off beat': { category: 'Movement', id: 2390, label: 'Syncopated' },
  'offbeat': { category: 'Movement', id: 2390, label: 'Syncopated' },

  // Rhythmic movements
  'rhythmic': { category: 'Movement', id: 2392, label: 'Rhythmic' },
  'groovy': { category: 'Movement', id: 2392, label: 'Rhythmic' },
  'groove': { category: 'Movement', id: 2392, label: 'Rhythmic' },
  'busy': { category: 'Movement', id: 2394, label: 'Busy' },
  'frantic': { category: 'Movement', id: 2399, label: 'Frenzy' },
  'frenzy': { category: 'Movement', id: 2399, label: 'Frenzy' },
  'frenzied': { category: 'Movement', id: 2399, label: 'Frenzy' },
  'chase music': { category: 'Movement', id: 2395, label: 'Chase' },
  'chasing': { category: 'Movement', id: 2395, label: 'Chase' },
  'pursuit': { category: 'Movement', id: 2395, label: 'Chase' },
  'clock like': { category: 'Movement', id: 2396, label: 'Clock Like' },
  'ticking': { category: 'Movement', id: 2396, label: 'Clock Like' },
  'clockwork': { category: 'Movement', id: 2396, label: 'Clock Like' },
  'conveyor belt': { category: 'Movement', id: 2397, label: 'Conveyor Belt' },
  'factory': { category: 'Movement', id: 2397, label: 'Conveyor Belt' },
  'industrial': { category: 'Movement', id: 2400, label: 'Industry / Machinery' },
  'machinery': { category: 'Movement', id: 2400, label: 'Industry / Machinery' },
  'mechanical': { category: 'Movement', id: 2405, label: 'Mechanical / Robotic' },
  'robotic': { category: 'Movement', id: 2405, label: 'Mechanical / Robotic' },
  'robot': { category: 'Movement', id: 2405, label: 'Mechanical / Robotic' },
  'insistent': { category: 'Movement', id: 2401, label: 'Insistent' },
  'persistent': { category: 'Movement', id: 2401, label: 'Insistent' },
  'relentless': { category: 'Movement', id: 2401, label: 'Insistent' },
  'lilting': { category: 'Movement', id: 2402, label: 'Lilting' },
  'swaying': { category: 'Movement', id: 2402, label: 'Lilting' },
  'lumbering': { category: 'Movement', id: 2403, label: 'Lumbering / Plodding' },
  'plodding': { category: 'Movement', id: 2403, label: 'Lumbering / Plodding' },
  'trudging': { category: 'Movement', id: 2403, label: 'Lumbering / Plodding' },
  'marching': { category: 'Movement', id: 2404, label: 'Marching' },
  'march': { category: 'Movement', id: 2404, label: 'Marching' },
  'military march': { category: 'Movement', id: 2404, label: 'Marching' },
  'ponderous': { category: 'Movement', id: 2406, label: 'Ponderous / Heavy' },
  'heavy movement': { category: 'Movement', id: 2406, label: 'Ponderous / Heavy' },
  'weighty': { category: 'Movement', id: 2406, label: 'Ponderous / Heavy' },
  'pulsing': { category: 'Movement', id: 2407, label: 'Pulsing' },
  'pulsating': { category: 'Movement', id: 2407, label: 'Pulsing' },
  'throbbing': { category: 'Movement', id: 2407, label: 'Pulsing' },
  'repetitive': { category: 'Movement', id: 2408, label: 'Repetitive' },
  'looping': { category: 'Movement', id: 2408, label: 'Repetitive' },
  'hypnotic': { category: 'Movement', id: 2408, label: 'Repetitive' },
  'riding': { category: 'Movement', id: 2409, label: 'Riding / Equestrian' },
  'equestrian': { category: 'Movement', id: 2409, label: 'Riding / Equestrian' },
  'galloping': { category: 'Movement', id: 2409, label: 'Riding / Equestrian' },
  'horse riding': { category: 'Movement', id: 2409, label: 'Riding / Equestrian' },
  'rugged': { category: 'Movement', id: 2410, label: 'Rugged' },
  'rough': { category: 'Movement', id: 2410, label: 'Rugged' },
  'running': { category: 'Movement', id: 2411, label: 'Running' },
  'jogging': { category: 'Movement', id: 2411, label: 'Running' },
  'sprinting': { category: 'Movement', id: 2411, label: 'Running' },
  'shuffle': { category: 'Movement', id: 2412, label: 'Shuffle' },
  'shuffling': { category: 'Movement', id: 2412, label: 'Shuffle' },
  'skipping': { category: 'Movement', id: 2413, label: 'Skipping' },
  'hopping': { category: 'Movement', id: 2413, label: 'Skipping' },
  'speeded up': { category: 'Movement', id: 2414, label: 'Speeded Up / Time Lapse' },
  'time lapse': { category: 'Movement', id: 2414, label: 'Speeded Up / Time Lapse' },
  'timelapse': { category: 'Movement', id: 2414, label: 'Speeded Up / Time Lapse' },
  'fast forward': { category: 'Movement', id: 2414, label: 'Speeded Up / Time Lapse' },
  'stealthy': { category: 'Movement', id: 2415, label: 'Stealthy' },
  'sneaky': { category: 'Movement', id: 2415, label: 'Stealthy' },
  'creeping': { category: 'Movement', id: 2415, label: 'Stealthy' },
  'tiptoeing': { category: 'Movement', id: 2415, label: 'Stealthy' },
  'stomping': { category: 'Movement', id: 2416, label: 'Stomping' },
  'stomp': { category: 'Movement', id: 2416, label: 'Stomping' },
  'stamping': { category: 'Movement', id: 2416, label: 'Stomping' },
  'train like': { category: 'Movement', id: 2417, label: 'Train Like' },
  'locomotive': { category: 'Movement', id: 2417, label: 'Train Like' },
  'chugging': { category: 'Movement', id: 2417, label: 'Train Like' },
  'walking': { category: 'Movement', id: 2418, label: 'Walking' },
  'strolling': { category: 'Movement', id: 2418, label: 'Walking' },

  // Smooth movements
  'smooth': { category: 'Movement', id: 2419, label: 'Smooth' },
  'silky': { category: 'Movement', id: 2419, label: 'Smooth' },
  'aerial': { category: 'Movement', id: 2420, label: 'Aerial / Floating' },
  'floating': { category: 'Movement', id: 2420, label: 'Aerial / Floating' },
  'weightless': { category: 'Movement', id: 2420, label: 'Aerial / Floating' },
  'flying': { category: 'Movement', id: 2421, label: 'Aerial / Flying' },
  'soaring': { category: 'Movement', id: 2421, label: 'Aerial / Flying' },
  'gliding': { category: 'Movement', id: 2421, label: 'Aerial / Flying' },
  'elegant': { category: 'Movement', id: 2422, label: 'Elegant' },
  'refined': { category: 'Movement', id: 2422, label: 'Elegant' },
  'flowing': { category: 'Movement', id: 2423, label: 'Flowing' },
  'fluid': { category: 'Movement', id: 2423, label: 'Flowing' },
  'streaming': { category: 'Movement', id: 2423, label: 'Flowing' },
  'graceful': { category: 'Movement', id: 2424, label: 'Graceful' },
  'ballet': { category: 'Movement', id: 2424, label: 'Graceful' },
  'rising': { category: 'Movement', id: 2425, label: 'Rising' },
  'ascending': { category: 'Movement', id: 2425, label: 'Rising' },
  'climbing': { category: 'Movement', id: 2425, label: 'Rising' },
  'slinky': { category: 'Movement', id: 2426, label: 'Slinky' },
  'sultry': { category: 'Movement', id: 2426, label: 'Slinky' },
  'slow motion': { category: 'Movement', id: 2427, label: 'Slow Motion' },
  'slo mo': { category: 'Movement', id: 2427, label: 'Slow Motion' },
  'slomo': { category: 'Movement', id: 2427, label: 'Slow Motion' },

  // Non-rhythmic
  'non rhythmic': { category: 'Movement', id: 2428, label: 'Non-Rhythmic' },
  'non-rhythmic': { category: 'Movement', id: 2428, label: 'Non-Rhythmic' },
  'arrhythmic': { category: 'Movement', id: 2428, label: 'Non-Rhythmic' },
  'freeform': { category: 'Movement', id: 2428, label: 'Non-Rhythmic' },

  // Character / Texture (verified against facet_taxonomy)
  'acoustic': { category: 'Character', id: 2429, label: 'Acoustic' },
  'unplugged': { category: 'Character', id: 2429, label: 'Acoustic' },
  'organic': { category: 'Character', id: 2429, label: 'Acoustic' },
  'beautiful': { category: 'Character', id: 2430, label: 'Beautiful' },
  'pretty': { category: 'Character', id: 2430, label: 'Beautiful' },
  'lovely': { category: 'Character', id: 2430, label: 'Beautiful' },
  'building': { category: 'Character', id: 2431, label: 'Building' },
  'crescendo': { category: 'Character', id: 2431, label: 'Building' },
  'growing': { category: 'Character', id: 2431, label: 'Building' },
  'childlike': { category: 'Character', id: 2432, label: 'Childlike' },
  'innocent': { category: 'Character', id: 2432, label: 'Childlike' },
  'naive': { category: 'Character', id: 2432, label: 'Childlike' },
  'cool': { category: 'Character', id: 2433, label: 'Cool' },
  'hip': { category: 'Character', id: 2433, label: 'Cool' },
  'trendy': { category: 'Character', id: 2433, label: 'Cool' },
  'drunken': { category: 'Character', id: 2434, label: 'Drunken' },
  'tipsy': { category: 'Character', id: 2434, label: 'Drunken' },
  'woozy': { category: 'Character', id: 2434, label: 'Drunken' },
  'eclectic': { category: 'Character', id: 2435, label: 'Eclectic' },
  'varied': { category: 'Character', id: 2435, label: 'Eclectic' },
  'diverse': { category: 'Character', id: 2435, label: 'Eclectic' },
  'edgy': { category: 'Character', id: 2436, label: 'Edgy' },
  'cutting edge': { category: 'Character', id: 2436, label: 'Edgy' },
  'avant garde': { category: 'Character', id: 2436, label: 'Edgy' },
  'falling': { category: 'Character', id: 2437, label: 'Falling / Descending' },
  'descending': { category: 'Character', id: 2437, label: 'Falling / Descending' },
  'dropping': { category: 'Character', id: 2437, label: 'Falling / Descending' },
  'folksy': { category: 'Character', id: 2438, label: 'Folksy' },
  'homespun': { category: 'Character', id: 2438, label: 'Folksy' },
  'rustic': { category: 'Character', id: 2438, label: 'Folksy' },
  'glamorous': { category: 'Character', id: 2439, label: 'Glamorous / Luxurious' },
  'luxurious': { category: 'Character', id: 2439, label: 'Glamorous / Luxurious' },
  'opulent': { category: 'Character', id: 2439, label: 'Glamorous / Luxurious' },
  'lavish': { category: 'Character', id: 2439, label: 'Glamorous / Luxurious' },
  'glitchy': { category: 'Character', id: 2440, label: 'Glitchy' },
  'glitch': { category: 'Character', id: 2440, label: 'Glitchy' },
  'distorted': { category: 'Character', id: 2440, label: 'Glitchy' },
  'gritty': { category: 'Character', id: 2441, label: 'Gritty' },
  'raw': { category: 'Character', id: 2441, label: 'Gritty' },
  'dirty': { category: 'Character', id: 2441, label: 'Gritty' },
  'lo-fi': { category: 'Character', id: 2441, label: 'Gritty' },
  'lofi': { category: 'Character', id: 2441, label: 'Gritty' },
  'grungy': { category: 'Character', id: 2443, label: 'Grungy' },
  'grunge': { category: 'Character', id: 2443, label: 'Grungy' },
  'heavenly': { category: 'Character', id: 2444, label: 'Heavenly' },
  'angelic': { category: 'Character', id: 2444, label: 'Heavenly' },
  'celestial': { category: 'Character', id: 2444, label: 'Heavenly' },
  'divine': { category: 'Character', id: 2444, label: 'Heavenly' },
  'macho': { category: 'Character', id: 2445, label: 'Macho / Swagger' },
  'swagger': { category: 'Character', id: 2445, label: 'Macho / Swagger' },
  'cocky': { category: 'Character', id: 2445, label: 'Macho / Swagger' },
  'magical': { category: 'Character', id: 2446, label: 'Magical' },
  'enchanting': { category: 'Character', id: 2446, label: 'Magical' },
  'mystical': { category: 'Character', id: 2446, label: 'Magical' },
  'whimsical': { category: 'Character', id: 2446, label: 'Magical' },
  'melodic': { category: 'Character', id: 2447, label: 'Melodic / Lyrical' },
  'lyrical': { category: 'Character', id: 2447, label: 'Melodic / Lyrical' },
  'tuneful': { category: 'Character', id: 2447, label: 'Melodic / Lyrical' },
  'singable': { category: 'Character', id: 2447, label: 'Melodic / Lyrical' },
  'percussive': { category: 'Character', id: 2448, label: 'Percussive' },
  'rhythmic texture': { category: 'Character', id: 2448, label: 'Percussive' },
  'picked': { category: 'Character', id: 2449, label: 'Picked' },
  'fingerpicked': { category: 'Character', id: 2449, label: 'Picked' },
  'plucked': { category: 'Character', id: 2449, label: 'Picked' },
  'pizzicato': { category: 'Character', id: 2450, label: 'Pizzicato' },
  'pizz': { category: 'Character', id: 2450, label: 'Pizzicato' },
  'retro': { category: 'Character', id: 2451, label: 'Retro' },
  // 'vintage' moved to is_a category (Vintage Style is more specific than Retro)
  'throwback': { category: 'Character', id: 2451, label: 'Retro' },
  'old school': { category: 'Character', id: 2451, label: 'Retro' },
  'schmaltzy': { category: 'Character', id: 2453, label: 'Schmaltzy' },
  'cheesy': { category: 'Character', id: 2453, label: 'Schmaltzy' },
  'corny': { category: 'Character', id: 2453, label: 'Schmaltzy' },
  'over the top': { category: 'Character', id: 2453, label: 'Schmaltzy' },
  'slick': { category: 'Character', id: 2454, label: 'Slick / Glossy' },
  'glossy': { category: 'Character', id: 2454, label: 'Slick / Glossy' },
  'polished': { category: 'Character', id: 2454, label: 'Slick / Glossy' },
  'sophisticated': { category: 'Character', id: 2455, label: 'Sophisticated / Classy' },
  'classy': { category: 'Character', id: 2455, label: 'Sophisticated / Classy' },
  'refined character': { category: 'Character', id: 2455, label: 'Sophisticated / Classy' },
  'sparkling': { category: 'Character', id: 2456, label: 'Sparkling' },
  'shimmering': { category: 'Character', id: 2456, label: 'Sparkling' },
  'twinkling': { category: 'Character', id: 2456, label: 'Sparkling' },
  'glittering': { category: 'Character', id: 2456, label: 'Sparkling' },
  'static': { category: 'Character', id: 2457, label: 'Static' },
  'stationary': { category: 'Character', id: 2457, label: 'Static' },
  'unchanging': { category: 'Character', id: 2457, label: 'Static' },
  'strummed': { category: 'Character', id: 2458, label: 'Strummed' },
  'strumming': { category: 'Character', id: 2458, label: 'Strummed' },
  'superhero': { category: 'Character', id: 2459, label: 'Superhero' },
  'heroic character': { category: 'Character', id: 2459, label: 'Superhero' },
  'comic book': { category: 'Character', id: 2459, label: 'Superhero' },
  'swashbuckling': { category: 'Character', id: 2460, label: 'Swashbuckling' },
  'adventurous character': { category: 'Character', id: 2460, label: 'Swashbuckling' },
  'pirate': { category: 'Character', id: 2460, label: 'Swashbuckling' },
  'sweeping': { category: 'Character', id: 2461, label: 'Sweeping' },
  'grand': { category: 'Character', id: 2461, label: 'Sweeping' },
  'expansive': { category: 'Character', id: 2461, label: 'Sweeping' },
  'tv mix': { category: 'Character', id: 2462, label: 'TV Mix' },
  'broadcast mix': { category: 'Character', id: 2462, label: 'TV Mix' },
  'virtuoso': { category: 'Character', id: 3156, label: 'Virtuoso' },
  'virtuosic': { category: 'Character', id: 3156, label: 'Virtuoso' },
  'technical': { category: 'Character', id: 3156, label: 'Virtuoso' },
  'showpiece': { category: 'Character', id: 3156, label: 'Virtuoso' },

  // Sound Effects (verified against facet_taxonomy)
  'sound effects': { category: 'Sound Effects', id: 1002, label: 'Sound Effects' },
  'sfx': { category: 'Sound Effects', id: 1002, label: 'Sound Effects' },
  'sound fx': { category: 'Sound Effects', id: 1002, label: 'Sound Effects' },

  // Alarms & Emergency
  'alarm': { category: 'Sound Effects', id: 1462, label: 'Alarms / Sirens' },
  'alarms': { category: 'Sound Effects', id: 1462, label: 'Alarms / Sirens' },
  'siren': { category: 'Sound Effects', id: 1462, label: 'Alarms / Sirens' },
  'sirens': { category: 'Sound Effects', id: 1462, label: 'Alarms / Sirens' },

  // Animals
  'animal sounds': { category: 'Sound Effects', id: 1463, label: 'Animal' },
  'barnyard': { category: 'Sound Effects', id: 1464, label: 'Animals, Barnyard' },
  'farm animals': { category: 'Sound Effects', id: 1464, label: 'Animals, Barnyard' },
  'jungle animals': { category: 'Sound Effects', id: 1465, label: 'Animals, Exotic / Jungle' },
  'exotic animals': { category: 'Sound Effects', id: 1465, label: 'Animals, Exotic / Jungle' },
  'birdsong': { category: 'Sound Effects', id: 1466, label: 'Birdsong' },
  'birds': { category: 'Sound Effects', id: 1466, label: 'Birdsong' },
  'bird sounds': { category: 'Sound Effects', id: 1466, label: 'Birdsong' },
  'cat sound': { category: 'Sound Effects', id: 1467, label: 'Cat' },
  'meow': { category: 'Sound Effects', id: 1467, label: 'Cat' },
  'chickens': { category: 'Sound Effects', id: 1468, label: 'Chickens' },
  'clucking': { category: 'Sound Effects', id: 1468, label: 'Chickens' },
  'dog sound': { category: 'Sound Effects', id: 1469, label: 'Dog' },
  'barking': { category: 'Sound Effects', id: 1469, label: 'Dog' },
  'horse sounds': { category: 'Sound Effects', id: 1470, label: 'Horses' },
  'neighing': { category: 'Sound Effects', id: 1470, label: 'Horses' },
  'rooster': { category: 'Sound Effects', id: 1471, label: 'Rooster / Crowing' },
  'crowing': { category: 'Sound Effects', id: 1471, label: 'Rooster / Crowing' },
  'whale sounds': { category: 'Sound Effects', id: 1472, label: 'Whales' },
  'whale song': { category: 'Sound Effects', id: 1472, label: 'Whales' },

  // Background / Location
  'aerobics': { category: 'Sound Effects', id: 1474, label: 'Aerobics / Keep Fit' },
  'keep fit': { category: 'Sound Effects', id: 1474, label: 'Aerobics / Keep Fit' },
  'radio broadcast': { category: 'Sound Effects', id: 1475, label: 'Broadcast, Radio / TV' },
  'tv broadcast': { category: 'Sound Effects', id: 1475, label: 'Broadcast, Radio / TV' },
  'police radio': { category: 'Sound Effects', id: 1477, label: 'Cops / Police' },
  'cop sounds': { category: 'Sound Effects', id: 1477, label: 'Cops / Police' },
  'hospital sounds': { category: 'Sound Effects', id: 1478, label: 'Hospital' },
  'medical sounds': { category: 'Sound Effects', id: 1478, label: 'Hospital' },
  'martial arts': { category: 'Sound Effects', id: 1479, label: 'Martial Arts / Kung Fu' },
  'kung fu': { category: 'Sound Effects', id: 1479, label: 'Martial Arts / Kung Fu' },
  'military sounds': { category: 'Sound Effects', id: 1480, label: 'Military' },
  'army sounds': { category: 'Sound Effects', id: 1480, label: 'Military' },
  'office sounds': { category: 'Sound Effects', id: 1481, label: 'Office' },
  'office ambience': { category: 'Sound Effects', id: 1481, label: 'Office' },
  'party sounds': { category: 'Sound Effects', id: 1482, label: 'Party Sounds' },
  'celebration sounds': { category: 'Sound Effects', id: 1482, label: 'Party Sounds' },
  'sports fx': { category: 'Sound Effects', id: 1483, label: 'Sports FX' },
  'sports sounds': { category: 'Sound Effects', id: 1483, label: 'Sports FX' },
  'sword fight': { category: 'Sound Effects', id: 1484, label: 'Sword Fight' },
  'swords clashing': { category: 'Sound Effects', id: 1484, label: 'Sword Fight' },

  // Misc sounds
  'bubbles': { category: 'Sound Effects', id: 1485, label: 'Bubbles' },
  'bubbling': { category: 'Sound Effects', id: 1485, label: 'Bubbles' },
  'camera sound': { category: 'Sound Effects', id: 1486, label: 'Camera' },
  'camera shutter': { category: 'Sound Effects', id: 1486, label: 'Camera' },
  'clock ticking': { category: 'Sound Effects', id: 1487, label: 'Clockwork / Grandfather Clock' },
  'grandfather clock': { category: 'Sound Effects', id: 1487, label: 'Clockwork / Grandfather Clock' },
  'comedic fx': { category: 'Sound Effects', id: 1488, label: 'Comedic FX' },
  'comedy sounds': { category: 'Sound Effects', id: 1488, label: 'Comedic FX' },
  'cartoon sounds': { category: 'Sound Effects', id: 1488, label: 'Comedic FX' },
  'video game': { category: 'Sound Effects', id: 1489, label: 'Computer Games' },
  'game sounds': { category: 'Sound Effects', id: 1489, label: 'Computer Games' },
  'arcade sounds': { category: 'Sound Effects', id: 1489, label: 'Computer Games' },
  'cork pop': { category: 'Sound Effects', id: 1490, label: 'Corks Popping' },
  'champagne pop': { category: 'Sound Effects', id: 1490, label: 'Corks Popping' },
  'countdown': { category: 'Sound Effects', id: 1491, label: 'Countdown' },
  'counting down': { category: 'Sound Effects', id: 1491, label: 'Countdown' },
  'diy sounds': { category: 'Sound Effects', id: 1492, label: 'D.I.Y.' },
  'construction sounds': { category: 'Sound Effects', id: 1492, label: 'D.I.Y.' },
  'door sound': { category: 'Sound Effects', id: 1493, label: 'Door' },
  'door slam': { category: 'Sound Effects', id: 1493, label: 'Door' },
  'door creak': { category: 'Sound Effects', id: 1493, label: 'Door' },
  'explosion': { category: 'Sound Effects', id: 1494, label: 'Explosions' },
  'explosions': { category: 'Sound Effects', id: 1494, label: 'Explosions' },
  'blast': { category: 'Sound Effects', id: 1494, label: 'Explosions' },
  'boom': { category: 'Sound Effects', id: 1494, label: 'Explosions' },

  // Fantasy / Sci-Fi
  'sci fi sounds': { category: 'Sound Effects', id: 1495, label: 'Fantasy / Sci Fi Sounds' },
  'fantasy sounds': { category: 'Sound Effects', id: 1495, label: 'Fantasy / Sci Fi Sounds' },
  'electronic sounds': { category: 'Sound Effects', id: 1496, label: 'Electronic Sounds' },
  'synth sounds': { category: 'Sound Effects', id: 1496, label: 'Electronic Sounds' },
  'laboratory': { category: 'Sound Effects', id: 1497, label: 'Laboratory' },
  'lab sounds': { category: 'Sound Effects', id: 1497, label: 'Laboratory' },
  'laser': { category: 'Sound Effects', id: 1498, label: 'Lasers / Zaps' },
  'lasers': { category: 'Sound Effects', id: 1498, label: 'Lasers / Zaps' },
  'zap': { category: 'Sound Effects', id: 1498, label: 'Lasers / Zaps' },
  'zaps': { category: 'Sound Effects', id: 1498, label: 'Lasers / Zaps' },
  'shimmer sound': { category: 'Sound Effects', id: 1499, label: 'Shimmer / Sparkle' },
  'sparkle sound': { category: 'Sound Effects', id: 1499, label: 'Shimmer / Sparkle' },
  'magic sound': { category: 'Sound Effects', id: 1499, label: 'Shimmer / Sparkle' },
  'sonar': { category: 'Sound Effects', id: 1500, label: 'Sonar' },
  'ping': { category: 'Sound Effects', id: 1500, label: 'Sonar' },
  'space sounds': { category: 'Sound Effects', id: 1501, label: 'Space' },
  'spaceship': { category: 'Sound Effects', id: 1501, label: 'Space' },
  'whoosh': { category: 'Sound Effects', id: 1502, label: 'Sweeps / Whooshes' },
  'whooshes': { category: 'Sound Effects', id: 1502, label: 'Sweeps / Whooshes' },
  'sweep': { category: 'Sound Effects', id: 1502, label: 'Sweeps / Whooshes' },
  'sweeps': { category: 'Sound Effects', id: 1502, label: 'Sweeps / Whooshes' },
  'zing': { category: 'Sound Effects', id: 1503, label: 'Zings' },
  'zings': { category: 'Sound Effects', id: 1503, label: 'Zings' },

  // Film / Production
  'film projector': { category: 'Sound Effects', id: 1504, label: 'Film Projector' },
  'projector sound': { category: 'Sound Effects', id: 1504, label: 'Film Projector' },
  'filter sweep': { category: 'Sound Effects', id: 1505, label: 'Filters' },
  'gunshot': { category: 'Sound Effects', id: 1506, label: 'Guns' },
  'gunshots': { category: 'Sound Effects', id: 1506, label: 'Guns' },
  'gun sounds': { category: 'Sound Effects', id: 1506, label: 'Guns' },
  'shooting': { category: 'Sound Effects', id: 1506, label: 'Guns' },

  // Noise / Crackle
  'hiss': { category: 'Sound Effects', id: 1507, label: 'Hiss / Crackle' },
  'crackle': { category: 'Sound Effects', id: 1507, label: 'Hiss / Crackle' },
  'tape hiss': { category: 'Sound Effects', id: 1507, label: 'Hiss / Crackle' },
  'vinyl crackle': { category: 'Sound Effects', id: 1509, label: 'Record Crackle' },
  'record crackle': { category: 'Sound Effects', id: 1509, label: 'Record Crackle' },
  'static': { category: 'Sound Effects', id: 1510, label: 'Static Crackle' },
  'white noise': { category: 'Sound Effects', id: 1510, label: 'Static Crackle' },

  // Horns
  'car horn': { category: 'Sound Effects', id: 1512, label: 'Car Horn' },
  'honking': { category: 'Sound Effects', id: 1512, label: 'Car Horn' },
  'party horn': { category: 'Sound Effects', id: 1513, label: 'Party Horn / Vuvuzela' },
  'vuvuzela': { category: 'Sound Effects', id: 1513, label: 'Party Horn / Vuvuzela' },
  'noisemaker': { category: 'Sound Effects', id: 1513, label: 'Party Horn / Vuvuzela' },

  // Horror
  'horror sounds': { category: 'Sound Effects', id: 1514, label: 'Horror' },
  'creepy sounds': { category: 'Sound Effects', id: 1514, label: 'Horror' },
  'scary sounds': { category: 'Sound Effects', id: 1514, label: 'Horror' },

  // Human sounds
  'human sounds': { category: 'Sound Effects', id: 1515, label: 'Human' },
  'baby sounds': { category: 'Sound Effects', id: 1516, label: 'Baby' },
  'baby crying': { category: 'Sound Effects', id: 1516, label: 'Baby' },
  'breathing': { category: 'Sound Effects', id: 1517, label: 'Breathing' },
  'breath sounds': { category: 'Sound Effects', id: 1517, label: 'Breathing' },
  'crowd sounds': { category: 'Sound Effects', id: 1518, label: 'Crowd' },
  'crowd noise': { category: 'Sound Effects', id: 1518, label: 'Crowd' },
  'audience': { category: 'Sound Effects', id: 1518, label: 'Crowd' },
  'crying': { category: 'Sound Effects', id: 1519, label: 'Crying' },
  'sobbing': { category: 'Sound Effects', id: 1519, label: 'Crying' },
  'finger snap': { category: 'Sound Effects', id: 1520, label: 'Finger Clicks' },
  'finger clicks': { category: 'Sound Effects', id: 1520, label: 'Finger Clicks' },
  'footsteps': { category: 'Sound Effects', id: 1521, label: 'Footsteps' },
  'walking sounds': { category: 'Sound Effects', id: 1521, label: 'Footsteps' },
  'hand claps': { category: 'Sound Effects', id: 1523, label: 'Hand Claps' },
  'clapping': { category: 'Sound Effects', id: 1523, label: 'Hand Claps' },
  'applause': { category: 'Sound Effects', id: 1523, label: 'Hand Claps' },
  'heartbeat': { category: 'Sound Effects', id: 1524, label: 'Heartbeat' },
  'heart beat': { category: 'Sound Effects', id: 1524, label: 'Heartbeat' },
  'heart pounding': { category: 'Sound Effects', id: 1524, label: 'Heartbeat' },
  'laughter': { category: 'Sound Effects', id: 1528, label: 'Laughter' },
  'laughing': { category: 'Sound Effects', id: 1528, label: 'Laughter' },
  'scream': { category: 'Sound Effects', id: 1530, label: 'Scream' },
  'screaming': { category: 'Sound Effects', id: 1530, label: 'Scream' },
  'whisper': { category: 'Sound Effects', id: 1534, label: 'Whisper' },
  'whispering': { category: 'Sound Effects', id: 1534, label: 'Whisper' },

  // Transport / Mechanical
  'airplane': { category: 'Sound Effects', id: 1536, label: 'Airplanes' },
  'airplane sounds': { category: 'Sound Effects', id: 1536, label: 'Airplanes' },
  'jet sounds': { category: 'Sound Effects', id: 1536, label: 'Airplanes' },
  'machine sounds': { category: 'Sound Effects', id: 1537, label: 'Automation / Machinery' },
  'car sounds': { category: 'Sound Effects', id: 1538, label: 'Car' },
  'car engine': { category: 'Sound Effects', id: 1538, label: 'Car' },
  'driving sounds': { category: 'Sound Effects', id: 1538, label: 'Car' },
  'helicopter': { category: 'Sound Effects', id: 1539, label: 'Helicopter' },
  'chopper': { category: 'Sound Effects', id: 1539, label: 'Helicopter' },
  'motorcycle sounds': { category: 'Sound Effects', id: 1540, label: 'Motorcycle' },
  'motorbike': { category: 'Sound Effects', id: 1540, label: 'Motorcycle' },
  'tools sounds': { category: 'Sound Effects', id: 1541, label: 'Tools' },
  'power tools': { category: 'Sound Effects', id: 1541, label: 'Tools' },
  'train sounds': { category: 'Sound Effects', id: 1542, label: 'Train' },
  'train whistle': { category: 'Sound Effects', id: 1542, label: 'Train' },

  // Nature sounds
  'nature sounds': { category: 'Sound Effects', id: 1544, label: 'Nature' },
  'ambient nature': { category: 'Sound Effects', id: 1544, label: 'Nature' },
  'jungle sounds': { category: 'Sound Effects', id: 1545, label: 'Jungle' },
  'rainforest': { category: 'Sound Effects', id: 1545, label: 'Jungle' },
  'rain sounds': { category: 'Sound Effects', id: 1546, label: 'Rain' },
  'raining': { category: 'Sound Effects', id: 1546, label: 'Rain' },
  'running water': { category: 'Sound Effects', id: 1547, label: 'Running Water' },
  'stream': { category: 'Sound Effects', id: 1547, label: 'Running Water' },
  'river sounds': { category: 'Sound Effects', id: 1547, label: 'Running Water' },
  'ocean sounds': { category: 'Sound Effects', id: 1548, label: 'Sea' },
  'sea sounds': { category: 'Sound Effects', id: 1548, label: 'Sea' },
  'waves': { category: 'Sound Effects', id: 1548, label: 'Sea' },
  'beach sounds': { category: 'Sound Effects', id: 1548, label: 'Sea' },
  'storm sounds': { category: 'Sound Effects', id: 1549, label: 'Storm' },
  'thunder': { category: 'Sound Effects', id: 1550, label: 'Thunder' },
  'thunderstorm': { category: 'Sound Effects', id: 1550, label: 'Thunder' },
  'underwater sounds': { category: 'Sound Effects', id: 1551, label: 'Underwater' },
  'wind sounds': { category: 'Sound Effects', id: 1552, label: 'Wind' },
  'windy': { category: 'Sound Effects', id: 1552, label: 'Wind' },
  'breeze': { category: 'Sound Effects', id: 1552, label: 'Wind' },

  // Misc
  'orchestra tuning': { category: 'Sound Effects', id: 1553, label: 'Orchestra Tune Up' },
  'tune up': { category: 'Sound Effects', id: 1553, label: 'Orchestra Tune Up' },
  'radio scan': { category: 'Sound Effects', id: 1556, label: 'Radio Scan' },
  'radio tuning': { category: 'Sound Effects', id: 1556, label: 'Radio Scan' },
  'record scratch': { category: 'Sound Effects', id: 1558, label: 'Record Scratch' },
  'scratch': { category: 'Sound Effects', id: 1558, label: 'Record Scratch' },
  'dj scratch': { category: 'Sound Effects', id: 1558, label: 'Record Scratch' },
  'robot sounds': { category: 'Sound Effects', id: 1559, label: 'Robot' },
  'rocket': { category: 'Sound Effects', id: 1560, label: 'Rocket' },
  'rocket launch': { category: 'Sound Effects', id: 1560, label: 'Rocket' },
  'liftoff': { category: 'Sound Effects', id: 1560, label: 'Rocket' },
  'stereo fx': { category: 'Sound Effects', id: 1561, label: 'Stereo FX' },
  'panning': { category: 'Sound Effects', id: 1561, label: 'Stereo FX' },
  'telephone': { category: 'Sound Effects', id: 1562, label: 'Telephone' },
  'phone ringing': { category: 'Sound Effects', id: 1562, label: 'Telephone' },
  'dial tone': { category: 'Sound Effects', id: 1562, label: 'Telephone' },
  'typewriter': { category: 'Sound Effects', id: 1563, label: 'Typewriter' },
  'typing': { category: 'Sound Effects', id: 1563, label: 'Typewriter' },

  // Musical Form (verified against facet_taxonomy)
  // Classical Forms
  'classical form': { category: 'Musical Form', id: 2463, label: 'Classical Form' },
  'aria': { category: 'Musical Form', id: 2465, label: 'Aria' },
  'cadenza': { category: 'Musical Form', id: 2466, label: 'Cadenza' },
  'cantata': { category: 'Musical Form', id: 2467, label: 'Cantata' },
  'concerto': { category: 'Musical Form', id: 2468, label: 'Concerto' },
  'concerto grosso': { category: 'Musical Form', id: 2469, label: 'Concerto Grosso' },
  'etude': { category: 'Musical Form', id: 2470, label: 'Etude' },
  'fugue': { category: 'Musical Form', id: 2471, label: 'Fugue' },
  'gregorian chant': { category: 'Musical Form', id: 2472, label: 'Gregorian Chant' },
  'gregorian': { category: 'Musical Form', id: 2472, label: 'Gregorian Chant' },
  'chant': { category: 'Musical Form', id: 2472, label: 'Gregorian Chant' },
  'madrigal': { category: 'Musical Form', id: 2473, label: 'Madrigal' },
  'mass': { category: 'Musical Form', id: 2474, label: 'Mass' },
  'requiem': { category: 'Musical Form', id: 2474, label: 'Mass' },
  'opera': { category: 'Musical Form', id: 2475, label: 'Opera' },
  'operatic': { category: 'Musical Form', id: 2475, label: 'Opera' },
  'operetta': { category: 'Musical Form', id: 2476, label: 'Operetta' },
  'oratorio': { category: 'Musical Form', id: 2477, label: 'Oratorio' },
  'overture': { category: 'Musical Form', id: 2478, label: 'Overture' },
  'prelude': { category: 'Musical Form', id: 2479, label: 'Prelude' },
  'rondo': { category: 'Musical Form', id: 2480, label: 'Rondo' },
  'sonata': { category: 'Musical Form', id: 2481, label: 'Sonata' },
  'symphony': { category: 'Musical Form', id: 2482, label: 'Symphony' },
  'symphonic': { category: 'Musical Form', id: 2482, label: 'Symphony' },
  'theme and variation': { category: 'Musical Form', id: 2483, label: 'Theme and Variation' },
  'variations': { category: 'Musical Form', id: 2483, label: 'Theme and Variation' },

  // Ballroom Dance
  'ballroom': { category: 'Musical Form', id: 2484, label: 'Ballroom Dance' },
  'ballroom dance': { category: 'Musical Form', id: 2484, label: 'Ballroom Dance' },
  'beguine': { category: 'Musical Form', id: 2485, label: 'Beguine' },
  'bolero': { category: 'Musical Form', id: 2487, label: 'Bolero' },
  'bossa nova': { category: 'Musical Form', id: 2488, label: 'Bossa Nova' },
  'bossa': { category: 'Musical Form', id: 2488, label: 'Bossa Nova' },
  'cha cha': { category: 'Musical Form', id: 2489, label: 'Cha Cha' },
  'cha-cha': { category: 'Musical Form', id: 2489, label: 'Cha Cha' },
  'chacha': { category: 'Musical Form', id: 2489, label: 'Cha Cha' },
  'charleston': { category: 'Musical Form', id: 2490, label: 'Charleston' },
  'conga line': { category: 'Musical Form', id: 2491, label: 'Conga Line' },
  'foxtrot': { category: 'Musical Form', id: 2492, label: 'Foxtrot' },
  'fox trot': { category: 'Musical Form', id: 2492, label: 'Foxtrot' },
  'habanera': { category: 'Musical Form', id: 2493, label: 'Habanera' },
  'lambada': { category: 'Musical Form', id: 2494, label: 'Lambada' },
  'mambo': { category: 'Musical Form', id: 2495, label: 'Mambo' },
  'merengue': { category: 'Musical Form', id: 2496, label: 'Merengue' },
  'paso doble': { category: 'Musical Form', id: 2498, label: 'Paso Doble' },
  'polka': { category: 'Musical Form', id: 2499, label: 'Polka' },
  'quickstep': { category: 'Musical Form', id: 2500, label: 'Quickstep' },
  'quick step': { category: 'Musical Form', id: 2500, label: 'Quickstep' },
  'rhumba': { category: 'Musical Form', id: 2501, label: 'Rhumba' },
  'rumba': { category: 'Musical Form', id: 2501, label: 'Rhumba' },
  'salsa': { category: 'Musical Form', id: 2502, label: 'Salsa' },
  'samba': { category: 'Musical Form', id: 2503, label: 'Samba' },
  'jitterbug': { category: 'Musical Form', id: 2504, label: 'Swing / Jitterbug / Jive' },
  'jive': { category: 'Musical Form', id: 2504, label: 'Swing / Jitterbug / Jive' },
  'swing dance': { category: 'Musical Form', id: 2504, label: 'Swing / Jitterbug / Jive' },
  'tango': { category: 'Musical Form', id: 2505, label: 'Tango' },
  'two step': { category: 'Musical Form', id: 2506, label: 'Two Step' },
  'waltz': { category: 'Musical Form', id: 2507, label: 'Waltz' },
  'waltzing': { category: 'Musical Form', id: 2507, label: 'Waltz' },

  // Classical Dance
  'classical dance': { category: 'Musical Form', id: 2508, label: 'Classical Dance' },
  'bouree': { category: 'Musical Form', id: 2510, label: 'Bouree' },
  'gavotte': { category: 'Musical Form', id: 2511, label: 'Gavotte' },
  'gigue': { category: 'Musical Form', id: 2512, label: 'Gigue' },
  'jig': { category: 'Musical Form', id: 2512, label: 'Gigue' },
  'mazurka': { category: 'Musical Form', id: 2513, label: 'Mazurka' },
  'minuet': { category: 'Musical Form', id: 2514, label: 'Minuet' },
  'pavane': { category: 'Musical Form', id: 2515, label: 'Pavane' },
  'polonaise': { category: 'Musical Form', id: 2516, label: 'Polonaise' },
  'classical waltz': { category: 'Musical Form', id: 2517, label: 'Waltz, Classical' },

  // Traditional / Ethnic Dance
  'folk dance': { category: 'Musical Form', id: 2518, label: 'Traditional Folk / Ethnic Dance' },
  'ethnic dance': { category: 'Musical Form', id: 2518, label: 'Traditional Folk / Ethnic Dance' },
  'hora': { category: 'Musical Form', id: 2519, label: 'Hora' },
  'baion': { category: 'Musical Form', id: 2521, label: 'Baion' },
  'batucada': { category: 'Musical Form', id: 2522, label: 'Batucada' },
  'bomba': { category: 'Musical Form', id: 2523, label: 'Bomba' },
  'charanga': { category: 'Musical Form', id: 2524, label: 'Charanga' },
  'choro': { category: 'Musical Form', id: 2525, label: 'Choro' },
  'conga': { category: 'Musical Form', id: 2526, label: 'Conga' },
  'cumbia': { category: 'Musical Form', id: 2527, label: 'Cumbia' },
  'fandango': { category: 'Musical Form', id: 2528, label: 'Fandango' },
  'flamenco': { category: 'Musical Form', id: 2529, label: 'Flamenco' },
  'guaguanco': { category: 'Musical Form', id: 2530, label: 'Guaguanco' },
  'guajira': { category: 'Musical Form', id: 2531, label: 'Guajira' },
  'guaracha': { category: 'Musical Form', id: 2532, label: 'Guaracha' },
  'soca': { category: 'Musical Form', id: 2533, label: 'Soca' },
  'solea': { category: 'Musical Form', id: 2534, label: 'Solea' },
  'son': { category: 'Musical Form', id: 2535, label: 'Son' },
  'line dance': { category: 'Musical Form', id: 2536, label: 'Line Dance' },
  'square dance': { category: 'Musical Form', id: 2537, label: 'Square Dance / Hoe Down' },
  'hoe down': { category: 'Musical Form', id: 2537, label: 'Square Dance / Hoe Down' },
  'hoedown': { category: 'Musical Form', id: 2537, label: 'Square Dance / Hoe Down' },

  // Other Dance
  'can can': { category: 'Musical Form', id: 2539, label: 'Can Can' },
  'cancan': { category: 'Musical Form', id: 2539, label: 'Can Can' },
  'go go': { category: 'Musical Form', id: 2540, label: 'Go Go' },
  'soft shoe': { category: 'Musical Form', id: 2542, label: 'Soft Shoe' },
  'tap dance': { category: 'Musical Form', id: 2543, label: 'Tap' },
  'tap dancing': { category: 'Musical Form', id: 2543, label: 'Tap' },
  'twist': { category: 'Musical Form', id: 2544, label: 'Twist' },

  // Other Musical Forms
  'arrangement': { category: 'Musical Form', id: 2546, label: 'Arrangement' },
  'ballad': { category: 'Musical Form', id: 2547, label: 'Ballad' },
  'power ballad': { category: 'Musical Form', id: 2547, label: 'Ballad' },
  'drone': { category: 'Musical Form', id: 2548, label: 'Drone' },
  'drone music': { category: 'Musical Form', id: 2548, label: 'Drone' },
  'fanfare': { category: 'Musical Form', id: 2549, label: 'Fanfare' },
  'trumpet fanfare': { category: 'Musical Form', id: 2549, label: 'Fanfare' },
  'hymn': { category: 'Musical Form', id: 2550, label: 'Hymn' },
  'hymnal': { category: 'Musical Form', id: 2550, label: 'Hymn' },
  'logo': { category: 'Musical Form', id: 2551, label: 'Logo' },
  'audio logo': { category: 'Musical Form', id: 2551, label: 'Logo' },
  'sonic logo': { category: 'Musical Form', id: 2551, label: 'Logo' },
  'loop': { category: 'Musical Form', id: 2552, label: 'Loop / Riff' },
  'riff': { category: 'Musical Form', id: 2552, label: 'Loop / Riff' },
  'lullaby': { category: 'Musical Form', id: 2553, label: 'Lullaby' },
  'lullabye': { category: 'Musical Form', id: 2553, label: 'Lullaby' },
  'nursery rhyme': { category: 'Musical Form', id: 2553, label: 'Lullaby' },
  'remix': { category: 'Musical Form', id: 2555, label: 'Remix' },
  'remixed': { category: 'Musical Form', id: 2555, label: 'Remix' },
  'rhythm track': { category: 'Musical Form', id: 2556, label: 'Rhythm Track' },
  'beat track': { category: 'Musical Form', id: 2556, label: 'Rhythm Track' },

  // Track Type (verified against facet_taxonomy)
  'main': { category: 'Track Type', id: 1869, label: 'Main' },
  'main version': { category: 'Track Type', id: 1869, label: 'Main' },
  'full version': { category: 'Track Type', id: 1869, label: 'Main' },
  'full length': { category: 'Track Type', id: 1869, label: 'Main' },
  'underscore': { category: 'Track Type', id: 1870, label: 'Underscore' },
  'bed': { category: 'Track Type', id: 1870, label: 'Underscore' },
  'music bed': { category: 'Track Type', id: 1870, label: 'Underscore' },
  'background music': { category: 'Track Type', id: 1870, label: 'Underscore' },
  'underbed': { category: 'Track Type', id: 1870, label: 'Underscore' },
  'alternate': { category: 'Track Type', id: 1871, label: 'Alternate' },
  'alt version': { category: 'Track Type', id: 1871, label: 'Alternate' },
  'alternative': { category: 'Track Type', id: 1871, label: 'Alternate' },
  'alt mix': { category: 'Track Type', id: 1871, label: 'Alternate' },
  'link': { category: 'Track Type', id: 1872, label: 'Link' },
  'transition': { category: 'Track Type', id: 1872, label: 'Link' },
  'bumper': { category: 'Track Type', id: 1872, label: 'Link' },
  'sting': { category: 'Track Type', id: 1873, label: 'Sting' },
  'stinger': { category: 'Track Type', id: 1873, label: 'Sting' },
  'hit': { category: 'Track Type', id: 1873, label: 'Sting' },
  'accent': { category: 'Track Type', id: 1873, label: 'Sting' },
  'musical hit': { category: 'Track Type', id: 1873, label: 'Sting' },

  // Key (verified against facet_taxonomy)
  // A keys
  'a major': { category: 'Key', id: 3419, label: 'A Maj' },
  'a maj': { category: 'Key', id: 3419, label: 'A Maj' },
  'a minor': { category: 'Key', id: 3420, label: 'A Min' },
  'a min': { category: 'Key', id: 3420, label: 'A Min' },
  'a sharp major': { category: 'Key', id: 3422, label: 'A# Maj' },
  'a# major': { category: 'Key', id: 3422, label: 'A# Maj' },
  'a# maj': { category: 'Key', id: 3422, label: 'A# Maj' },
  'a sharp minor': { category: 'Key', id: 3423, label: 'A# Min' },
  'a# minor': { category: 'Key', id: 3423, label: 'A# Min' },
  'a# min': { category: 'Key', id: 3423, label: 'A# Min' },
  'a flat major': { category: 'Key', id: 3425, label: 'Ab Maj' },
  'ab major': { category: 'Key', id: 3425, label: 'Ab Maj' },
  'ab maj': { category: 'Key', id: 3425, label: 'Ab Maj' },
  'a flat minor': { category: 'Key', id: 3426, label: 'Ab Min' },
  'ab minor': { category: 'Key', id: 3426, label: 'Ab Min' },
  'ab min': { category: 'Key', id: 3426, label: 'Ab Min' },

  // B keys
  'b major': { category: 'Key', id: 3428, label: 'B Maj' },
  'b maj': { category: 'Key', id: 3428, label: 'B Maj' },
  'b minor': { category: 'Key', id: 3429, label: 'B Min' },
  'b min': { category: 'Key', id: 3429, label: 'B Min' },
  'b flat major': { category: 'Key', id: 3431, label: 'Bb Maj' },
  'bb major': { category: 'Key', id: 3431, label: 'Bb Maj' },
  'bb maj': { category: 'Key', id: 3431, label: 'Bb Maj' },
  'b flat minor': { category: 'Key', id: 3432, label: 'Bb Min' },
  'bb minor': { category: 'Key', id: 3432, label: 'Bb Min' },
  'bb min': { category: 'Key', id: 3432, label: 'Bb Min' },

  // C keys
  'c major': { category: 'Key', id: 3434, label: 'C Maj' },
  'c maj': { category: 'Key', id: 3434, label: 'C Maj' },
  'c minor': { category: 'Key', id: 3435, label: 'C Min' },
  'c min': { category: 'Key', id: 3435, label: 'C Min' },
  'c sharp major': { category: 'Key', id: 3437, label: 'C# Maj' },
  'c# major': { category: 'Key', id: 3437, label: 'C# Maj' },
  'c# maj': { category: 'Key', id: 3437, label: 'C# Maj' },
  'c sharp minor': { category: 'Key', id: 3438, label: 'C# Min' },
  'c# minor': { category: 'Key', id: 3438, label: 'C# Min' },
  'c# min': { category: 'Key', id: 3438, label: 'C# Min' },

  // D keys
  'd major': { category: 'Key', id: 3440, label: 'D Maj' },
  'd maj': { category: 'Key', id: 3440, label: 'D Maj' },
  'd minor': { category: 'Key', id: 3441, label: 'D Min' },
  'd min': { category: 'Key', id: 3441, label: 'D Min' },
  'd sharp major': { category: 'Key', id: 3443, label: 'D# Maj' },
  'd# major': { category: 'Key', id: 3443, label: 'D# Maj' },
  'd# maj': { category: 'Key', id: 3443, label: 'D# Maj' },
  'd sharp minor': { category: 'Key', id: 3444, label: 'D# Min' },
  'd# minor': { category: 'Key', id: 3444, label: 'D# Min' },
  'd# min': { category: 'Key', id: 3444, label: 'D# Min' },
  'd flat major': { category: 'Key', id: 3446, label: 'Db Maj' },
  'db major': { category: 'Key', id: 3446, label: 'Db Maj' },
  'db maj': { category: 'Key', id: 3446, label: 'Db Maj' },
  'd flat minor': { category: 'Key', id: 3447, label: 'Db Min' },
  'db minor': { category: 'Key', id: 3447, label: 'Db Min' },
  'db min': { category: 'Key', id: 3447, label: 'Db Min' },

  // E keys
  'e major': { category: 'Key', id: 3449, label: 'E Maj' },
  'e maj': { category: 'Key', id: 3449, label: 'E Maj' },
  'e minor': { category: 'Key', id: 3450, label: 'E Min' },
  'e min': { category: 'Key', id: 3450, label: 'E Min' },
  'e flat major': { category: 'Key', id: 3452, label: 'Eb Maj' },
  'eb major': { category: 'Key', id: 3452, label: 'Eb Maj' },
  'eb maj': { category: 'Key', id: 3452, label: 'Eb Maj' },
  'e flat minor': { category: 'Key', id: 3453, label: 'Eb Min' },
  'eb minor': { category: 'Key', id: 3453, label: 'Eb Min' },
  'eb min': { category: 'Key', id: 3453, label: 'Eb Min' },

  // F keys
  'f major': { category: 'Key', id: 3455, label: 'F Maj' },
  'f maj': { category: 'Key', id: 3455, label: 'F Maj' },
  'f minor': { category: 'Key', id: 3456, label: 'F Min' },
  'f min': { category: 'Key', id: 3456, label: 'F Min' },
  'f sharp major': { category: 'Key', id: 3458, label: 'F# Maj' },
  'f# major': { category: 'Key', id: 3458, label: 'F# Maj' },
  'f# maj': { category: 'Key', id: 3458, label: 'F# Maj' },
  'f sharp minor': { category: 'Key', id: 3459, label: 'F# Min' },
  'f# minor': { category: 'Key', id: 3459, label: 'F# Min' },
  'f# min': { category: 'Key', id: 3459, label: 'F# Min' },

  // G keys
  'g major': { category: 'Key', id: 3461, label: 'G Maj' },
  'g maj': { category: 'Key', id: 3461, label: 'G Maj' },
  'g minor': { category: 'Key', id: 3462, label: 'G Min' },
  'g min': { category: 'Key', id: 3462, label: 'G Min' },
  'g sharp major': { category: 'Key', id: 3464, label: 'G# Maj' },
  'g# major': { category: 'Key', id: 3464, label: 'G# Maj' },
  'g# maj': { category: 'Key', id: 3464, label: 'G# Maj' },
  'g sharp minor': { category: 'Key', id: 3465, label: 'G# Min' },
  'g# minor': { category: 'Key', id: 3465, label: 'G# Min' },
  'g# min': { category: 'Key', id: 3465, label: 'G# Min' },
  'g flat major': { category: 'Key', id: 3467, label: 'Gb Maj' },
  'gb major': { category: 'Key', id: 3467, label: 'Gb Maj' },
  'gb maj': { category: 'Key', id: 3467, label: 'Gb Maj' },
  'g flat minor': { category: 'Key', id: 3468, label: 'Gb Min' },
  'gb minor': { category: 'Key', id: 3468, label: 'Gb Min' },
  'gb min': { category: 'Key', id: 3468, label: 'Gb Min' },

  // Language (verified against facet_taxonomy)
  // Major world languages
  'english': { category: 'Language', id: 3483, label: 'English' },
  'in english': { category: 'Language', id: 3483, label: 'English' },
  'english vocals': { category: 'Language', id: 3483, label: 'English' },
  'spanish': { category: 'Language', id: 3513, label: 'Spanish' },
  'in spanish': { category: 'Language', id: 3513, label: 'Spanish' },
  'spanish vocals': { category: 'Language', id: 3513, label: 'Spanish' },
  'french': { category: 'Language', id: 3485, label: 'French' },
  'in french': { category: 'Language', id: 3485, label: 'French' },
  'french vocals': { category: 'Language', id: 3485, label: 'French' },
  'german': { category: 'Language', id: 3487, label: 'German' },
  'in german': { category: 'Language', id: 3487, label: 'German' },
  'german vocals': { category: 'Language', id: 3487, label: 'German' },
  'italian': { category: 'Language', id: 3493, label: 'Italian' },
  'in italian': { category: 'Language', id: 3493, label: 'Italian' },
  'italian vocals': { category: 'Language', id: 3493, label: 'Italian' },
  'portuguese': { category: 'Language', id: 3507, label: 'Portuguese' },
  'in portuguese': { category: 'Language', id: 3507, label: 'Portuguese' },
  'portuguese vocals': { category: 'Language', id: 3507, label: 'Portuguese' },
  'dutch': { category: 'Language', id: 3482, label: 'Dutch' },
  'in dutch': { category: 'Language', id: 3482, label: 'Dutch' },
  'russian': { category: 'Language', id: 3509, label: 'Russian' },
  'in russian': { category: 'Language', id: 3509, label: 'Russian' },
  'polish': { category: 'Language', id: 3506, label: 'Polish' },
  'in polish': { category: 'Language', id: 3506, label: 'Polish' },
  'swedish': { category: 'Language', id: 3516, label: 'Swedish' },
  'in swedish': { category: 'Language', id: 3516, label: 'Swedish' },
  'norwegian': { category: 'Language', id: 3505, label: 'Norwegian' },
  'in norwegian': { category: 'Language', id: 3505, label: 'Norwegian' },

  // Asian languages
  'mandarin': { category: 'Language', id: 3479, label: 'Mandarin' },
  'in mandarin': { category: 'Language', id: 3479, label: 'Mandarin' },
  'chinese': { category: 'Language', id: 3479, label: 'Mandarin' },
  'in chinese': { category: 'Language', id: 3479, label: 'Mandarin' },
  'cantonese': { category: 'Language', id: 3477, label: 'Cantonese' },
  'in cantonese': { category: 'Language', id: 3477, label: 'Cantonese' },
  'japanese': { category: 'Language', id: 3494, label: 'Japanese' },
  'in japanese': { category: 'Language', id: 3494, label: 'Japanese' },
  'japanese vocals': { category: 'Language', id: 3494, label: 'Japanese' },
  'korean': { category: 'Language', id: 3497, label: 'Korean' },
  'in korean': { category: 'Language', id: 3497, label: 'Korean' },
  'korean vocals': { category: 'Language', id: 3497, label: 'Korean' },
  'thai': { category: 'Language', id: 3522, label: 'Thai' },
  'in thai': { category: 'Language', id: 3522, label: 'Thai' },
  'vietnamese': { category: 'Language', id: 3526, label: 'Vietnamese' },
  'in vietnamese': { category: 'Language', id: 3526, label: 'Vietnamese' },
  'tagalog': { category: 'Language', id: 3517, label: 'Tagalog' },
  'filipino': { category: 'Language', id: 3517, label: 'Tagalog' },
  'malay': { category: 'Language', id: 3502, label: 'Malay' },
  'mongolian': { category: 'Language', id: 3504, label: 'Mongolian' },
  'tibetan': { category: 'Language', id: 3523, label: 'Tibetan' },

  // South Asian languages
  'hindi': { category: 'Language', id: 3492, label: 'Hindi' },
  'in hindi': { category: 'Language', id: 3492, label: 'Hindi' },
  'hindi vocals': { category: 'Language', id: 3492, label: 'Hindi' },
  'punjabi': { category: 'Language', id: 3508, label: 'Punjabi' },
  'in punjabi': { category: 'Language', id: 3508, label: 'Punjabi' },
  'bengali': { category: 'Language', id: 3474, label: 'Bengali' },
  'in bengali': { category: 'Language', id: 3474, label: 'Bengali' },
  'tamil': { category: 'Language', id: 3519, label: 'Tamil' },
  'in tamil': { category: 'Language', id: 3519, label: 'Tamil' },
  'telugu': { category: 'Language', id: 3521, label: 'Telugu' },
  'gujarati': { category: 'Language', id: 3488, label: 'Gujarati' },
  'marathi': { category: 'Language', id: 3503, label: 'Marathi' },
  'urdu': { category: 'Language', id: 3525, label: 'Urdu' },
  'in urdu': { category: 'Language', id: 3525, label: 'Urdu' },
  'sanskrit': { category: 'Language', id: 3511, label: 'Sanskrit' },

  // Middle Eastern languages
  'arabic': { category: 'Language', id: 3472, label: 'Arabic' },
  'in arabic': { category: 'Language', id: 3472, label: 'Arabic' },
  'arabic vocals': { category: 'Language', id: 3472, label: 'Arabic' },
  'hebrew': { category: 'Language', id: 3491, label: 'Hebrew' },
  'in hebrew': { category: 'Language', id: 3491, label: 'Hebrew' },
  'farsi': { category: 'Language', id: 3484, label: 'Farsi' },
  'persian': { category: 'Language', id: 3484, label: 'Farsi' },
  'in farsi': { category: 'Language', id: 3484, label: 'Farsi' },
  'turkish': { category: 'Language', id: 3524, label: 'Turkish' },
  'in turkish': { category: 'Language', id: 3524, label: 'Turkish' },
  'kurdish': { category: 'Language', id: 3498, label: 'Kurdish' },
  'armenian': { category: 'Language', id: 3473, label: 'Armenian' },

  // African languages
  'swahili': { category: 'Language', id: 3515, label: 'Swahili' },
  'in swahili': { category: 'Language', id: 3515, label: 'Swahili' },
  'zulu': { category: 'Language', id: 3531, label: 'Zulu' },
  'xhosa': { category: 'Language', id: 3528, label: 'Xhosa' },
  'shona': { category: 'Language', id: 3512, label: 'Shona' },
  'afrikaans': { category: 'Language', id: 3470, label: 'Afrikaans' },

  // Celtic & Regional European
  'gaelic': { category: 'Language', id: 3486, label: 'Gaelic' },
  'irish gaelic': { category: 'Language', id: 3486, label: 'Gaelic' },
  'welsh': { category: 'Language', id: 3527, label: 'Welsh' },
  'in welsh': { category: 'Language', id: 3527, label: 'Welsh' },
  'yiddish': { category: 'Language', id: 3530, label: 'Yiddish' },
  'latin': { category: 'Language', id: 3499, label: 'Latin' },
  'in latin': { category: 'Language', id: 3499, label: 'Latin' },
  'albanian': { category: 'Language', id: 3471, label: 'Albanian' },
  'bosnian': { category: 'Language', id: 3475, label: 'Bosnian' },
  'macedonian': { category: 'Language', id: 3501, label: 'Macedonian' },
  'corsican': { category: 'Language', id: 3480, label: 'Corsican' },

  // Pacific & Caribbean
  'hawaiian': { category: 'Language', id: 3489, label: 'Hawaiian' },
  'in hawaiian': { category: 'Language', id: 3489, label: 'Hawaiian' },
  'samoan': { category: 'Language', id: 3510, label: 'Samoan' },
  'tahitian': { category: 'Language', id: 3518, label: 'Tahitian' },
  'creole': { category: 'Language', id: 3481, label: 'Creole' },

  // Lyric Subject (verified against facet_taxonomy)
  // Good Times
  'good times': { category: 'Lyric Subject', id: 1833, label: 'Good Times' },
  'lyrics about fun': { category: 'Lyric Subject', id: 1833, label: 'Good Times' },
  'comedic lyrics': { category: 'Lyric Subject', id: 1834, label: 'Comedic' },
  'funny lyrics': { category: 'Lyric Subject', id: 1834, label: 'Comedic' },
  'humor lyrics': { category: 'Lyric Subject', id: 1834, label: 'Comedic' },
  'friendship lyrics': { category: 'Lyric Subject', id: 1835, label: 'Friendship' },
  'about friendship': { category: 'Lyric Subject', id: 1835, label: 'Friendship' },
  'happiness lyrics': { category: 'Lyric Subject', id: 1836, label: 'Happiness' },
  'about happiness': { category: 'Lyric Subject', id: 1836, label: 'Happiness' },
  'party lyrics': { category: 'Lyric Subject', id: 1837, label: 'Party / Fun' },
  'party song': { category: 'Lyric Subject', id: 1837, label: 'Party / Fun' },
  'fun lyrics': { category: 'Lyric Subject', id: 1837, label: 'Party / Fun' },
  'road trip': { category: 'Lyric Subject', id: 1838, label: 'Road Trip / Traveling' },
  'travel lyrics': { category: 'Lyric Subject', id: 1838, label: 'Road Trip / Traveling' },
  'traveling song': { category: 'Lyric Subject', id: 1838, label: 'Road Trip / Traveling' },

  // Hard Times
  'hard times': { category: 'Lyric Subject', id: 1839, label: 'Hard Times' },
  'adversity': { category: 'Lyric Subject', id: 1840, label: 'Adversity' },
  'struggle lyrics': { category: 'Lyric Subject', id: 1840, label: 'Adversity' },
  'danger lyrics': { category: 'Lyric Subject', id: 1841, label: 'Danger' },
  'about danger': { category: 'Lyric Subject', id: 1841, label: 'Danger' },
  'tragedy lyrics': { category: 'Lyric Subject', id: 1842, label: 'Tragedy' },
  'tragic lyrics': { category: 'Lyric Subject', id: 1842, label: 'Tragedy' },

  // Hope
  'hope lyrics': { category: 'Lyric Subject', id: 1843, label: 'Hope' },
  'about hope': { category: 'Lyric Subject', id: 1843, label: 'Hope' },
  'hopeful lyrics': { category: 'Lyric Subject', id: 1843, label: 'Hope' },
  'inspiration lyrics': { category: 'Lyric Subject', id: 1844, label: 'Inspiration' },
  'inspirational lyrics': { category: 'Lyric Subject', id: 1844, label: 'Inspiration' },
  'motivational lyrics': { category: 'Lyric Subject', id: 1844, label: 'Inspiration' },
  'wishing': { category: 'Lyric Subject', id: 1845, label: 'Wishing For' },
  'dreaming lyrics': { category: 'Lyric Subject', id: 1845, label: 'Wishing For' },

  // Life
  'life lyrics': { category: 'Lyric Subject', id: 1846, label: 'Life' },
  'about life': { category: 'Lyric Subject', id: 1846, label: 'Life' },
  'coming of age': { category: 'Lyric Subject', id: 1847, label: 'Coming Of Age' },
  'growing up': { category: 'Lyric Subject', id: 1847, label: 'Coming Of Age' },
  'lesson learned': { category: 'Lyric Subject', id: 1848, label: 'Lesson Learned' },
  'life lesson': { category: 'Lyric Subject', id: 1848, label: 'Lesson Learned' },
  'quest lyrics': { category: 'Lyric Subject', id: 1849, label: 'Quest' },
  'journey lyrics': { category: 'Lyric Subject', id: 1849, label: 'Quest' },

  // Love
  'love lyrics': { category: 'Lyric Subject', id: 1850, label: 'Love' },
  'about love': { category: 'Lyric Subject', id: 1850, label: 'Love' },
  'love song': { category: 'Lyric Subject', id: 1850, label: 'Love' },
  'true love': { category: 'Lyric Subject', id: 1851, label: 'Finding True Love' },
  'finding love': { category: 'Lyric Subject', id: 1851, label: 'Finding True Love' },
  'sexual tension': { category: 'Lyric Subject', id: 1852, label: 'Sexual Tension' },
  'seductive lyrics': { category: 'Lyric Subject', id: 1852, label: 'Sexual Tension' },
  'sensual lyrics': { category: 'Lyric Subject', id: 1852, label: 'Sexual Tension' },
  'spiritual love': { category: 'Lyric Subject', id: 1853, label: 'Spiritual Love' },
  'divine love': { category: 'Lyric Subject', id: 1853, label: 'Spiritual Love' },
  'heartbreak': { category: 'Lyric Subject', id: 1854, label: 'Thwarted Love' },
  'heartbreak lyrics': { category: 'Lyric Subject', id: 1854, label: 'Thwarted Love' },
  'breakup song': { category: 'Lyric Subject', id: 1854, label: 'Thwarted Love' },
  'unrequited love': { category: 'Lyric Subject', id: 1854, label: 'Thwarted Love' },

  // Painful Emotions
  'painful emotions': { category: 'Lyric Subject', id: 1857, label: 'Painful Emotions' },
  'despair lyrics': { category: 'Lyric Subject', id: 1858, label: 'Despair' },
  'about despair': { category: 'Lyric Subject', id: 1858, label: 'Despair' },
  'loss lyrics': { category: 'Lyric Subject', id: 1859, label: 'Loss' },
  'about loss': { category: 'Lyric Subject', id: 1859, label: 'Loss' },
  'grief lyrics': { category: 'Lyric Subject', id: 1859, label: 'Loss' },
  'separation': { category: 'Lyric Subject', id: 1860, label: 'Separation / Loneliness' },
  'loneliness lyrics': { category: 'Lyric Subject', id: 1860, label: 'Separation / Loneliness' },
  'lonely lyrics': { category: 'Lyric Subject', id: 1860, label: 'Separation / Loneliness' },

  // Triumph / Victory
  'triumph lyrics': { category: 'Lyric Subject', id: 1863, label: 'Triumph / Victory' },
  'victory lyrics': { category: 'Lyric Subject', id: 1863, label: 'Triumph / Victory' },
  'victory song': { category: 'Lyric Subject', id: 1863, label: 'Triumph / Victory' },
  'motivation': { category: 'Lyric Subject', id: 1864, label: 'Motivation' },
  'motivational song': { category: 'Lyric Subject', id: 1864, label: 'Motivation' },
  'overcoming adversity': { category: 'Lyric Subject', id: 1865, label: 'Overcoming Adversity' },
  'overcoming obstacles': { category: 'Lyric Subject', id: 1865, label: 'Overcoming Adversity' },
  'winning lyrics': { category: 'Lyric Subject', id: 1866, label: 'Winning' },
  'winner song': { category: 'Lyric Subject', id: 1866, label: 'Winning' },
  'champion lyrics': { category: 'Lyric Subject', id: 1866, label: 'Winning' },

  // Other subjects
  'work lyrics': { category: 'Lyric Subject', id: 1867, label: 'Work / Job' },
  'job lyrics': { category: 'Lyric Subject', id: 1867, label: 'Work / Job' },
  'about work': { category: 'Lyric Subject', id: 1867, label: 'Work / Job' },
  'about a place': { category: 'Lyric Subject', id: 1862, label: 'Place' },
  'place lyrics': { category: 'Lyric Subject', id: 1862, label: 'Place' },
  'about a person': { category: 'Lyric Subject', id: 1861, label: 'Person / Name' },
  'name song': { category: 'Lyric Subject', id: 1861, label: 'Person / Name' },

  // Common moods (verified against facet_taxonomy)
  // Positive / Happy / Uplifting
  'happy': { category: 'Mood', id: 2235, label: 'Happy' },
  'uplifting': { category: 'Mood', id: 2223, label: 'Uplifting' },
  'cheerful': { category: 'Mood', id: 2240, label: 'Cheerful' },
  'joyful': { category: 'Mood', id: 2245, label: 'Joyous' },
  'joyous': { category: 'Mood', id: 2245, label: 'Joyous' },
  'fun': { category: 'Mood', id: 2243, label: 'Fun' },
  'playful': { category: 'Mood', id: 2248, label: 'Playful' },
  'bouncy': { category: 'Mood', id: 2237, label: 'Bouncy' },
  'bright': { category: 'Mood', id: 2238, label: 'Bright' },
  'optimistic': { category: 'Mood', id: 2229, label: 'Optimistic' },
  'positive': { category: 'Mood', id: 2231, label: 'Positive' },
  'celebratory': { category: 'Mood', id: 2239, label: 'Celebratory' },
  'euphoric': { category: 'Mood', id: 2226, label: 'Euphoric' },
  'excited': { category: 'Mood', id: 2241, label: 'Excited' },
  'exhilarating': { category: 'Mood', id: 2213, label: 'Exhilarating' },
  'feel good': { category: 'Mood', id: 2242, label: 'Feel Good' },
  'lighthearted': { category: 'Mood', id: 2246, label: 'Lighthearted' },
  'perky': { category: 'Mood', id: 2247, label: 'Perky' },
  'boisterous': { category: 'Mood', id: 2236, label: 'Boisterous' },

  // Inspirational / Powerful / Epic
  'epic': { category: 'Mood', id: 2211, label: 'Epic' },
  'powerful': { category: 'Mood', id: 2217, label: 'Powerful' },
  'inspirational': { category: 'Mood', id: 2227, label: 'Inspirational' },
  'inspiring': { category: 'Mood', id: 2227, label: 'Inspirational' },
  'motivational': { category: 'Mood', id: 2228, label: 'Motivational' },
  'triumphant': { category: 'Mood', id: 2221, label: 'Triumphant' },
  'victorious': { category: 'Mood', id: 2222, label: 'Victorious' },
  'heroic': { category: 'Mood', id: 2214, label: 'Heroic' },
  'majestic': { category: 'Mood', id: 2215, label: 'Majestic' },
  'anthemic': { category: 'Mood', id: 2224, label: 'Anthemic' },
  'soaring': { category: 'Mood', id: 2233, label: 'Soaring' },
  'proud': { category: 'Mood', id: 2232, label: 'Proud' },
  'patriotic': { category: 'Mood', id: 2230, label: 'Patriotic' },
  'confident': { category: 'Mood', id: 2207, label: 'Confident' },
  'determined': { category: 'Mood', id: 2209, label: 'Determined' },
  'courageous': { category: 'Mood', id: 2208, label: 'Courageous' },
  'strong': { category: 'Mood', id: 2205, label: 'Strong' },
  'awe inspiring': { category: 'Mood', id: 2225, label: 'Awe Inspiring' },
  'prestigious': { category: 'Mood', id: 2218, label: 'Prestigious' },
  'noble': { category: 'Mood', id: 2330, label: 'Noble' },
  'dignified': { category: 'Mood', id: 2328, label: 'Dignified' },

  // Energetic / Intense / Exciting
  'energetic': { category: 'Mood', id: 2210, label: 'Energetic' },
  'exciting': { category: 'Mood', id: 2212, label: 'Exciting' },
  'intense': { category: 'Mood', id: 2372, label: 'Intense' },
  'dramatic': { category: 'Mood', id: 2366, label: 'Dramatic' },
  'adventurous': { category: 'Mood', id: 2206, label: 'Adventurous' },
  'passionate': { category: 'Mood', id: 2373, label: 'Passionate' },
  'fiery': { category: 'Mood', id: 2371, label: 'Fiery' },
  'relentless': { category: 'Mood', id: 2219, label: 'Relentless' },

  // Aggressive / Angry / Dark
  'aggressive': { category: 'Mood', id: 2367, label: 'Aggressive' },
  'angry': { category: 'Mood', id: 2369, label: 'Angry' },
  'dark': { category: 'Mood', id: 2341, label: 'Dark' },
  'dangerous': { category: 'Mood', id: 2370, label: 'Dangerous' },
  'violent': { category: 'Mood', id: 2375, label: 'Violent' },
  'evil': { category: 'Mood', id: 2344, label: 'Evil' },
  'menacing': { category: 'Mood', id: 2359, label: 'Menacing' },
  'ominous': { category: 'Mood', id: 2361, label: 'Ominous' },
  'agitated': { category: 'Mood', id: 2368, label: 'Agitated' },

  // Scary / Horror / Suspense
  'scary': { category: 'Mood', id: 2356, label: 'Scary' },
  'horror': { category: 'Mood', id: 2358, label: 'Horror' },
  'suspenseful': { category: 'Mood', id: 2353, label: 'Suspenseful' },
  'tense': { category: 'Mood', id: 2354, label: 'Tense' },
  'mysterious': { category: 'Mood', id: 2347, label: 'Mysterious' },
  'eerie': { category: 'Mood', id: 2343, label: 'Eerie' },
  'creepy': { category: 'Mood', id: 2340, label: 'Creepy' },
  'spooky': { category: 'Mood', id: 2350, label: 'Spooky' },
  'frightening': { category: 'Mood', id: 2357, label: 'Frightening' },
  'terrifying': { category: 'Mood', id: 2365, label: 'Terrifying' },
  'nightmarish': { category: 'Mood', id: 2360, label: 'Nightmarish' },
  'supernatural': { category: 'Mood', id: 2352, label: 'Supernatural' },
  'anxious': { category: 'Mood', id: 2336, label: 'Anxious' },
  'nervous': { category: 'Mood', id: 2348, label: 'Nervous' },
  'restless': { category: 'Mood', id: 2349, label: 'Restless' },
  'strange': { category: 'Mood', id: 2351, label: 'Strange' },
  'weird': { category: 'Mood', id: 2355, label: 'Weird' },
  'disturbing': { category: 'Mood', id: 2342, label: 'Disturbing' },

  // Sad / Melancholy / Emotional
  'sad': { category: 'Mood', id: 2323, label: 'Sad' },
  'melancholy': { category: 'Mood', id: 2319, label: 'Melancholy' },
  'melancholic': { category: 'Mood', id: 2319, label: 'Melancholy' },
  'emotional': { category: 'Mood', id: 2329, label: 'Emotional' },
  'bittersweet': { category: 'Mood', id: 2311, label: 'Bittersweet' },
  'heartbroken': { category: 'Mood', id: 2316, label: 'Heartbroken' },
  'lonely': { category: 'Mood', id: 2318, label: 'Lonely' },
  'mournful': { category: 'Mood', id: 2320, label: 'Mournful' },
  'tragic': { category: 'Mood', id: 2324, label: 'Tragic' },
  'depressing': { category: 'Mood', id: 2313, label: 'Depressing' },
  'gloomy': { category: 'Mood', id: 2315, label: 'Gloomy' },
  'poignant': { category: 'Mood', id: 2322, label: 'Poignant' },
  'sentimental': { category: 'Mood', id: 2294, label: 'Sentimental' },
  'nostalgic': { category: 'Mood', id: 2291, label: 'Nostalgic' },
  'reflective': { category: 'Mood', id: 2292, label: 'Reflective' },
  'introspective': { category: 'Mood', id: 2269, label: 'Introspective' },
  'thoughtful': { category: 'Mood', id: 2334, label: 'Thoughtful' },
  'hopeful': { category: 'Mood', id: 2285, label: 'Hopeful' },

  // Calm / Peaceful / Relaxing
  'calm': { category: 'Mood', id: 2266, label: 'Calm' },
  'peaceful': { category: 'Mood', id: 2265, label: 'Peaceful' },
  'relaxed': { category: 'Mood', id: 2275, label: 'Relaxed' },
  'relaxing': { category: 'Mood', id: 2275, label: 'Relaxed' },
  'serene': { category: 'Mood', id: 2276, label: 'Serene' },
  'tranquil': { category: 'Mood', id: 2280, label: 'Tranquil' },
  'soothing': { category: 'Mood', id: 2278, label: 'Soothing' },
  'gentle': { category: 'Mood', id: 2284, label: 'Graceful' },
  'soft': { category: 'Mood', id: 2295, label: 'Soft' },
  'quiet': { category: 'Mood', id: 2274, label: 'Quiet' },
  'sleepy': { category: 'Mood', id: 2277, label: 'Sleepy' },
  'dreamy': { category: 'Mood', id: 2268, label: 'Dreamy' },
  'lazy': { category: 'Mood', id: 2270, label: 'Lazy' },
  'leisurely': { category: 'Mood', id: 2271, label: 'Leisurely' },
  'contented': { category: 'Mood', id: 2267, label: 'Contented' },
  'zen': { category: 'Mood', id: 2281, label: 'Zen / Meditation' },
  'meditative': { category: 'Mood', id: 2281, label: 'Zen / Meditation' },
  'meditation': { category: 'Mood', id: 2281, label: 'Zen / Meditation' },
  'spiritual': { category: 'Mood', id: 2279, label: 'Spiritual' },

  // Romantic / Sensual / Intimate
  'romantic': { category: 'Mood', id: 2293, label: 'Romantic' },
  'sexy': { category: 'Mood', id: 2300, label: 'Sexy' },
  'sensual': { category: 'Mood', id: 2300, label: 'Sexy' },
  'seductive': { category: 'Mood', id: 2306, label: 'Seductive' },
  'intimate': { category: 'Mood', id: 2287, label: 'Intimate' },
  'loving': { category: 'Mood', id: 2290, label: 'Loving' },
  'tender': { category: 'Mood', id: 2282, label: 'Tender' },
  'sweet': { category: 'Mood', id: 2296, label: 'Sweet' },
  'warm': { category: 'Mood', id: 2299, label: 'Warm' },
  'delicate': { category: 'Mood', id: 2283, label: 'Delicate' },
  'graceful': { category: 'Mood', id: 2284, label: 'Graceful' },
  'innocent': { category: 'Mood', id: 2286, label: 'Innocent' },
  'erotic': { category: 'Mood', id: 2302, label: 'Erotic' },
  'flirtatious': { category: 'Mood', id: 2304, label: 'Flirtatious' },
  'sultry': { category: 'Mood', id: 2309, label: 'Sultry' },

  // Cool / Hip / Stylish
  'cool': { category: 'Mood', id: 2301, label: 'Cool' },
  'exotic': { category: 'Mood', id: 2303, label: 'Exotic' },

  // Funny / Quirky / Whimsical
  'funny': { category: 'Mood', id: 2251, label: 'Funny' },
  'comedic': { category: 'Mood', id: 2254, label: 'Comedic' },
  'humorous': { category: 'Mood', id: 2257, label: 'Humorous' },
  'silly': { category: 'Mood', id: 2262, label: 'Silly' },
  'quirky': { category: 'Mood', id: 2261, label: 'Quirky' },
  'whimsical': { category: 'Mood', id: 2263, label: 'Whimsical' },
  'mischievous': { category: 'Mood', id: 2260, label: 'Mischievous' },
  'eccentric': { category: 'Mood', id: 2255, label: 'Eccentric' },
  'wry': { category: 'Mood', id: 2264, label: 'Wry' },
  'campy': { category: 'Mood', id: 2253, label: 'Campy' },

  // Serious / Solemn
  'serious': { category: 'Mood', id: 2325, label: 'Serious' },
  'solemn': { category: 'Mood', id: 2333, label: 'Solemn' },
  'sacred': { category: 'Mood', id: 2331, label: 'Sacred' },

  // Vocals (verified against facet_taxonomy)
  // Gender / Age
  'female vocal': { category: 'Vocals', id: 3037, label: 'Female' },
  'female vocals': { category: 'Vocals', id: 3037, label: 'Female' },
  'female singer': { category: 'Vocals', id: 3037, label: 'Female' },
  'male vocal': { category: 'Vocals', id: 3042, label: 'Male' },
  'male vocals': { category: 'Vocals', id: 3042, label: 'Male' },
  'male singer': { category: 'Vocals', id: 3042, label: 'Male' },
  'child vocal': { category: 'Vocals', id: 3033, label: 'Child' },
  'children vocals': { category: 'Vocals', id: 3033, label: 'Child' },
  'boy vocal': { category: 'Vocals', id: 3034, label: 'Boy' },
  'girl vocal': { category: 'Vocals', id: 3035, label: 'Girl' },

  // Vocal Range
  'soprano': { category: 'Vocals', id: 3039, label: 'Soprano' },
  'mezzo soprano': { category: 'Vocals', id: 3040, label: 'Mezzo Soprano' },
  'alto': { category: 'Vocals', id: 3041, label: 'Alto / Contralto' },
  'contralto': { category: 'Vocals', id: 3041, label: 'Alto / Contralto' },
  'tenor': { category: 'Vocals', id: 3044, label: 'Tenor' },
  'baritone': { category: 'Vocals', id: 3045, label: 'Baritone' },
  'bass vocal': { category: 'Vocals', id: 3046, label: 'Bass' },

  // Vocal Styles
  'a cappella': { category: 'Vocals', id: 3032, label: 'A Cappella' },
  'acappella': { category: 'Vocals', id: 3032, label: 'A Cappella' },
  'crooner': { category: 'Vocals', id: 3036, label: 'Crooner' },
  'crooning': { category: 'Vocals', id: 3036, label: 'Crooner' },
  'scat': { category: 'Vocals', id: 3048, label: 'Scat Singing' },
  'scat singing': { category: 'Vocals', id: 3048, label: 'Scat Singing' },
  'chanting': { category: 'Vocals', id: 3051, label: 'Chanting, Generic' },
  'chant': { category: 'Vocals', id: 3051, label: 'Chanting, Generic' },
  'throat singing': { category: 'Vocals', id: 3047, label: 'Overtone Singing / Throat singing' },
  'overtone singing': { category: 'Vocals', id: 3047, label: 'Overtone Singing / Throat singing' },
  'beatbox': { category: 'Vocals', id: 3052, label: 'Human Beatbox' },
  'beatboxing': { category: 'Vocals', id: 3052, label: 'Human Beatbox' },
  'human beatbox': { category: 'Vocals', id: 3052, label: 'Human Beatbox' },
  'yodeling': { category: 'Vocals', id: 3059, label: 'Yodeling (Alpine)' },
  'yodel': { category: 'Vocals', id: 3059, label: 'Yodeling (Alpine)' },
  'whistling': { category: 'Vocals', id: 3058, label: 'Whistling' },

  // Vocal Types / Effects
  'vocoder': { category: 'Vocals', id: 3049, label: 'Synth Voice / Vocoder' },
  'synth voice': { category: 'Vocals', id: 3049, label: 'Synth Voice / Vocoder' },
  'vocal textures': { category: 'Vocals', id: 3050, label: 'Vocal Textures' },
  'background vocals': { category: 'Vocals', id: 3055, label: 'Vocal Background' },
  'backing vocals': { category: 'Vocals', id: 3055, label: 'Vocal Background' },
  'treated vocal': { category: 'Vocals', id: 3054, label: 'Treated Vocal' },
  'processed vocal': { category: 'Vocals', id: 3054, label: 'Treated Vocal' },
  'vocal shout': { category: 'Vocals', id: 3056, label: 'Vocal Phrase / Shout Out' },
  'shout out': { category: 'Vocals', id: 3056, label: 'Vocal Phrase / Shout Out' },
  'wordless vocal': { category: 'Vocals', id: 3053, label: 'Non Lyric Melody' },
  'non lyric': { category: 'Vocals', id: 3053, label: 'Non Lyric Melody' },
  'ooh': { category: 'Vocals', id: 3053, label: 'Non Lyric Melody' },
  'aah': { category: 'Vocals', id: 3053, label: 'Non Lyric Melody' },

  // Instrumental & Vocal Groupings (verified against facet_taxonomy)
  // Orchestral
  'symphony orchestra': { category: 'Instrumental & Vocal Groupings', id: 1409, label: 'Symphony Orchestra' },
  'symphony': { category: 'Instrumental & Vocal Groupings', id: 1409, label: 'Symphony Orchestra' },
  'full orchestra': { category: 'Instrumental & Vocal Groupings', id: 1409, label: 'Symphony Orchestra' },
  'chamber orchestra': { category: 'Instrumental & Vocal Groupings', id: 1410, label: 'Chamber Orchestra / Small Orchestra' },
  'small orchestra': { category: 'Instrumental & Vocal Groupings', id: 1410, label: 'Chamber Orchestra / Small Orchestra' },
  'string orchestra': { category: 'Instrumental & Vocal Groupings', id: 1431, label: 'String Orchestra' },
  'string quartet': { category: 'Instrumental & Vocal Groupings', id: 1432, label: 'String Quartet' },
  'quartet': { category: 'Instrumental & Vocal Groupings', id: 1432, label: 'String Quartet' },
  'string section': { category: 'Instrumental & Vocal Groupings', id: 1433, label: 'String Section' },
  'strings section': { category: 'Instrumental & Vocal Groupings', id: 1433, label: 'String Section' },
  'palm court': { category: 'Instrumental & Vocal Groupings', id: 1411, label: 'Palm Court / Salon Orchestra' },
  'salon orchestra': { category: 'Instrumental & Vocal Groupings', id: 1411, label: 'Palm Court / Salon Orchestra' },
  'chamber music': { category: 'Instrumental & Vocal Groupings', id: 1412, label: 'Chamber Music / Classical Ensemble' },
  'classical ensemble': { category: 'Instrumental & Vocal Groupings', id: 1412, label: 'Chamber Music / Classical Ensemble' },
  'piano trio': { category: 'Instrumental & Vocal Groupings', id: 1413, label: 'Piano Trio, Classical' },
  'pop orchestra': { category: 'Instrumental & Vocal Groupings', id: 1404, label: 'Pop Orchestra' },

  // Bands
  'big band': { category: 'Instrumental & Vocal Groupings', id: 1417, label: 'Big Band' },
  'jazz band': { category: 'Instrumental & Vocal Groupings', id: 1399, label: 'Jazz Ensemble / Jazz Band' },
  'jazz ensemble': { category: 'Instrumental & Vocal Groupings', id: 1399, label: 'Jazz Ensemble / Jazz Band' },
  'jazz trio': { category: 'Instrumental & Vocal Groupings', id: 1400, label: 'Jazz Trio' },
  'jazz combo': { category: 'Instrumental & Vocal Groupings', id: 1399, label: 'Jazz Ensemble / Jazz Band' },
  'rock band': { category: 'Instrumental & Vocal Groupings', id: 1407, label: 'Rock Band' },
  'power trio': { category: 'Instrumental & Vocal Groupings', id: 1407, label: 'Rock Band' },
  'jam band': { category: 'Instrumental & Vocal Groupings', id: 1398, label: 'Jam Band' },
  'dance band': { category: 'Instrumental & Vocal Groupings', id: 1392, label: 'Dance Band' },
  'bluegrass band': { category: 'Instrumental & Vocal Groupings', id: 1389, label: 'Bluegrass Band' },
  'country band': { category: 'Instrumental & Vocal Groupings', id: 1391, label: 'Country and Western Band' },
  'country western band': { category: 'Instrumental & Vocal Groupings', id: 1391, label: 'Country and Western Band' },
  'ceilidh band': { category: 'Instrumental & Vocal Groupings', id: 1390, label: 'Ceilidh Band' },
  'dixieland band': { category: 'Instrumental & Vocal Groupings', id: 1393, label: 'Dixieland Band' },
  'mariachi band': { category: 'Instrumental & Vocal Groupings', id: 1402, label: 'Mariachi Band' },
  'jug band': { category: 'Instrumental & Vocal Groupings', id: 1401, label: 'Jug Band' },
  'folk group': { category: 'Instrumental & Vocal Groupings', id: 1397, label: 'Folk Group' },
  'one man band': { category: 'Instrumental & Vocal Groupings', id: 1403, label: 'One Man Band' },
  'street musicians': { category: 'Instrumental & Vocal Groupings', id: 1405, label: 'Street Musicians' },
  'walking bass and drums': { category: 'Instrumental & Vocal Groupings', id: 1406, label: 'Walking Bass & Drums' },

  // Brass & Wind Ensembles
  'brass band': { category: 'Instrumental & Vocal Groupings', id: 1418, label: 'Brass Band' },
  'brass section': { category: 'Instrumental & Vocal Groupings', id: 1420, label: 'Brass Section' },
  'brass ensemble': { category: 'Instrumental & Vocal Groupings', id: 1419, label: 'Brass Ensemble' },
  'marching band': { category: 'Instrumental & Vocal Groupings', id: 1422, label: 'Marching Band' },
  'military band': { category: 'Instrumental & Vocal Groupings', id: 1421, label: 'Concert / Military Band' },
  'concert band': { category: 'Instrumental & Vocal Groupings', id: 1421, label: 'Concert / Military Band' },
  'oompah band': { category: 'Instrumental & Vocal Groupings', id: 1423, label: 'Oompah Band' },
  'salvation army band': { category: 'Instrumental & Vocal Groupings', id: 1424, label: 'Salvation Army Band' },
  'bagpipe band': { category: 'Instrumental & Vocal Groupings', id: 1426, label: 'Bagpipe Band' },
  'sax section': { category: 'Instrumental & Vocal Groupings', id: 1427, label: 'Sax Section' },
  'woodwind section': { category: 'Instrumental & Vocal Groupings', id: 1429, label: 'Woodwind Section' },
  'woodwind ensemble': { category: 'Instrumental & Vocal Groupings', id: 1428, label: 'Woodwind Ensemble' },
  'fife and drum': { category: 'Instrumental & Vocal Groupings', id: 1396, label: 'Fife & Drum' },

  // Vocal Groups
  'choir': { category: 'Instrumental & Vocal Groupings', id: 1449, label: 'Chorus' },
  'chorus': { category: 'Instrumental & Vocal Groupings', id: 1449, label: 'Chorus' },
  'a cappella group': { category: 'Instrumental & Vocal Groupings', id: 1446, label: 'A Cappella' },
  'vocal group': { category: 'Instrumental & Vocal Groupings', id: 1461, label: 'Vocal Ensemble' },
  'vocal ensemble': { category: 'Instrumental & Vocal Groupings', id: 1461, label: 'Vocal Ensemble' },
  'barbershop quartet': { category: 'Instrumental & Vocal Groupings', id: 1447, label: 'Barbershop quartet' },
  'barbershop': { category: 'Instrumental & Vocal Groupings', id: 1447, label: 'Barbershop quartet' },
  'boy band': { category: 'Instrumental & Vocal Groupings', id: 1448, label: 'Boy Band' },
  'girl group': { category: 'Instrumental & Vocal Groupings', id: 1458, label: 'Girl Group' },
  'doo wop': { category: 'Instrumental & Vocal Groupings', id: 1457, label: 'Doo Wop Chorus' },
  'doo-wop': { category: 'Instrumental & Vocal Groupings', id: 1457, label: 'Doo Wop Chorus' },
  'doowop': { category: 'Instrumental & Vocal Groupings', id: 1457, label: 'Doo Wop Chorus' },
  'male chorus': { category: 'Instrumental & Vocal Groupings', id: 1453, label: 'Male Chorus' },
  'female chorus': { category: 'Instrumental & Vocal Groupings', id: 1454, label: 'Female Chorus' },
  'mixed chorus': { category: 'Instrumental & Vocal Groupings', id: 1451, label: 'Mixed Chorus' },
  'childrens chorus': { category: 'Instrumental & Vocal Groupings', id: 1455, label: "Children's Chorus" },
  'kids choir': { category: 'Instrumental & Vocal Groupings', id: 1455, label: "Children's Chorus" },
  'heavenly voices': { category: 'Instrumental & Vocal Groupings', id: 1456, label: 'Heavenly Voices' },
  'angelic voices': { category: 'Instrumental & Vocal Groupings', id: 1456, label: 'Heavenly Voices' },
  'cossack choir': { category: 'Instrumental & Vocal Groupings', id: 1452, label: 'Cossack Choir' },
  'operatic chorus': { category: 'Instrumental & Vocal Groupings', id: 1450, label: 'Operatic Chorus' },
  'opera chorus': { category: 'Instrumental & Vocal Groupings', id: 1450, label: 'Operatic Chorus' },
  'synth voices': { category: 'Instrumental & Vocal Groupings', id: 1459, label: 'Synth Voices' },
  'vocal duet': { category: 'Instrumental & Vocal Groupings', id: 1460, label: 'Vocal Duet' },
  'duet': { category: 'Instrumental & Vocal Groupings', id: 1394, label: 'Duet, Instrumental' },

  // Percussion Ensembles
  'percussion ensemble': { category: 'Instrumental & Vocal Groupings', id: 1441, label: 'Percussion Ensemble' },
  'drum ensemble': { category: 'Instrumental & Vocal Groupings', id: 1441, label: 'Percussion Ensemble' },
  'taiko group': { category: 'Instrumental & Vocal Groupings', id: 1440, label: 'Kodo Drummers / Taiko Group' },
  'kodo drummers': { category: 'Instrumental & Vocal Groupings', id: 1440, label: 'Kodo Drummers / Taiko Group' },
  'steel band': { category: 'Instrumental & Vocal Groupings', id: 1442, label: 'Steel Band' },
  'steel drum band': { category: 'Instrumental & Vocal Groupings', id: 1442, label: 'Steel Band' },

  // Other Groupings
  'acoustic': { category: 'Instrumental & Vocal Groupings', id: 1388, label: 'Acoustic' },
  'acoustic group': { category: 'Instrumental & Vocal Groupings', id: 1388, label: 'Acoustic' },
  'electronic ensemble': { category: 'Instrumental & Vocal Groupings', id: 1434, label: 'Electronic' },
  'electronic group': { category: 'Instrumental & Vocal Groupings', id: 1434, label: 'Electronic' },
  'electronic and acoustic': { category: 'Instrumental & Vocal Groupings', id: 1395, label: 'Electronic and Acoustic' },
  'hybrid ensemble': { category: 'Instrumental & Vocal Groupings', id: 1395, label: 'Electronic and Acoustic' },
  'piano accompaniment': { category: 'Instrumental & Vocal Groupings', id: 1415, label: 'Piano Accompaniment' },
  'organ accompaniment': { category: 'Instrumental & Vocal Groupings', id: 1414, label: 'Organ Accompaniment' },
  'sound design': { category: 'Instrumental & Vocal Groupings', id: 1435, label: 'Sound Design' },

  // Music For (verified against facet_taxonomy)
  // Film & TV Genres
  'action': { category: 'Music For', id: 2603, label: 'Action Adventure' },
  'action adventure': { category: 'Music For', id: 2603, label: 'Action Adventure' },
  'action drama': { category: 'Music For', id: 2604, label: 'Action Drama' },
  'horror': { category: 'Music For', id: 2629, label: 'Horror / Thriller' },
  'thriller': { category: 'Music For', id: 2629, label: 'Horror / Thriller' },
  'comedy': { category: 'Music For', id: 2613, label: 'Comedy' },
  'romantic comedy': { category: 'Music For', id: 2638, label: 'Romantic Comedy' },
  'rom com': { category: 'Music For', id: 2638, label: 'Romantic Comedy' },
  'romance': { category: 'Music For', id: 2637, label: 'Romance' },
  'drama': { category: 'Music For', id: 2622, label: 'Human Drama' },
  'documentary': { category: 'Music For', id: 2696, label: 'Documentary' },
  'sci-fi': { category: 'Music For', id: 2639, label: 'Science Fiction' },
  'science fiction': { category: 'Music For', id: 2639, label: 'Science Fiction' },
  'fantasy': { category: 'Music For', id: 2626, label: 'Fantasy Adventure' },
  'western': { category: 'Music For', id: 2644, label: 'Western' },
  'war': { category: 'Music For', id: 2643, label: 'War' },
  'war film': { category: 'Music For', id: 2643, label: 'War' },
  'spy': { category: 'Music For', id: 2624, label: 'Espionage / Spy' },
  'espionage': { category: 'Music For', id: 2624, label: 'Espionage / Spy' },
  'crime': { category: 'Music For', id: 2621, label: 'Crime / Detective / Mystery' },
  'detective': { category: 'Music For', id: 2621, label: 'Crime / Detective / Mystery' },
  'mystery': { category: 'Music For', id: 2621, label: 'Crime / Detective / Mystery' },
  'film noir': { category: 'Music For', id: 2627, label: 'Film Noir' },
  'noir': { category: 'Music For', id: 2627, label: 'Film Noir' },
  'animation': { category: 'Music For', id: 2606, label: 'Animation' },
  'animated': { category: 'Music For', id: 2606, label: 'Animation' },
  'cartoon': { category: 'Music For', id: 2647, label: 'Cartoons' },
  'cartoons': { category: 'Music For', id: 2647, label: 'Cartoons' },
  'musical': { category: 'Music For', id: 2634, label: 'Musical' },
  'broadway': { category: 'Music For', id: 2693, label: 'Musicals / Broadway' },

  // TV Programming
  'news': { category: 'Music For', id: 2659, label: 'News and Current Affairs' },
  'breaking news': { category: 'Music For', id: 2660, label: 'Breaking News / Bulletin' },
  'sports': { category: 'Music For', id: 2670, label: 'Sports' },
  'game show': { category: 'Music For', id: 2651, label: 'Game / Quiz / Variety Show' },
  'quiz show': { category: 'Music For', id: 2651, label: 'Game / Quiz / Variety Show' },
  'reality tv': { category: 'Music For', id: 2667, label: 'Reality TV' },
  'reality': { category: 'Music For', id: 2667, label: 'Reality TV' },
  'sitcom': { category: 'Music For', id: 2668, label: 'Sitcom' },
  'soap opera': { category: 'Music For', id: 2669, label: 'Soap Opera / Telenovela' },
  'talk show': { category: 'Music For', id: 2671, label: 'Talkshow / Entertainment' },
  'late night': { category: 'Music For', id: 2673, label: 'Late Night' },
  'daytime': { category: 'Music For', id: 2672, label: 'Daytime' },

  // Sports
  'football': { category: 'Music For', id: 2686, label: 'Football' },
  'basketball': { category: 'Music For', id: 2681, label: 'Basketball' },
  'baseball': { category: 'Music For', id: 2680, label: 'Baseball' },
  'soccer': { category: 'Music For', id: 2689, label: 'Soccer' },
  'olympics': { category: 'Music For', id: 2688, label: 'Olympics' },
  'racing': { category: 'Music For', id: 2687, label: 'Motor Racing' },
  'extreme sports': { category: 'Music For', id: 2685, label: 'Extreme Sports' },
  'fitness': { category: 'Music For', id: 2684, label: 'Exercise / Fitness' },
  'workout': { category: 'Music For', id: 2684, label: 'Exercise / Fitness' },
  'exercise': { category: 'Music For', id: 2684, label: 'Exercise / Fitness' },

  // Business & Corporate
  'corporate': { category: 'Music For', id: 2601, label: 'Business / Corporate' },
  'business': { category: 'Music For', id: 2601, label: 'Business / Corporate' },
  'technology': { category: 'Music For', id: 2698, label: 'Science / Technology' },
  'tech': { category: 'Music For', id: 2698, label: 'Science / Technology' },
  'science': { category: 'Music For', id: 2698, label: 'Science / Technology' },
  'medical': { category: 'Music For', id: 2733, label: 'Medical / Life Science' },

  // Nature & Environment
  'nature': { category: 'Music For', id: 2699, label: 'Nature / Wildlife / The Elements' },
  'wildlife': { category: 'Music For', id: 2700, label: 'Nature Study / Wildlife' },
  'ocean': { category: 'Music For', id: 2708, label: 'Sea' },
  'sea': { category: 'Music For', id: 2708, label: 'Sea' },
  'underwater': { category: 'Music For', id: 2710, label: 'Underwater' },
  'space': { category: 'Music For', id: 2714, label: 'Space / Outer Space' },
  'outer space': { category: 'Music For', id: 2714, label: 'Space / Outer Space' },
  'aerial': { category: 'Music For', id: 2712, label: 'Aerial / Clouds' },
  'desert': { category: 'Music For', id: 2704, label: 'Hot / Desert' },
  'jungle': { category: 'Music For', id: 2702, label: 'Jungle / Tropical' },
  'tropical': { category: 'Music For', id: 2702, label: 'Jungle / Tropical' },
  'countryside': { category: 'Music For', id: 2707, label: 'Rural / Countryside / Pastoral' },
  'pastoral': { category: 'Music For', id: 2707, label: 'Rural / Countryside / Pastoral' },
  'rural': { category: 'Music For', id: 2707, label: 'Rural / Countryside / Pastoral' },

  // Holidays & Events
  'christmas': { category: 'Music For', id: 2760, label: 'Christmas' },
  'halloween': { category: 'Music For', id: 2755, label: 'Halloween' },
  'thanksgiving': { category: 'Music For', id: 2756, label: 'Thanksgiving' },
  'easter': { category: 'Music For', id: 2752, label: 'Easter' },
  'valentines': { category: 'Music For', id: 2750, label: 'Valentines Day' },
  'valentines day': { category: 'Music For', id: 2750, label: 'Valentines Day' },
  'new year': { category: 'Music For', id: 2749, label: 'New Year' },
  'new years': { category: 'Music For', id: 2749, label: 'New Year' },
  'wedding': { category: 'Music For', id: 2743, label: 'Wedding' },
  'birthday': { category: 'Music For', id: 2739, label: 'Birthday' },
  'funeral': { category: 'Music For', id: 2741, label: 'Funeral' },
  'party': { category: 'Music For', id: 2576, label: 'Party' },

  // Settings & Activities
  'chase': { category: 'Music For', id: 2615, label: 'Chase' },
  'chase scene': { category: 'Music For', id: 2615, label: 'Chase' },
  'fashion': { category: 'Music For', id: 2655, label: 'Fashion / Style' },
  'fashion show': { category: 'Music For', id: 2573, label: 'Fashion Show' },
  'travel': { category: 'Music For', id: 2658, label: 'Travel' },
  'road trip': { category: 'Music For', id: 2582, label: 'Road Trip' },
  'urban': { category: 'Music For', id: 2571, label: 'City / Urban / Human Environment' },
  'city': { category: 'Music For', id: 2571, label: 'City / Urban / Human Environment' },
  'futuristic': { category: 'Music For', id: 2574, label: 'Futuristic' },
  'hollywood': { category: 'Music For', id: 2585, label: 'Hollywood' },
  'las vegas': { category: 'Music For', id: 2586, label: 'Las Vegas' },
  'vegas': { category: 'Music For', id: 2586, label: 'Las Vegas' },
  'casino': { category: 'Music For', id: 2586, label: 'Las Vegas' },

  // Children
  'children': { category: 'Music For', id: 2577, label: 'Children' },
  'kids': { category: 'Music For', id: 2577, label: 'Children' },
  'preschool': { category: 'Music For', id: 2649, label: 'Pre School' },
  'pre school': { category: 'Music For', id: 2649, label: 'Pre School' },

  // Other
  'video game': { category: 'Music For', id: 2589, label: 'Video Games' },
  'video games': { category: 'Music For', id: 2589, label: 'Video Games' },
  'gaming': { category: 'Music For', id: 2589, label: 'Video Games' },
  'awards': { category: 'Music For', id: 2558, label: 'Awards Show' },
  'awards show': { category: 'Music For', id: 2558, label: 'Awards Show' },
  'circus': { category: 'Music For', id: 2567, label: 'Circus / Carnival' },
  'carnival': { category: 'Music For', id: 2568, label: 'Carnival' },
  'magic': { category: 'Music For', id: 2575, label: 'Magic / Illusions' },
  'elevator': { category: 'Music For', id: 2572, label: 'Elevator / On Hold / Retail Background Music' },
  'on hold': { category: 'Music For', id: 2572, label: 'Elevator / On Hold / Retail Background Music' },
  'restaurant': { category: 'Music For', id: 2564, label: 'Restaurant, Upscale' },
  'lounge': { category: 'Music For', id: 2560, label: 'Cocktail Lounge / Bar' },
  'bar': { category: 'Music For', id: 2559, label: 'Bar / Cocktail Lounge / Restaurant' },
  'cocktail': { category: 'Music For', id: 2578, label: 'Cocktail' },

  // Time Period (verified against facet_taxonomy)
  // Decades
  '1920s': { category: 'Time Period', id: 1801, label: '1920s' },
  '20s': { category: 'Time Period', id: 1801, label: '1920s' },
  'twenties': { category: 'Time Period', id: 1801, label: '1920s' },
  'roaring twenties': { category: 'Time Period', id: 1828, label: 'Roaring Twenties' },
  '1930s': { category: 'Time Period', id: 1802, label: '1930s' },
  '30s': { category: 'Time Period', id: 1802, label: '1930s' },
  'thirties': { category: 'Time Period', id: 1802, label: '1930s' },
  '1940s': { category: 'Time Period', id: 1803, label: '1940s' },
  '40s': { category: 'Time Period', id: 1803, label: '1940s' },
  'forties': { category: 'Time Period', id: 1803, label: '1940s' },
  '1950s': { category: 'Time Period', id: 1804, label: '1950s' },
  '50s': { category: 'Time Period', id: 1804, label: '1950s' },
  'fifties': { category: 'Time Period', id: 1804, label: '1950s' },
  '1960s': { category: 'Time Period', id: 1805, label: '1960s' },
  '60s': { category: 'Time Period', id: 1805, label: '1960s' },
  'sixties': { category: 'Time Period', id: 1805, label: '1960s' },
  '1970s': { category: 'Time Period', id: 1806, label: '1970s' },
  '70s': { category: 'Time Period', id: 1806, label: '1970s' },
  'seventies': { category: 'Time Period', id: 1806, label: '1970s' },
  '1980s': { category: 'Time Period', id: 1807, label: '1980s' },
  '80s': { category: 'Time Period', id: 1807, label: '1980s' },
  'eighties': { category: 'Time Period', id: 1807, label: '1980s' },
  '1990s': { category: 'Time Period', id: 1808, label: '1990s' },
  '90s': { category: 'Time Period', id: 1808, label: '1990s' },
  'nineties': { category: 'Time Period', id: 1808, label: '1990s' },
  '2000s': { category: 'Time Period', id: 1809, label: '2000s' },

  // Historical Eras
  'ancient': { category: 'Time Period', id: 1783, label: 'Ancient Civilizations' },
  'ancient egypt': { category: 'Time Period', id: 1784, label: 'Ancient Egypt (3150 BC - 30 BC)' },
  'egyptian': { category: 'Time Period', id: 1784, label: 'Ancient Egypt (3150 BC - 30 BC)' },
  'ancient greece': { category: 'Time Period', id: 1785, label: 'Ancient Greece (750 BC - 146 BC)' },
  'greek': { category: 'Time Period', id: 1785, label: 'Ancient Greece (750 BC - 146 BC)' },
  'ancient rome': { category: 'Time Period', id: 1786, label: 'Ancient Rome (500 BC - 476 AD)' },
  'roman': { category: 'Time Period', id: 1786, label: 'Ancient Rome (500 BC - 476 AD)' },
  'medieval': { category: 'Time Period', id: 1813, label: 'Middle Ages (477 - 1420)' },
  'middle ages': { category: 'Time Period', id: 1813, label: 'Middle Ages (477 - 1420)' },
  'renaissance': { category: 'Time Period', id: 1814, label: 'Renaissance (1420 - 1600)' },
  'baroque': { category: 'Time Period', id: 1815, label: 'Baroque Period (1600 - 1750)' },
  'victorian': { category: 'Time Period', id: 1821, label: 'Victorian Period (1837 - 1901)' },
  'edwardian': { category: 'Time Period', id: 1822, label: 'Edwardian Period (1901 - 1910)' },
  'belle epoque': { category: 'Time Period', id: 1823, label: 'Belle Epoque (1840 - 1910)' },
  'gilded age': { category: 'Time Period', id: 1824, label: 'Gilded Age (1865 - 1890)' },

  // Classical Music Periods
  'classical period': { category: 'Time Period', id: 1816, label: 'Classical Period (1750 - 1830)' },
  'romantic period': { category: 'Time Period', id: 1817, label: 'Romantic Period (1830 - 1900)' },
  'impressionist': { category: 'Time Period', id: 1825, label: 'Impressionist (1870 - 1928)' },

  // Wars & Events
  'world war 1': { category: 'Time Period', id: 1827, label: 'World War 1 (1914 - 1919)' },
  'world war i': { category: 'Time Period', id: 1827, label: 'World War 1 (1914 - 1919)' },
  'ww1': { category: 'Time Period', id: 1827, label: 'World War 1 (1914 - 1919)' },
  'wwi': { category: 'Time Period', id: 1827, label: 'World War 1 (1914 - 1919)' },
  'world war 2': { category: 'Time Period', id: 1830, label: 'World War 2 (1939 - 1945)' },
  'world war ii': { category: 'Time Period', id: 1830, label: 'World War 2 (1939 - 1945)' },
  'ww2': { category: 'Time Period', id: 1830, label: 'World War 2 (1939 - 1945)' },
  'wwii': { category: 'Time Period', id: 1830, label: 'World War 2 (1939 - 1945)' },
  'great depression': { category: 'Time Period', id: 1829, label: 'Great Depression (1929 - 1939)' },
  'cold war': { category: 'Time Period', id: 1831, label: 'Cold War (1946 - 1991)' },
  'vietnam war': { category: 'Time Period', id: 1832, label: 'Vietnam War (1955 - 1975)' },
  'vietnam': { category: 'Time Period', id: 1832, label: 'Vietnam War (1955 - 1975)' },
  'civil war': { category: 'Time Period', id: 1819, label: 'American Civil War (1861 - 1865)' },
  'revolutionary war': { category: 'Time Period', id: 1818, label: 'American Revolutionary War (1775 - 1783)' },
  'industrial revolution': { category: 'Time Period', id: 1820, label: 'Industrial Revolution' },

  // General
  'retro': { category: 'Time Period', id: 1799, label: '20th Century' },
  'modern': { category: 'Time Period', id: 1798, label: 'Modern Era' },
  'prehistoric': { category: 'Time Period', id: 1782, label: 'Prehistoric' },

  // Country & Region (verified against facet_taxonomy)
  // Continents & Major Regions
  'africa': { category: 'Country & Region', id: 1564, label: 'Africa' },
  'african': { category: 'Country & Region', id: 1564, label: 'Africa' },
  'asia': { category: 'Country & Region', id: 1618, label: 'Asia' },
  'asian': { category: 'Country & Region', id: 1618, label: 'Asia' },
  'europe': { category: 'Country & Region', id: 1691, label: 'Europe' },
  'european': { category: 'Country & Region', id: 1691, label: 'Europe' },
  'latin america': { category: 'Country & Region', id: 1658, label: 'Latin America' },
  'latin american': { category: 'Country & Region', id: 1658, label: 'Latin America' },
  'middle east': { category: 'Country & Region', id: 1749, label: 'Middle East' },
  'middle eastern': { category: 'Country & Region', id: 1749, label: 'Middle East' },
  'caribbean': { category: 'Country & Region', id: 1659, label: 'Caribbean / West Indies' },
  'west indies': { category: 'Country & Region', id: 1659, label: 'Caribbean / West Indies' },
  'mediterranean': { category: 'Country & Region', id: 1748, label: 'Mediterranean' },
  'scandinavia': { category: 'Country & Region', id: 1717, label: 'Scandinavia' },
  'scandinavian': { category: 'Country & Region', id: 1717, label: 'Scandinavia' },

  // North America
  'usa': { category: 'Country & Region', id: 1768, label: 'USA' },
  'american': { category: 'Country & Region', id: 1768, label: 'USA' },
  'united states': { category: 'Country & Region', id: 1768, label: 'USA' },
  'canada': { category: 'Country & Region', id: 1767, label: 'Canada' },
  'canadian': { category: 'Country & Region', id: 1767, label: 'Canada' },
  'mexico': { category: 'Country & Region', id: 1674, label: 'Mexico' },
  'mexican': { category: 'Country & Region', id: 1674, label: 'Mexico' },
  'hawaii': { category: 'Country & Region', id: 1771, label: 'Hawaii' },
  'hawaiian': { category: 'Country & Region', id: 1771, label: 'Hawaii' },

  // South America
  'brazil': { category: 'Country & Region', id: 1680, label: 'Brazil' },
  'brazilian': { category: 'Country & Region', id: 1680, label: 'Brazil' },
  'argentina': { category: 'Country & Region', id: 1678, label: 'Argentina' },
  'argentinian': { category: 'Country & Region', id: 1678, label: 'Argentina' },
  'cuba': { category: 'Country & Region', id: 1663, label: 'Cuba' },
  'cuban': { category: 'Country & Region', id: 1663, label: 'Cuba' },
  'jamaica': { category: 'Country & Region', id: 1666, label: 'Jamaica' },
  'jamaican': { category: 'Country & Region', id: 1666, label: 'Jamaica' },
  'puerto rico': { category: 'Country & Region', id: 1667, label: 'Puerto Rico' },

  // Europe
  'uk': { category: 'Country & Region', id: 1720, label: 'United Kingdom' },
  'british': { category: 'Country & Region', id: 1720, label: 'United Kingdom' },
  'england': { category: 'Country & Region', id: 1705, label: 'England' },
  'english': { category: 'Country & Region', id: 1705, label: 'England' },
  'scotland': { category: 'Country & Region', id: 1718, label: 'Scotland' },
  'scottish': { category: 'Country & Region', id: 1718, label: 'Scotland' },
  'ireland': { category: 'Country & Region', id: 1709, label: 'Ireland' },
  'irish': { category: 'Country & Region', id: 1709, label: 'Ireland' },
  'wales': { category: 'Country & Region', id: 1721, label: 'Wales' },
  'welsh': { category: 'Country & Region', id: 1721, label: 'Wales' },
  'france': { category: 'Country & Region', id: 1741, label: 'France' },
  'french': { category: 'Country & Region', id: 1741, label: 'France' },
  'germany': { category: 'Country & Region', id: 1742, label: 'Germany' },
  'german': { category: 'Country & Region', id: 1742, label: 'Germany' },
  'italy': { category: 'Country & Region', id: 1727, label: 'Italy' },
  'italian': { category: 'Country & Region', id: 1727, label: 'Italy' },
  'spain': { category: 'Country & Region', id: 1736, label: 'Spain' },
  'spanish': { category: 'Country & Region', id: 1736, label: 'Spain' },
  'portugal': { category: 'Country & Region', id: 1732, label: 'Portugal' },
  'portuguese': { category: 'Country & Region', id: 1732, label: 'Portugal' },
  'greece': { category: 'Country & Region', id: 1726, label: 'Greece' },
  'russia': { category: 'Country & Region', id: 1700, label: 'Russia / Former USSR' },
  'russian': { category: 'Country & Region', id: 1700, label: 'Russia / Former USSR' },
  'poland': { category: 'Country & Region', id: 1698, label: 'Poland' },
  'polish': { category: 'Country & Region', id: 1698, label: 'Poland' },
  'norway': { category: 'Country & Region', id: 1716, label: 'Norway' },
  'norwegian': { category: 'Country & Region', id: 1716, label: 'Norway' },
  'sweden': { category: 'Country & Region', id: 1719, label: 'Sweden' },
  'swedish': { category: 'Country & Region', id: 1719, label: 'Sweden' },
  'austria': { category: 'Country & Region', id: 1739, label: 'Austria' },
  'austrian': { category: 'Country & Region', id: 1739, label: 'Austria' },
  'netherlands': { category: 'Country & Region', id: 1746, label: 'Netherlands' },
  'dutch': { category: 'Country & Region', id: 1746, label: 'Netherlands' },
  'gypsy': { category: 'Country & Region', id: 1691, label: 'Europe' },
  'romani': { category: 'Country & Region', id: 1691, label: 'Europe' },

  // Asia
  'china': { category: 'Country & Region', id: 1630, label: 'China (Peoples Republic of China)' },
  'chinese': { category: 'Country & Region', id: 1630, label: 'China (Peoples Republic of China)' },
  'japan': { category: 'Country & Region', id: 1631, label: 'Japan' },
  'japanese': { category: 'Country & Region', id: 1631, label: 'Japan' },
  'korea': { category: 'Country & Region', id: 1632, label: 'Korea' },
  'korean': { category: 'Country & Region', id: 1632, label: 'Korea' },
  'india': { category: 'Country & Region', id: 1640, label: 'India' },
  'indian': { category: 'Country & Region', id: 1640, label: 'India' },
  'bollywood': { category: 'Country & Region', id: 1640, label: 'India' },
  'thailand': { category: 'Country & Region', id: 1654, label: 'Thailand' },
  'thai': { category: 'Country & Region', id: 1654, label: 'Thailand' },
  'vietnam': { category: 'Country & Region', id: 1655, label: 'Vietnam' },
  'vietnamese': { category: 'Country & Region', id: 1655, label: 'Vietnam' },
  'indonesia': { category: 'Country & Region', id: 1647, label: 'Indonesia' },
  'indonesian': { category: 'Country & Region', id: 1647, label: 'Indonesia' },
  'bali': { category: 'Country & Region', id: 1644, label: 'Bali' },
  'balinese': { category: 'Country & Region', id: 1644, label: 'Bali' },
  'tibet': { category: 'Country & Region', id: 1637, label: 'Tibet' },
  'tibetan': { category: 'Country & Region', id: 1637, label: 'Tibet' },
  'mongolia': { category: 'Country & Region', id: 1635, label: 'Mongolia' },
  'mongolian': { category: 'Country & Region', id: 1635, label: 'Mongolia' },
  'philippines': { category: 'Country & Region', id: 1652, label: 'Philippines' },

  // Middle East
  'israel': { category: 'Country & Region', id: 1755, label: 'Israel' },
  'israeli': { category: 'Country & Region', id: 1755, label: 'Israel' },
  'turkey': { category: 'Country & Region', id: 1763, label: 'Turkey' },
  'turkish': { category: 'Country & Region', id: 1763, label: 'Turkey' },
  'iran': { category: 'Country & Region', id: 1753, label: 'Iran' },
  'iranian': { category: 'Country & Region', id: 1753, label: 'Iran' },
  'persian': { category: 'Country & Region', id: 1753, label: 'Iran' },
  'arabia': { category: 'Country & Region', id: 1764, label: 'United Arab Emirates' },
  'arabian': { category: 'Country & Region', id: 1749, label: 'Middle East' },
  'arabic': { category: 'Country & Region', id: 1749, label: 'Middle East' },
  'egypt': { category: 'Country & Region', id: 1752, label: 'Egypt' },

  // Africa
  'morocco': { category: 'Country & Region', id: 1592, label: 'Morocco' },
  'moroccan': { category: 'Country & Region', id: 1592, label: 'Morocco' },
  'nigeria': { category: 'Country & Region', id: 1614, label: 'Nigeria' },
  'nigerian': { category: 'Country & Region', id: 1614, label: 'Nigeria' },
  'south africa': { category: 'Country & Region', id: 1599, label: 'South Africa' },
  'south african': { category: 'Country & Region', id: 1599, label: 'South Africa' },
  'ethiopia': { category: 'Country & Region', id: 1576, label: 'Ethiopia' },
  'ethiopian': { category: 'Country & Region', id: 1576, label: 'Ethiopia' },
  'senegal': { category: 'Country & Region', id: 1615, label: 'Senegal' },
  'mali': { category: 'Country & Region', id: 1611, label: 'Mali' },
  'ghana': { category: 'Country & Region', id: 1607, label: 'Ghana' },
  'congo': { category: 'Country & Region', id: 1569, label: 'Democratic Republic of the Congo / DCR (Zaire)' },

  // Oceania
  'australia': { category: 'Country & Region', id: 1775, label: 'Australia' },
  'australian': { category: 'Country & Region', id: 1775, label: 'Australia' },
  'new zealand': { category: 'Country & Region', id: 1778, label: 'New Zealand' },
  'polynesian': { category: 'Country & Region', id: 1774, label: 'Oceania / South Pacific' },
  'pacific islands': { category: 'Country & Region', id: 1774, label: 'Oceania / South Pacific' },
  'tahiti': { category: 'Country & Region', id: 1780, label: 'Tahiti' }
};

/**
 * Fast local parsing without LLM (for common terms)
 * Returns partial result that can be augmented by LLM if needed
 *
 * Uses n-gram matching: checks 3-word phrases, then 2-word, then single words
 */
export function parseQueryLocal(query) {
  const words = query.toLowerCase().split(/\s+/);
  const filters = {};
  const mappings = [];
  const matched = new Set(); // Track which word indices have been matched

  // Check for multi-word phrases first (3-word, then 2-word)
  for (let n = 3; n >= 2; n--) {
    for (let i = 0; i <= words.length - n; i++) {
      // Skip if any word in this range is already matched
      let alreadyMatched = false;
      for (let j = i; j < i + n; j++) {
        if (matched.has(j)) {
          alreadyMatched = true;
          break;
        }
      }
      if (alreadyMatched) continue;

      const phrase = words.slice(i, i + n).join(' ');
      const lookup = QUICK_LOOKUP[phrase];
      if (lookup) {
        const { category, id, label } = lookup;
        if (!filters[category]) {
          filters[category] = [];
        }
        const facetId = `${category}/${id}`;
        if (!filters[category].includes(facetId)) {
          filters[category].push(facetId);
          mappings.push({ term: phrase, category, facet: label, id });
        }
        // Mark all words in this phrase as matched
        for (let j = i; j < i + n; j++) {
          matched.add(j);
        }
      }
    }
  }

  // Then check single words that weren't part of a phrase match
  const unmappedWords = [];
  for (let i = 0; i < words.length; i++) {
    if (matched.has(i)) continue;

    const word = words[i];
    const lookup = QUICK_LOOKUP[word];
    if (lookup) {
      const { category, id, label } = lookup;
      if (!filters[category]) {
        filters[category] = [];
      }
      const facetId = `${category}/${id}`;
      if (!filters[category].includes(facetId)) {
        filters[category].push(facetId);
        mappings.push({ term: word, category, facet: label, id });
      }
      matched.add(i);
    } else {
      unmappedWords.push(word);
    }
  }

  return {
    filters,
    mappings,
    remainingText: unmappedWords.join(' '),
    isComplete: unmappedWords.length === 0,
    confidence: unmappedWords.length === 0 ? 1.0 : mappings.length / words.length
  };
}

/**
 * Hybrid parsing: try local first, fall back to LLM for complex queries
 */
export async function parseQuery(query, options = {}) {
  const { forceLLM = false, localOnly = false } = options;

  // Try local parsing first (fast path)
  if (!forceLLM) {
    const localResult = parseQueryLocal(query);

    // If local parsing handled everything, return immediately
    if (localResult.isComplete || localOnly) {
      return {
        query,
        ...localResult,
        source: 'local',
        latencyMs: 0
      };
    }

    // If we got partial results, we could either:
    // 1. Use local results as-is
    // 2. Augment with LLM for remaining terms
    // For now, if we have good coverage (>50%), use local
    if (localResult.confidence >= 0.5 && !forceLLM) {
      return {
        query,
        ...localResult,
        source: 'local',
        latencyMs: 0
      };
    }
  }

  // Fall back to LLM for complex queries
  const llmResult = await parseQueryToTaxonomy(query);
  return {
    ...llmResult,
    source: 'llm'
  };
}

/**
 * Get taxonomy statistics
 */
export function getTaxonomyStats() {
  const taxonomy = loadTaxonomy();

  const stats = {
    totalCategories: taxonomy.categoryList.length,
    categories: {}
  };

  for (const category of taxonomy.categoryList) {
    stats.categories[category] = taxonomy.compactTaxonomy[category]?.length || 0;
  }

  return stats;
}
