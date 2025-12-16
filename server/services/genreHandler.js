// Handle simple genre queries without calling Claude to avoid rate limiting
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load genre taxonomy
const genreTaxonomy = (() => {
  const csvPath = path.join(__dirname, '..', '..', 'data', 'genre_taxonomy.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  return parse(content, { columns: true });
})();

// Genre disambiguation responses for all top-level master genres
const GENRE_DISAMBIGUATIONS = {
  'rock': {
    message: "Rock covers a lot of ground. What style are you after?",
    subgenres: [
      { name: "Rock", id: "1351" },
      { name: "Alternative Rock", id: "1323" },
      { name: "Classic Rock", id: "1327" },
      { name: "Hard Rock", id: "1336" },
      { name: "Heavy Metal", id: "1338" },
      { name: "Indie", id: "1339" },
      { name: "Punk", id: "1348" },
      { name: "Progressive Rock", id: "1346" },
      { name: "Psychedelic", id: "1347" },
      { name: "Southern Rock", id: "1355" },
      { name: "Surf Rock", id: "1358" },
      { name: "Garage Rock", id: "1332" }
    ]
  },
  'classical': {
    message: "Classical is pretty broad - are you thinking famous composers, modern neo-classical, or something else?",
    subgenres: [
      { name: "Classical", id: "1110" },
      { name: "Classical Arrangement", id: "1113" },
      { name: "Classical Styling", id: "1116" },
      { name: "Neo Classical", id: "1120" },
      { name: "20th Century Classical Style", id: "1111" },
      { name: "Minimalist Style", id: "1118" },
      { name: "Avant Garde", id: "1112" },
      { name: "Classical Fusion", id: "1114" }
    ]
  },
  'jazz': {
    message: "What kind of jazz are you looking for?",
    subgenres: [
      { name: "Jazz", id: "1262" },
      { name: "Big Band", id: "1254" },
      { name: "Bebop", id: "1253" },
      { name: "Smooth Jazz", id: "1270" },
      { name: "Swing", id: "1272" },
      { name: "Latin Jazz", id: "1266" },
      { name: "Jazz Funk", id: "1263" },
      { name: "Fusion", id: "1259" },
      { name: "Dixieland", id: "1256" },
      { name: "Cool Jazz", id: "1255" },
      { name: "Modern Jazz", id: "1267" }
    ]
  },
  'pop': {
    message: "What style of pop are you looking for?",
    subgenres: [
      { name: "Pop", id: "1292" },
      { name: "Contemporary R&B", id: "1288" },
      { name: "Electro Pop", id: "1289" },
      { name: "Indie Pop", id: "1228" },
      { name: "Pop Rock", id: "3535" },
      { name: "Synth Pop", id: "1294" },
      { name: "Britpop", id: "1287" },
      { name: "Orchestral Pop", id: "1291" },
      { name: "Pop Punk", id: "1293" }
    ]
  },
  'hip hop': {
    message: "What style of hip hop are you looking for?",
    subgenres: [
      { name: "Hip Hop", id: "1239" },
      { name: "Trap", id: "3386" },
      { name: "Lo-Fi Hip Hop", id: "3385" },
      { name: "Rap", id: "1247" },
      { name: "Old Skool", id: "1244" },
      { name: "East Coast", id: "1241" },
      { name: "West Coast", id: "1246" },
      { name: "Dirty South", id: "1240" },
      { name: "Gangsta", id: "1242" },
      { name: "Grime", id: "3384" }
    ]
  },
  'hip-hop': {
    message: "What style of hip hop are you looking for?",
    subgenres: [
      { name: "Hip Hop", id: "1239" },
      { name: "Trap", id: "3386" },
      { name: "Lo-Fi Hip Hop", id: "3385" },
      { name: "Rap", id: "1247" },
      { name: "Old Skool", id: "1244" },
      { name: "East Coast", id: "1241" },
      { name: "West Coast", id: "1246" },
      { name: "Dirty South", id: "1240" },
      { name: "Gangsta", id: "1242" },
      { name: "Grime", id: "3384" }
    ]
  },
  'electronic': {
    message: "What type of electronic music are you looking for?",
    subgenres: [
      { name: "Electronica", id: "1136" },
      { name: "House", id: "1144" },
      { name: "Techno", id: "1166" },
      { name: "Ambient", id: "1124" },
      { name: "Drum n Bass / Jungle", id: "1131" },
      { name: "Dubstep", id: "1133" },
      { name: "Trance", id: "1167" },
      { name: "Disco", id: "1130" },
      { name: "Chill Out / Downtempo", id: "1128" },
      { name: "Trip Hop", id: "1168" },
      { name: "Breakbeat", id: "1126" }
    ]
  },
  'electronica': {
    message: "What type of electronica are you looking for?",
    subgenres: [
      { name: "Electronica", id: "1136" },
      { name: "House", id: "1144" },
      { name: "Techno", id: "1166" },
      { name: "Ambient", id: "1124" },
      { name: "Drum n Bass / Jungle", id: "1131" },
      { name: "Dubstep", id: "1133" },
      { name: "Trance", id: "1167" },
      { name: "Disco", id: "1130" },
      { name: "Chill Out / Downtempo", id: "1128" },
      { name: "Trip Hop", id: "1168" },
      { name: "Breakbeat", id: "1126" }
    ]
  },
  'country': {
    message: "What style of country music are you looking for?",
    subgenres: [
      { name: "Country / Western", id: "1207" },
      { name: "Americana", id: "3379" },
      { name: "Alt Country", id: "1205" },
      { name: "Country Pop", id: "1208" },
      { name: "Country Rock", id: "1209" },
      { name: "Bluegrass", id: "1206" },
      { name: "Western / Cowboy", id: "1211" },
      { name: "Western Swing", id: "1212" },
      { name: "Hillbilly", id: "1210" }
    ]
  },
  'blues': {
    message: "What style of blues are you looking for?",
    subgenres: [
      { name: "Blues", id: "1100" },
      { name: "Blues / Rock", id: "1103" },
      { name: "Blues / Jazz", id: "1102" },
      { name: "Rhythm & Blues", id: "1104" },
      { name: "Blues / Folk", id: "1101" },
      { name: "Delta Blues", id: "3374" }
    ]
  },
  'funk': {
    message: "What style of funk are you looking for?",
    subgenres: [
      { name: "Funk", id: "1232" },
      { name: "Classic Soul", id: "1230" },
      { name: "Classic R&B", id: "1229" },
      { name: "Contemporary Soul", id: "1231" },
      { name: "Motown", id: "1234" },
      { name: "Liquid Funk", id: "1233" },
      { name: "Northern Soul", id: "1235" }
    ]
  },
  'soul': {
    message: "What style of soul music are you looking for?",
    subgenres: [
      { name: "Classic Soul", id: "1230" },
      { name: "Contemporary Soul", id: "1231" },
      { name: "Funk", id: "1232" },
      { name: "Classic R&B", id: "1229" },
      { name: "Motown", id: "1234" },
      { name: "Northern Soul", id: "1235" }
    ]
  },
  'r&b': {
    message: "What style of R&B are you looking for?",
    subgenres: [
      { name: "Contemporary R&B", id: "1288" },
      { name: "Classic R&B", id: "1229" },
      { name: "Classic Soul", id: "1230" },
      { name: "Rhythm & Blues", id: "1104" },
      { name: "Funk", id: "1232" },
      { name: "Motown", id: "1234" }
    ]
  },
  'latin': {
    message: "What style of Latin music are you looking for?",
    subgenres: [
      { name: "Latin", id: "1277" },
      { name: "Cuban", id: "1278" },
      { name: "Latin Dance Styles", id: "1279" },
      { name: "Reggaeton", id: "1282" },
      { name: "Tango Nuevo", id: "1283" },
      { name: "Latin House", id: "1280" },
      { name: "Tex Mex / Banda / Norteno", id: "1284" },
      { name: "Miami Sound", id: "1281" }
    ]
  },
  'folk': {
    message: "What type of folk music are you looking for?",
    subgenres: [
      { name: "Contemporary Folk", id: "1170" },
      { name: "Folk Rock", id: "1171" },
      { name: "Folk Song", id: "1172" },
      { name: "New Acoustic", id: "1173" },
      { name: "Traditional American Folk", id: "1369" },
      { name: "Traditional National / Ethnic", id: "1376" },
      { name: "Celtic", id: "1172" },
      { name: "Country Folk", id: "1154" }
    ]
  },
  'world': {
    message: "What type of world music are you looking for?",
    subgenres: [
      { name: "World Beat / Ethnic Stylings", id: "1185" },
      { name: "African Influenced", id: "1186" },
      { name: "Asian Influenced", id: "1187" },
      { name: "Celtic Influenced", id: "1188" },
      { name: "Latin Influenced", id: "1189" },
      { name: "Middle Eastern Influenced", id: "1190" },
      { name: "Global", id: "1191" },
      { name: "Traditional Ethnic Folk", id: "1367" }
    ]
  },
  'orchestral': {
    message: "What type of orchestral music are you looking for?",
    subgenres: [
      { name: "Film Score / Orchestral", id: "1222" },
      { name: "Film Score / Trailer", id: "1224" },
      { name: "Documentary", id: "1223" },
      { name: "Panoramic", id: "1225" },
      { name: "Pastoral", id: "1226" },
      { name: "Orchestral Hybrid", id: "1227" },
      { name: "Orchestral Pop", id: "1291" }
    ]
  },
  'cinematic': {
    message: "What type of cinematic music are you looking for?",
    subgenres: [
      { name: "Film Score / Orchestral", id: "1222" },
      { name: "Film Score / Trailer", id: "1224" },
      { name: "Documentary", id: "1223" },
      { name: "Tension / Suspense", id: "1364" },
      { name: "Panoramic", id: "1225" },
      { name: "Orchestral Hybrid", id: "1227" }
    ]
  },
  'children': {
    message: "What type of children's music are you looking for?",
    subgenres: [
      { name: "Children", id: "1105" },
      { name: "Nursery Rhyme", id: "1107" },
      { name: "Lullaby", id: "1106" },
      { name: "Pre School", id: "1108" },
      { name: "Storytelling", id: "1109" },
      { name: "Kiddie Pop", id: "1290" }
    ]
  },

  // MOOD CATEGORIES
  'happy': {
    message: "What kind of happy mood are you looking for?",
    subgenres: [
      { name: "Happy", id: "2244" },
      { name: "Cheerful", id: "2240" },
      { name: "Upbeat", id: "2250" },
      { name: "Feel Good", id: "2242" },
      { name: "Fun", id: "2243" },
      { name: "Joyous", id: "2245" },
      { name: "Celebratory", id: "2239" },
      { name: "Playful", id: "2248" },
      { name: "Lighthearted", id: "2246" },
      { name: "Bright", id: "2238" }
    ]
  },
  'sad': {
    message: "What type of sad mood are you looking for?",
    subgenres: [
      { name: "Sad", id: "2323" },
      { name: "Melancholy", id: "2319" },
      { name: "Heartbroken", id: "2316" },
      { name: "Lonely", id: "2318" },
      { name: "Depressing", id: "2313" },
      { name: "Mournful", id: "2320" },
      { name: "Bittersweet", id: "2311" },
      { name: "Gloomy", id: "2315" },
      { name: "Tragic", id: "2324" },
      { name: "Blue", id: "2312" }
    ]
  },
  'dramatic': {
    message: "What type of dramatic mood are you looking for?",
    subgenres: [
      { name: "Dramatic", id: "2366" },
      { name: "Intense", id: "2372" },
      { name: "Aggressive", id: "2367" },
      { name: "Passionate", id: "2373" },
      { name: "Dangerous", id: "2370" },
      { name: "Fiery", id: "2371" },
      { name: "Angry", id: "2369" },
      { name: "Agitated", id: "2368" },
      { name: "Violent", id: "2375" }
    ]
  },
  'peaceful': {
    message: "What type of peaceful mood are you looking for?",
    subgenres: [
      { name: "Peaceful", id: "2273" },
      { name: "Calm", id: "2266" },
      { name: "Serene", id: "2276" },
      { name: "Tranquil", id: "2280" },
      { name: "Relaxed", id: "2275" },
      { name: "Soothing", id: "2278" },
      { name: "Zen / Meditation", id: "2281" },
      { name: "Dreamy", id: "2268" },
      { name: "Quiet", id: "2274" },
      { name: "Spiritual", id: "2279" }
    ]
  },
  'uplifting': {
    message: "What type of uplifting mood are you looking for?",
    subgenres: [
      { name: "Uplifting", id: "2234" },
      { name: "Inspirational", id: "2227" },
      { name: "Motivational", id: "2228" },
      { name: "Optimistic", id: "2229" },
      { name: "Positive", id: "2231" },
      { name: "Anthemic", id: "2224" },
      { name: "Soaring", id: "2233" },
      { name: "Awe Inspiring", id: "2225" },
      { name: "Euphoric", id: "2226" },
      { name: "Proud", id: "2232" }
    ]
  },
  'strong': {
    message: "What type of strong/powerful mood are you looking for?",
    subgenres: [
      { name: "Strong", id: "2220" },
      { name: "Powerful", id: "2217" },
      { name: "Epic", id: "2211" },
      { name: "Heroic", id: "2214" },
      { name: "Triumphant", id: "2221" },
      { name: "Majestic", id: "2215" },
      { name: "Confident", id: "2207" },
      { name: "Courageous", id: "2208" },
      { name: "Adventurous", id: "2206" },
      { name: "Exciting", id: "2212" }
    ]
  },
  'dark': {
    message: "What type of dark mood are you looking for?",
    subgenres: [
      { name: "Dark", id: "2341" },
      { name: "Ominous", id: "2361" },
      { name: "Mysterious", id: "2347" },
      { name: "Eerie", id: "2343" },
      { name: "Creepy", id: "2340" },
      { name: "Disturbing", id: "2342" },
      { name: "Suspenseful", id: "2353" },
      { name: "Tense", id: "2354" },
      { name: "Anxious", id: "2336" },
      { name: "Evil", id: "2344" }
    ]
  },
  'scary': {
    message: "What type of scary mood are you looking for?",
    subgenres: [
      { name: "Scary", id: "2363" },
      { name: "Horror", id: "2358" },
      { name: "Frightening", id: "2357" },
      { name: "Terrifying", id: "2365" },
      { name: "Menacing", id: "2359" },
      { name: "Nightmarish", id: "2360" },
      { name: "Panic Stricken", id: "2362" },
      { name: "Shocking", id: "2364" }
    ]
  },
  'funny': {
    message: "What type of funny/humorous mood are you looking for?",
    subgenres: [
      { name: "Funny", id: "2256" },
      { name: "Humorous", id: "2257" },
      { name: "Comedic", id: "2254" },
      { name: "Silly", id: "2262" },
      { name: "Whimsical", id: "2263" },
      { name: "Quirky", id: "2261" },
      { name: "Mischievous", id: "2260" },
      { name: "Eccentric", id: "2255" },
      { name: "Campy", id: "2253" },
      { name: "Madcap", id: "2258" }
    ]
  },
  'romantic': {
    message: "What type of romantic mood are you looking for?",
    subgenres: [
      { name: "Romantic", id: "2293" },
      { name: "Loving", id: "2290" },
      { name: "Tender", id: "2298" },
      { name: "Intimate", id: "2287" },
      { name: "Sentimental", id: "2294" },
      { name: "Sweet", id: "2296" },
      { name: "Warm", id: "2299" },
      { name: "Sexy", id: "2307" },
      { name: "Seductive", id: "2306" },
      { name: "Sultry", id: "2309" }
    ]
  },
  'energetic': {
    message: "What type of energetic mood are you looking for?",
    subgenres: [
      { name: "Energetic", id: "2210" },
      { name: "Exciting", id: "2212" },
      { name: "Exhilarating", id: "2213" },
      { name: "Relentless", id: "2219" },
      { name: "Boisterous", id: "2236" },
      { name: "Bouncy", id: "2237" },
      { name: "Rollicking", id: "2249" },
      { name: "Perky", id: "2247" }
    ]
  },

  // MUSIC FOR CATEGORIES
  'corporate': {
    message: "What type of corporate music are you looking for?",
    subgenres: [
      { name: "Corporate", id: "2001" },
      { name: "Motivational", id: "2007" },
      { name: "Power / Energy", id: "2008" },
      { name: "Bright / Optimistic", id: "2003" },
      { name: "Corporate Pop", id: "2005" },
      { name: "Communication / News", id: "2004" },
      { name: "Science / Technology", id: "2011" },
      { name: "Prestige", id: "2009" },
      { name: "Training / Information", id: "2012" },
      { name: "Luxury", id: "2006" }
    ]
  },
  'documentary': {
    message: "What type of documentary music are you looking for?",
    subgenres: [
      { name: "Documentary", id: "2696" },
      { name: "Nature / Wildlife", id: "2700" },
      { name: "Science Documentary", id: "2728" },
      { name: "Historical Documentary", id: "2032" },
      { name: "Investigation", id: "2623" },
      { name: "Human Interest", id: "2622" },
      { name: "Travel / World Culture", id: "2642" }
    ]
  },
  'trailer': {
    message: "What type of trailer music are you looking for?",
    subgenres: [
      { name: "Film Score / Trailer", id: "1224" },
      { name: "Epic Trailer", id: "2033" },
      { name: "Action Trailer", id: "2645" },
      { name: "Drama Trailer", id: "2606" },
      { name: "Horror Trailer", id: "2610" },
      { name: "Comedy Trailer", id: "2604" },
      { name: "Thriller Trailer", id: "2616" }
    ]
  },
  'trailers': {
    message: "What type of trailer music are you looking for?",
    subgenres: [
      { name: "Film Score / Trailer", id: "1224" },
      { name: "Epic Trailer", id: "2033" },
      { name: "Action Trailer", id: "2645" },
      { name: "Drama Trailer", id: "2606" },
      { name: "Horror Trailer", id: "2610" },
      { name: "Comedy Trailer", id: "2604" },
      { name: "Thriller Trailer", id: "2616" }
    ]
  },
  'sports': {
    message: "What type of sports music are you looking for?",
    subgenres: [
      { name: "Sports", id: "2679" },
      { name: "Sports Arena / Stadium", id: "2680" },
      { name: "Sports Broadcast", id: "2681" },
      { name: "Extreme Sports", id: "2684" },
      { name: "Baseball", id: "2682" },
      { name: "Basketball", id: "2683" },
      { name: "Football", id: "2685" },
      { name: "Golf", id: "2686" },
      { name: "Hockey", id: "2687" },
      { name: "Olympics", id: "2688" }
    ]
  },
  'christmas': {
    message: "What type of Christmas music are you looking for?",
    subgenres: [
      { name: "Christmas", id: "2760" },
      { name: "Christmas Carols", id: "2761" },
      { name: "Traditional Christmas", id: "2768" },
      { name: "Modern Christmas", id: "2765" },
      { name: "Classical Christmas", id: "2764" },
      { name: "Children's Christmas", id: "2762" },
      { name: "Religious Christmas", id: "2767" },
      { name: "Christmas Atmospheres", id: "2763" },
      { name: "Novelty Christmas", id: "2766" },
      { name: "Vocal Christmas", id: "2769" }
    ]
  },
  'holiday': {
    message: "Which holiday are you looking for music for?",
    subgenres: [
      { name: "Christmas", id: "2760" },
      { name: "New Year", id: "2749" },
      { name: "Valentine's Day", id: "2750" },
      { name: "St. Patrick's Day", id: "2751" },
      { name: "Easter", id: "2752" },
      { name: "Halloween", id: "2755" },
      { name: "Thanksgiving", id: "2756" },
      { name: "Hanukkah", id: "2757" },
      { name: "Patriotic Holidays (USA)", id: "2758" }
    ]
  },
  'wedding': {
    message: "What part of the wedding are you looking for music for?",
    subgenres: [
      { name: "Wedding", id: "2743" },
      { name: "Wedding Processional", id: "2745" },
      { name: "Wedding Recessional", id: "2746" },
      { name: "Wedding Reception", id: "2747" },
      { name: "Pre Wedding", id: "2744" }
    ]
  }
};

export function isSimpleGenreQuery(message) {
  const query = message.toLowerCase().trim();
  return GENRE_DISAMBIGUATIONS.hasOwnProperty(query);
}

export function handleGenreDisambiguation(genre) {
  const disambiguation = GENRE_DISAMBIGUATIONS[genre.toLowerCase()];
  if (!disambiguation) return null;

  // Format the response as markdown
  let response = `${disambiguation.message}\n\n`;

  for (const subgenre of disambiguation.subgenres) {
    response += `- **${subgenre.name}**`;
    // Note: We'll need to get track counts from the database for each genre ID
    // For now, just show the genre name
    response += '\n';
  }

  return response;
}

// Check if a message is a disambiguation response (user selecting from options)
export function isDisambiguationResponse(messages) {
  if (messages.length < 2) return false;

  // Check if the last assistant message was a disambiguation prompt
  const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
  if (!lastAssistantMessage) return false;

  const content = lastAssistantMessage.content.toLowerCase();
  return content.includes('what style') ||
         content.includes('what kind') ||
         content.includes('what type') ||
         content.includes('which flavor') ||
         content.includes('what direction');
}

// Handle the user's selection from disambiguation options
export function handleDisambiguationSelection(userResponse, previousAssistantMessage) {
  const response = userResponse.toLowerCase().trim();

  // Extract genre options from the previous assistant message
  // Look for patterns like "**Genre Name**" in the markdown
  const optionMatches = previousAssistantMessage.matchAll(/\*\*([^*]+)\*\*/g);
  const options = [];

  for (const match of optionMatches) {
    const optionText = match[1].trim();
    // Skip the message header options
    if (!optionText.includes('?') && !optionText.includes(':')) {
      options.push(optionText);
    }
  }

  // Try to match user response to one of the options
  let selectedOption = null;
  let selectedGenreId = null;

  // First, check all genre disambiguations to find which master genre we're dealing with
  let masterGenre = null;
  for (const [genre, data] of Object.entries(GENRE_DISAMBIGUATIONS)) {
    if (previousAssistantMessage.includes(data.message)) {
      masterGenre = genre;
      break;
    }
  }

  if (!masterGenre) {
    return null; // Can't determine which disambiguation this was
  }

  const disambiguation = GENRE_DISAMBIGUATIONS[masterGenre];

  // Try exact match first
  for (const subgenre of disambiguation.subgenres) {
    if (subgenre.name.toLowerCase() === response) {
      selectedOption = subgenre.name;
      selectedGenreId = subgenre.id;
      break;
    }
  }

  // Try partial match
  if (!selectedOption) {
    for (const subgenre of disambiguation.subgenres) {
      if (subgenre.name.toLowerCase().includes(response) ||
          response.includes(subgenre.name.toLowerCase())) {
        selectedOption = subgenre.name;
        selectedGenreId = subgenre.id;
        break;
      }
    }
  }

  // Try keyword match (e.g., "garage" matches "Garage Rock")
  if (!selectedOption) {
    for (const subgenre of disambiguation.subgenres) {
      const keywords = subgenre.name.toLowerCase().split(/[\s\/]+/);
      if (keywords.some(keyword => keyword === response || response === keyword)) {
        selectedOption = subgenre.name;
        selectedGenreId = subgenre.id;
        break;
      }
    }
  }

  // Handle numbered selections (e.g., "2" or "the second one")
  if (!selectedOption) {
    const numberMatch = response.match(/(\d+)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth/);
    if (numberMatch) {
      const numbers = {
        'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5,
        'sixth': 6, 'seventh': 7, 'eighth': 8, 'ninth': 9, 'tenth': 10
      };
      const index = numbers[numberMatch[0]] ? numbers[numberMatch[0]] - 1 : parseInt(numberMatch[1]) - 1;
      if (index >= 0 && index < disambiguation.subgenres.length) {
        selectedOption = disambiguation.subgenres[index].name;
        selectedGenreId = disambiguation.subgenres[index].id;
      }
    }
  }

  if (selectedOption && selectedGenreId) {
    return {
      genre: selectedOption,
      genreId: selectedGenreId,
      message: `Looking for ${selectedOption}, here's what I found:`
    };
  }

  return null; // Couldn't match the response to an option
}