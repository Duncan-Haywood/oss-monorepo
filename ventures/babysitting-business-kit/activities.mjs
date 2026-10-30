// Babysitting Business Kit: what to do with the kids. Pure functions, like engine.mjs:
// nothing here touches the network, the clock (callers pass `today`) or storage.
//
//   LIBRARY                 activities written for this kit, tagged by age band, place,
//                           energy, mess, minutes, supplies, screens, quiet time and bedtime
//   FAITH                   an optional set (Bible stories retold simply, prayers, worship
//                           songs, kindness projects), used only when the sitter offers
//                           faith-based activities AND the family asked for them
//   planSit()               a balanced plan for one sit: active, calm, creative, snack,
//                           wind-down, with a supplies checklist; skips anything that
//                           conflicts with a child's allergies or is unsafe for under-3s
//   bagOfTricks()           what the sitter packs for a family
//   planPage()              a printable plan to leave for the parents
//   planRecord(), activitiesForReport()   a saved plan, and the activities done, for a
//                           sit report
//
// A family's beliefs are never an input to anything here except the faith set, and that
// only when the parents asked for it.

import { toMin, fmtMin, daysBetween, expandBookings, DEFAULT_PROFILE } from "./engine.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const NO_WARRANTY = "<strong>No warranty.</strong> Provided free and as-is, without warranty of any kind, express or implied. It is not medical or child-safety advice, and it does not replace the parents' instructions or your own judgment. You are responsible for checking every activity and food against what the parents told you. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.";
const SPONSOR = `<a href="https://github.com/sponsors/Duncan-Haywood" rel="noopener">Support</a> is optional and never changes what the tool does.`;

export const BANDS = ["infant", "toddler", "preschool", "school-age", "tween"];
export const BAND_LABEL = { infant: "Infant (under 1)", toddler: "Toddler (1-2)", preschool: "Preschool (3-5)", "school-age": "School age (6-9)", tween: "Tween (10+)" };
export const KINDS = ["active", "calm", "creative", "snack", "winddown"];
export const KIND_LABEL = { active: "Active", calm: "Calm", creative: "Creative", snack: "Snack", winddown: "Wind-down" };
export const WEATHER = ["nice", "hot", "cold", "rain", "snow"];
export const WEATHER_LABEL = { nice: "Nice out", hot: "Hot", cold: "Cold but dry", rain: "Rainy", snow: "Snow on the ground" };
export const TIMES = ["morning", "afternoon", "evening"];

export function bandOf(months) {
  if (!Number.isFinite(months) || months < 0) return null;
  if (months < 12) return "infant";
  if (months < 36) return "toddler";
  if (months < 72) return "preschool";
  if (months < 120) return "school-age";
  return "tween";
}

// ---------- the library ----------

const CODE = { I: "infant", T: "toddler", P: "preschool", S: "school-age", W: "tween" };
const OUT = ["nice", "hot", "cold"];
// id, title, kind, ages (I T P S W), place (in, out, any), energy 1-3, mess 0-2, minutes,
// supplies, how to run it; extras: quiet, bedtime, screens (needs a screen), allergens,
// small (small parts: never with a child under 3), wx (weathers it suits outdoors),
// when (times of day), safety.
function A(id, title, kind, ages, place, energy, mess, minutes, supplies, how, x = {}) {
  return {
    id, title, kind, ages: ages.split("").map((c) => CODE[c]), place, energy, mess, minutes, supplies, how,
    screenFree: !x.screens, quiet: !!x.quiet, bedtime: !!x.bedtime, allergens: x.allergens || [],
    food: kind === "snack" || !!x.food, smallParts: !!x.small, weather: place === "out" ? x.wx || OUT : null,
    when: x.when || null, safety: x.safety || "", faith: !!x.faith, ref: x.ref || "",
  };
}

const WATER = "Stay within arm's reach of any child near water, even a shallow tub.";
const OVEN = "Only if the parents said the oven or toaster is fine; you handle the hot part.";

export const LIBRARY = [
  // active
  A("freeze-dance", "Freeze dance", "active", "TPSW", "in", 3, 0, 15, ["music player"], "Play music and dance; when it stops, everyone freezes. Wobblers do ten jumping jacks, then they're back in."),
  A("balloon-volley", "Keep the balloon up", "active", "PSW", "in", 3, 0, 15, ["balloon"], "Bat a balloon around the room; it can't touch the floor. Count the hits and try to beat the record.", { allergens: ["latex"], safety: "Pick up every piece of a popped balloon right away." }),
  A("cushion-course", "Cushion obstacle course", "active", "TPSW", "in", 3, 0, 20, ["couch cushions", "blanket", "painter's tape"], "Lay a course: crawl under the blanket, hop across cushions, walk the tape line. Kids redesign it for round two."),
  A("animal-walks", "Animal walks", "active", "TPS", "any", 3, 0, 10, [], "Call out animals and move like them: bear crawl, frog hop, crab walk, flamingo stand, snake slither."),
  A("simon-says", "Simon says", "active", "TPS", "any", 2, 0, 10, [], "Classic rules; let each child have a turn as Simon."),
  A("red-light", "Red light, green light", "active", "PSW", "out", 3, 0, 15, [], "One caller faces away; the others creep on green and freeze on red. Add 'yellow light' for slow motion."),
  A("hopscotch", "Chalk hopscotch", "active", "PSW", "out", 2, 1, 20, ["sidewalk chalk"], "Draw a hopscotch grid and a stone-toss line. Older kids can invent their own grid shape."),
  A("bubble-chase", "Bubble chase", "active", "ITP", "out", 2, 1, 15, ["bubble solution", "bubble wand"], "Blow bubbles for little ones to chase, clap and pop. Babies love watching from a blanket.", { safety: "Keep bubble solution away from mouths and eyes." }),
  A("scavenger-hunt", "Nature scavenger hunt", "active", "PSW", "out", 2, 1, 30, ["paper bag", "paper", "pencil"], "Make a list together (something smooth, a Y-shaped stick, three kinds of leaves, something yellow) and hunt in the yard.", { wx: ["nice", "cold"] }),
  A("tag", "Tag games", "active", "SW", "out", 3, 0, 15, [], "Freeze tag, tunnel tag (crawl under to unfreeze) or shadow tag. Set clear boundaries first."),
  A("hide-seek", "Hide and seek", "active", "PSW", "any", 2, 0, 20, [], "Agree on off-limits rooms first (no closets with locks, no appliances, no outside)."),
  A("kick-target", "Kick at the target", "active", "TPS", "out", 3, 0, 15, ["soft ball", "cones or shoes"], "Set up two shoes as a goal; kick from closer or farther. Count goals."),
  A("sprinkler", "Sprinkler run", "active", "TPS", "out", 3, 1, 20, ["sprinkler or hose", "towels", "swimsuits"], "Run through the sprinkler, with sunscreen on if the parents left it.", { wx: ["hot"], safety: WATER }),
  A("water-play", "Water pouring station", "active", "TP", "out", 2, 2, 20, ["tub of water", "cups", "funnels", "towels"], "Pour, scoop and fill. Add a few toys that sink and float.", { wx: ["hot", "nice"], safety: WATER }),
  A("puddle-walk", "Puddle walk", "active", "TPS", "out", 2, 2, 20, ["rain boots", "raincoats", "towels"], "Walk the block in boots and coats, stomping puddles. Dry clothes waiting by the door.", { wx: ["rain"], safety: "Not in thunder or lightning; go in at the first rumble." }),
  A("snow-fort", "Snow fort", "active", "PSW", "out", 3, 1, 30, ["snow clothes", "buckets"], "Pack buckets of snow into blocks and build a wall. Warm drinks after.", { wx: ["snow"] }),
  A("snow-tracks", "Snow angels and tracks", "active", "TPS", "out", 2, 1, 15, ["snow clothes"], "Make snow angels, then walk funny paths and guess whose footprints are whose.", { wx: ["snow"] }),
  A("dance-party", "Living-room dance party", "active", "TPSW", "in", 3, 0, 15, ["music player"], "Kids take turns choosing a song and leading the moves."),
  A("floor-lava", "The floor is lava", "active", "PSW", "in", 3, 0, 15, ["pillows"], "Scatter pillows as stepping stones; get from one side of the room to the other without touching the floor.", { safety: "Keep it off stairs and away from sharp table corners." }),
  A("bottle-bowling", "Bottle bowling", "active", "TPS", "in", 2, 0, 15, ["empty plastic bottles", "soft ball"], "Set up ten bottles in a triangle and roll the ball. Kids reset the pins."),
  A("crawl-tunnel", "Blanket crawl tunnel", "active", "IT", "in", 2, 0, 10, ["blanket", "two chairs"], "Drape a blanket over two chairs; crawl through and peek out the other end. Cheer each crawl."),
  A("tummy-time", "Tummy time with a toy", "active", "I", "in", 1, 0, 10, ["blanket", "favorite toy"], "Baby on tummy on a blanket, a toy just out of reach, you face to face at their level. Stop when they fuss.", { safety: "Tummy time only while awake and watched." }),
  A("kick-songs", "Kick-and-stretch songs", "active", "I", "in", 1, 0, 10, ["blanket"], "Baby on their back; sing and gently bicycle their legs, clap their hands, stretch arms up high."),
  A("bike-loop", "Bike or scooter loop", "active", "PSW", "out", 3, 0, 30, ["their own helmet", "their own bike or scooter"], "Loops of the driveway or sidewalk, only where the parents said is fine.", { safety: "Helmets on, no street riding unless the parents said so." }),
  A("jump-rope", "Jump rope challenges", "active", "SW", "out", 3, 0, 15, ["jump rope"], "Count jumps, try one foot, try backwards, two people at once."),
  A("catch", "Catch or flying disc", "active", "SW", "out", 2, 0, 20, ["ball or flying disc"], "Count catches in a row; step back after every five."),
  A("relay", "Spoon relay races", "active", "SW", "out", 3, 0, 20, ["spoons", "small potatoes or balls"], "Carry a potato on a spoon to the line and back; tag the next runner."),
  A("hula-hoop", "Hula hoop games", "active", "PSW", "any", 3, 0, 15, ["hula hoop"], "Spin it, jump in and out of it, roll it and race it."),
  A("clue-hunt", "Treasure hunt with clues", "active", "SW", "in", 2, 0, 30, ["paper", "pencil", "small prize"], "Write five rhyming clues that lead room to room; the last one finds the prize. Older kids write one for you."),
  A("sports-day", "Backyard sports day", "active", "SW", "out", 3, 0, 40, ["ball", "jump rope", "chalk"], "Five stations (long jump, ball toss, sprint, hopping race, balance beam on a chalk line); keep a score sheet."),
  A("limbo", "Limbo", "active", "PSW", "in", 2, 0, 10, ["broom handle or rope"], "Two people hold the broom; lower it a notch each round. Music helps."),
  A("pot-band", "Pots-and-pans parade", "active", "TP", "in", 2, 0, 10, ["pots", "wooden spoons"], "March around the house drumming; play loud, then tiny-quiet."),
  // calm
  A("read-aloud", "Read-aloud", "calm", "ITPSW", "any", 1, 0, 20, ["books"], "Each child picks a book; do the voices. Older kids read a page to you.", { quiet: true }),
  A("puzzles", "Puzzles", "calm", "PSW", "in", 1, 0, 20, ["jigsaw puzzle"], "Edges first; sort pieces by color in cups.", { small: true }),
  A("card-games", "Card and board games", "calm", "PSW", "in", 1, 0, 25, ["deck of cards or a board game"], "Go Fish, Crazy Eights, War, or a board game from the family's shelf. Teach a new one."),
  A("block-build", "Block building challenge", "calm", "TPSW", "in", 1, 0, 25, ["building blocks"], "Challenges: the tallest tower, a bridge a toy car can cross, a house for a stuffed animal. Big blocks only for under-3s."),
  A("rice-bin", "Sensory bin", "calm", "TP", "in", 1, 2, 20, ["dry rice or oats", "plastic tub", "cups and scoops", "towel underneath"], "Scoop, pour and hide small toys to find.", { safety: "Stay right beside a toddler; nothing goes in mouths." }),
  A("i-spy", "I spy", "calm", "PSW", "any", 1, 0, 10, [], "Colors for little ones, first letters for readers."),
  A("story-chain", "Make up a story together", "calm", "PSW", "in", 1, 0, 15, [], "Each person adds one sentence. Start with 'Once there was a dragon who was afraid of...'"),
  A("mirror-play", "Mirror and peekaboo", "calm", "I", "in", 1, 0, 10, ["baby-safe mirror", "small blanket"], "Peekaboo with the blanket, then point out eyes, nose and mouth in the mirror.", { quiet: true }),
  A("board-books", "Touch-and-feel books", "calm", "IT", "in", 1, 0, 10, ["board books"], "Let them turn the pages and touch the textures; name everything you see.", { quiet: true }),
  A("stacking-cups", "Stacking cups", "calm", "IT", "in", 1, 0, 10, ["stacking cups or plastic cups"], "Build a tower for them to knock down, then nest the cups again."),
  A("cloud-watch", "Cloud shapes", "calm", "PSW", "out", 1, 0, 15, ["blanket"], "Lie on a blanket and name what the clouds look like.", { wx: ["nice"], quiet: true }),
  A("stargazing", "Star spotting", "calm", "SW", "out", 1, 0, 20, ["blanket", "flashlight"], "Find the brightest star, the moon's shape tonight, and make up a constellation.", { wx: ["nice", "cold"], when: ["evening"] }),
  A("audiobook", "Audiobook on the couch", "calm", "PSW", "in", 1, 0, 20, ["speaker or phone (audio only)"], "Play a kids' audiobook the parents approve; kids can color while they listen.", { quiet: true }),
  A("color-sort", "Color sorting game", "calm", "TP", "in", 1, 0, 15, ["socks or blocks in different colors", "bowls"], "Sort everything red in one bowl, blue in another; then sort by size."),
  A("memory-match", "Memory match", "calm", "PSW", "in", 1, 0, 15, ["deck of cards"], "Lay pairs face down and take turns flipping two. Fewer pairs for little ones."),
  A("blanket-fort", "Blanket fort reading den", "calm", "PSW", "in", 2, 0, 30, ["blankets", "chairs", "pillows", "flashlight"], "Build the fort together, then read inside it by flashlight.", { quiet: true }),
  A("checkers", "Checkers or chess lesson", "calm", "SW", "in", 1, 0, 30, ["checkers or chess set"], "Teach the moves, then play with a 'take back one move' rule.", { small: true }),
  A("silly-stories", "Fill-in silly stories", "calm", "SW", "in", 1, 0, 15, ["paper", "pencil"], "Write a short story with blanks; ask for a noun, a verb, a food, then read it back."),
  A("riddles", "Riddles and jokes", "calm", "SW", "any", 1, 0, 10, [], "Swap riddles; each kid makes one up for you."),
  A("bird-watch", "Bird watching", "calm", "PSW", "out", 1, 0, 20, ["paper", "pencil"], "Sit still for five minutes and tally birds by color or size. Draw your favorite.", { quiet: true }),
  A("sticker-scene", "Sticker scenes", "calm", "PS", "in", 1, 0, 15, ["sticker sheets", "paper"], "Draw a road, a sea or a farm, then fill it with stickers and tell its story.", { small: true }),
  // creative
  A("texture-basket", "Texture basket", "creative", "I", "in", 1, 0, 10, ["basket", "scarf", "crinkly fabric", "wooden spoon", "soft brush"], "Hand baby one thing at a time to grab, shake and feel; name each one: soft, bumpy, crinkly.", { safety: "Nothing small enough to fit in their mouth; watch the whole time." }),
  A("paint-bag", "Mess-free paint bag", "creative", "IT", "in", 1, 0, 10, ["zip bag", "washable paint", "strong tape"], "Squeeze a few colors of paint into a zip bag, seal it, tape it flat to the floor or high chair tray, and let them squish the colors together.", { safety: "Tape the seal shut and stay right there; throw it away if it leaks." }),
  A("drawing", "Drawing prompts", "creative", "TPSW", "in", 1, 1, 20, ["paper", "crayons"], "Prompts: a monster who loves vegetables, your dream treehouse, our day as a comic. Toddlers just scribble big."),
  A("playdough", "Play dough", "creative", "TPS", "in", 1, 1, 25, ["play dough (flour-based)", "cookie cutters", "rolling pin"], "Make snakes, pancakes, a birthday cake with candles.", { allergens: ["wheat"], safety: "Most play dough is made with wheat flour." }),
  A("pb-dough", "Edible peanut butter dough", "creative", "PS", "in", 1, 2, 20, ["peanut butter", "powdered milk", "honey", "bowl"], "Mix equal parts peanut butter and powdered milk with a little honey; shape animals and eat a few.", { allergens: ["peanut", "dairy"], food: true }),
  A("salt-dough", "Salt dough keepsakes", "creative", "PSW", "in", 1, 2, 40, ["flour", "salt", "water", "paint"], "Mix 2 cups flour, 1 cup salt and about 3/4 cup water; cut shapes or press handprints; parents bake them later.", { allergens: ["wheat"] }),
  A("oobleck", "Oobleck", "creative", "TPS", "in", 1, 2, 20, ["cornstarch", "water", "bowl", "towel"], "About 2 parts cornstarch to 1 part water: it's solid when you squeeze it and runs when you let go.", { allergens: ["corn"] }),
  A("pasta-necklace", "Pasta necklaces", "creative", "PS", "in", 1, 1, 20, ["dry tube pasta", "yarn", "tape"], "Tape one end of the yarn into a needle shape and thread the pasta. Color the pasta first with markers if you like.", { allergens: ["wheat"], small: true }),
  A("plate-masks", "Paper plate masks", "creative", "PSW", "in", 1, 1, 25, ["paper plates", "crayons or markers", "yarn", "child-safe scissors"], "Cut eye holes (you do it for little ones), decorate as an animal, tie on with yarn, then put on a show."),
  A("watercolors", "Watercolor painting", "creative", "PSW", "in", 1, 2, 25, ["watercolor paints", "paper", "cups of water"], "Paint a sunset by blending colors, or draw in white crayon first and paint over it to reveal it."),
  A("finger-paint", "Finger painting", "creative", "TP", "in", 1, 2, 20, ["washable finger paint", "paper", "old shirt as a smock"], "Handprints, dots and swirls; paint on a tray to keep it contained."),
  A("binoculars", "Cardboard-tube binoculars", "creative", "PS", "in", 1, 1, 20, ["two cardboard tubes", "tape", "string", "crayons"], "Tape two tubes together, decorate, add a neck string, then go on a safari around the house.", { safety: "Neck strings only while you're watching; take them off after." }),
  A("box-build", "Cardboard box car or house", "creative", "PSW", "in", 2, 1, 40, ["large cardboard box", "markers", "tape"], "Draw windows, doors, wheels and a license plate. You do any cutting."),
  A("sock-puppets", "Sock puppet show", "creative", "PSW", "in", 1, 1, 30, ["old socks", "markers", "a table as the stage"], "Draw faces on socks (with the parents' OK on which socks), then put on a show behind the table.", { small: false }),
  A("nature-collage", "Nature collage", "creative", "PSW", "any", 1, 1, 30, ["glue", "paper", "leaves and petals found outside"], "Collect fallen leaves, petals and grass, then glue them into a picture."),
  A("leaf-rubbing", "Leaf rubbings", "creative", "PSW", "any", 1, 1, 20, ["paper", "crayons with the paper peeled"], "Put a leaf under paper and rub the side of a crayon over it; compare the veins."),
  A("chalk-mural", "Sidewalk chalk mural", "creative", "TPSW", "out", 1, 1, 25, ["sidewalk chalk"], "Draw a giant scene together: a city, an ocean, a road for toy cars.", { wx: ["nice", "hot", "cold"] }),
  A("paper-planes", "Paper airplane contest", "creative", "SW", "in", 2, 0, 20, ["paper"], "Fold three designs and test which flies farthest and which does the best loop."),
  A("bracelets", "Friendship bracelets", "creative", "SW", "in", 1, 0, 30, ["embroidery floss", "tape"], "Tape the strands to a table and braid or knot; make one to give away.", { small: true }),
  A("comic-strip", "Make a comic strip", "creative", "SW", "in", 1, 0, 30, ["paper", "pencils"], "Fold paper into six boxes; invent a hero and tell one adventure."),
  A("marble-run", "Cardboard marble run", "creative", "SW", "in", 1, 1, 30, ["cardboard tubes", "tape", "marble or ping-pong ball"], "Tape tubes to a wall or box at angles so the ball rolls the whole way down.", { small: true }),
  A("shakers", "Music shakers", "creative", "PS", "in", 2, 1, 20, ["empty plastic bottle with lid", "dry beans or rice", "tape"], "Fill a little, tape the lid shut, decorate, then play along to music.", { small: true }),
  A("bird-feeder", "Pinecone bird feeder", "creative", "PSW", "out", 1, 2, 30, ["pinecones", "peanut butter", "birdseed", "string"], "Spread peanut butter on a pinecone, roll it in seed, hang it where you can watch from a window.", { allergens: ["peanut"], wx: ["nice", "cold"] }),
  A("kindness-cards", "Kindness cards", "creative", "PSW", "in", 1, 1, 20, ["paper", "crayons"], "Make thank-you cards for a neighbor, a mail carrier or a grandparent; the parents decide where they go."),
  A("tape-resist", "Tape resist art", "creative", "PSW", "in", 1, 1, 25, ["painter's tape", "crayons or paint", "paper"], "Tape a pattern on paper, color over everything, peel the tape for crisp white lines."),
  A("volcano", "Baking soda volcano", "creative", "PSW", "any", 2, 2, 20, ["baking soda", "vinegar", "cup", "tray"], "Put baking soda in a cup on a tray, add a little vinegar and watch it fizz over. Guess first how much will spill.", { safety: "Keep vinegar away from eyes." }),
  A("sink-float", "Sink or float", "creative", "TPS", "in", 1, 2, 20, ["tub of water", "household objects", "towels"], "Guess first, then test: a spoon, a cork, a crayon, a leaf. Sort into two piles.", { safety: WATER }),
  A("bean-jar", "Grow a bean in a jar", "creative", "PS", "in", 1, 1, 15, ["clear jar", "paper towel", "dry bean", "water"], "Wet a paper towel, line the jar, tuck a bean against the glass; the family watches it sprout over the week.", { small: true }),
  A("water-paint", "Painting with water", "creative", "TP", "out", 1, 0, 20, ["cup of water", "paintbrush"], "Paint the fence or sidewalk with plain water and watch it disappear.", { wx: ["hot", "nice"] }),
  // snack
  A("ants-log", "Ants on a log", "snack", "PSW", "in", 1, 1, 15, ["celery", "peanut butter", "raisins"], "Spread peanut butter in celery sticks and line up raisin 'ants'.", { allergens: ["peanut"] }),
  A("fruit-kabobs", "Fruit kabobs", "snack", "PSW", "in", 1, 1, 15, ["soft fruit cut small", "straws or blunt skewers"], "Thread fruit in a color pattern; eat the pattern backwards."),
  A("parfait", "Yogurt parfait cups", "snack", "TPSW", "in", 1, 1, 15, ["yogurt", "berries", "granola"], "Layer yogurt, fruit and granola in clear cups. Skip granola for toddlers.", { allergens: ["dairy", "wheat", "treenut"] }),
  A("muffin-pizza", "English muffin pizzas", "snack", "PSW", "in", 1, 1, 25, ["English muffins", "pizza sauce", "shredded cheese"], "Kids spread and sprinkle; you toast them.", { allergens: ["wheat", "dairy"], safety: OVEN }),
  A("rice-cake-faces", "Rice cake faces", "snack", "PSW", "in", 1, 1, 15, ["rice cakes", "cream cheese", "sliced vegetables and fruit"], "Spread cream cheese and make faces with cucumber eyes and a pepper smile.", { allergens: ["dairy"] }),
  A("smoothie", "Make a smoothie", "snack", "TPSW", "in", 1, 1, 15, ["banana", "frozen berries", "milk or yogurt", "blender"], "Kids add the fruit and count to ten while it blends; you work the blender.", { allergens: ["dairy"] }),
  A("apple-nachos", "Apple nachos", "snack", "PSW", "in", 1, 1, 15, ["apple slices", "peanut butter", "raisins"], "Fan apple slices on a plate, drizzle warm peanut butter, sprinkle raisins.", { allergens: ["peanut"] }),
  A("hummus-dip", "Veggie and hummus dippers", "snack", "PSW", "in", 1, 1, 15, ["cucumber", "carrot sticks cut thin", "hummus"], "Dip, then vote for the best vegetable.", { allergens: ["sesame"] }),
  A("popcorn", "Popcorn and a story", "snack", "SW", "in", 1, 1, 15, ["popcorn"], "Share a bowl while someone reads aloud.", { allergens: ["corn"] }),
  A("cracker-stacks", "Cracker stacks", "snack", "PSW", "in", 1, 1, 15, ["crackers", "cheese slices", "turkey slices"], "Build the tallest stack that still fits in your mouth.", { allergens: ["wheat", "dairy"] }),
  A("toast-shapes", "Cookie-cutter toast", "snack", "PSW", "in", 1, 1, 15, ["bread", "butter", "cookie cutters"], "Cut toast into stars and hearts; eat the scraps first.", { allergens: ["wheat", "dairy"], safety: OVEN }),
  A("parent-snack", "Snack from the parents' list", "snack", "IT", "in", 1, 1, 15, ["the snack the parents left"], "Serve exactly what the parents left, cut the way they showed you, with the child seated.", { safety: "Seated and watched while eating; follow the parents' cutting instructions." }),
  // wind-down
  A("bedtime-story", "Bedtime story, lights low", "winddown", "ITPS", "in", 1, 0, 15, ["books"], "Lights low, one or two books, the same voice every time.", { quiet: true, bedtime: true }),
  A("bed-routine", "The family's bedtime routine", "winddown", "ITPSW", "in", 1, 0, 30, ["the parents' bedtime list"], "Follow the parents' steps in their order: bath or wash, teeth, pajamas, book, lights.", { quiet: true, bedtime: true }),
  A("lullabies", "Quiet songs", "winddown", "ITP", "in", 1, 0, 10, [], "Soft songs, slower each time. Hum if you don't know the words.", { quiet: true, bedtime: true }),
  A("three-good", "Three good things", "winddown", "PSW", "in", 1, 0, 5, [], "Each person names three good things from today, and one thing they're looking forward to.", { quiet: true, bedtime: true }),
  A("balloon-breaths", "Balloon breaths and stretches", "winddown", "PSW", "in", 1, 0, 10, [], "Breathe in to fill a pretend balloon, out slowly to let it float away. Stretch tall like a tree, curl small like a seed.", { quiet: true, bedtime: true }),
  A("flashlight-read", "Flashlight reading in bed", "winddown", "SW", "in", 1, 0, 20, ["flashlight", "books"], "Ten or twenty minutes of their own book, then lights out.", { quiet: true, bedtime: true }),
  A("sleepy-toes", "Sleepy toes", "winddown", "PS", "in", 1, 0, 5, [], "Lying down: tell the toes to go to sleep, then the knees, tummy, arms, all the way to the eyes.", { quiet: true, bedtime: true }),
  A("quiet-books", "Quiet time with books and soft toys", "winddown", "TP", "in", 1, 0, 20, ["books", "soft toys"], "Cozy corner, soft voices, no getting up until the timer goes.", { quiet: true }),
  A("sketchbook", "Sketchbook or journal time", "winddown", "SW", "in", 1, 0, 20, ["notebook", "pencils"], "Draw or write about the day; nobody has to share it.", { quiet: true }),
  A("calm-jar", "Calm-down jar", "winddown", "PS", "in", 1, 1, 10, ["plastic bottle with lid", "water", "glitter glue", "tape"], "Shake the jar and breathe slowly until the glitter settles.", { quiet: true, small: true }),
  A("rock-settle", "Rocking and dim lights", "winddown", "I", "in", 1, 0, 15, ["the baby's sleep sack or blanket the parents use"], "Dim the lights, rock and hum, then lay the baby down the way the parents showed you.", { quiet: true, bedtime: true, safety: "Baby goes to sleep on their back, in their own crib, nothing loose in it, unless the parents' doctor said otherwise." , ref: "https://safetosleep.nichd.nih.gov/" }),
  A("back-drawing", "Back-drawing guessing game", "winddown", "PSW", "in", 1, 0, 10, [], "Trace a shape or letter on their back with a finger; they guess. Slow and gentle.", { quiet: true, bedtime: true }),
  // two screen activities, only when the family said screens are fine
  A("movie", "Family-approved movie", "calm", "PSW", "in", 1, 0, 90, ["a movie the parents approved"], "Only a movie the parents named, with the lights on at first.", { screens: true, when: ["afternoon", "evening"] }),
  A("dance-video", "Follow-along dance video", "active", "PSW", "in", 3, 0, 15, ["a video the parents approved"], "Follow a kids' dance video the parents approve.", { screens: true }),
];

// The faith set: written for this kit; the stories are retold in plain words and the
// passage is named so parents can read it themselves. Used only when faithAllowed().
export const FAITH = [
  A("f-noah", "Noah's ark, with animal sounds", "calm", "TPS", "in", 1, 0, 10, ["a Bible storybook, if the family has one"], "God asked Noah to build a huge boat; the animals came in two by two; it rained for a long time; afterwards God put a rainbow in the sky as a promise. Kids make each animal's sound as it boards. (Genesis 6-9)", { faith: true }),
  A("f-david", "David and Goliath: being brave", "calm", "PSW", "in", 1, 0, 10, [], "A young shepherd named David faced a giant soldier everyone else was afraid of, trusting God instead of armor. Talk about one brave thing each child did. (1 Samuel 17)", { faith: true }),
  A("f-storm", "Jesus calms the storm", "winddown", "PSW", "in", 1, 0, 10, [], "Jesus' friends were scared in a storm on a lake while he slept; he woke and told the wind and waves to be still, and they were. Talk about what helps when we feel scared at night. (Mark 4:35-41)", { faith: true, quiet: true, bedtime: true }),
  A("f-samaritan", "The Good Samaritan: who helped?", "calm", "PSW", "in", 1, 0, 15, [], "A man was hurt on the road; two people walked past, and a stranger from a group his people didn't like stopped and cared for him. Ask: who was the good neighbor, and how can we be one? (Luke 10:25-37)", { faith: true }),
  A("f-zacchaeus", "Zacchaeus up the tree (act it out)", "active", "PS", "any", 2, 0, 10, [], "A short man climbed a tree to see Jesus over the crowd; Jesus called him down and came to his house, and Zacchaeus gave back what he had taken. Kids climb onto a step-stool 'tree' and act it out. (Luke 19:1-10)", { faith: true }),
  A("f-creation", "Seven days of creation drawings", "creative", "TPS", "in", 1, 1, 20, ["paper", "crayons"], "Fold paper into seven boxes and draw one day in each: light, sky and water, land and plants, sun moon and stars, fish and birds, animals and people, rest. (Genesis 1-2:3)", { faith: true }),
  A("f-prayer", "Bedtime prayer of thanks", "winddown", "TPSW", "in", 1, 0, 5, [], "Pray the way the parents pray at home: if they gave you words, use those; otherwise each child thanks God for one thing from today.", { faith: true, quiet: true, bedtime: true }),
  A("f-songs", "Worship song sing-along", "active", "TPSW", "in", 2, 0, 10, ["music player"], "Sing the songs the family already sings at home or church, with motions; ask the parents which ones.", { faith: true }),
  A("f-verse-cards", "Encouragement cards with a verse", "creative", "PSW", "in", 1, 1, 20, ["paper", "crayons"], "Decorate cards with a short verse the parents choose, for a friend, teacher or grandparent.", { faith: true }),
  A("f-blessing-bags", "Blessing bags", "creative", "SW", "in", 1, 0, 30, ["zip bags", "items the parents provide"], "Pack small bags of useful things the parents bought and write a kind note for each; the parents decide who receives them.", { faith: true }),
  A("f-daniel", "Daniel and the lions", "winddown", "PSW", "in", 1, 0, 10, [], "Daniel kept praying even when a law said not to; he was put in a den of lions, and God kept him safe all night. (Daniel 6)", { faith: true, quiet: true, bedtime: true }),
  A("f-jonah", "Jonah and the big fish", "calm", "PS", "in", 1, 0, 10, [], "Jonah ran away from what God asked, ended up inside a great fish for three days, and got a second chance. Talk about second chances. (Jonah 1-3)", { faith: true }),
];

const ALL = [...LIBRARY, ...FAITH];
export const activityById = (id) => ALL.find((a) => a.id === id) || null;

// The sitter offers faith-based activities (same switch the meet-and-greet kit uses) and
// this family asked, on the family record or on the inquiry that became this family.
export function faithAllowed(desk, family) {
  const p = (desk && desk.profile) || DEFAULT_PROFILE;
  if (!p.showFaith || !String(p.faithActivities || "").trim() || !family) return false;
  if (family.faithActivities === true) return true;
  return (desk.leads || []).some((l) => l.familyId && l.familyId === family.id && l.faithActivities === true);
}

// The library, filtered. Faith items only when asked for with { faith: true }.
export function library({ band, kind, place, screens = false, faith = false } = {}) {
  return (faith ? ALL : LIBRARY).filter((a) => (!band || a.ages.includes(band)) && (!kind || a.kind === kind) && (!place || a.place === place || a.place === "any") && (screens || a.screenFree));
}

// ---------- allergies ----------

const ALLERGENS = [
  ["peanut", /peanut|\bnuts?\b|\bnut allerg/i],
  ["treenut", /tree ?nut|almond|cashew|walnut|pecan|hazelnut|pistachio|\bnuts?\b|\bnut allerg/i],
  ["dairy", /dairy|milk|lactose|cheese|casein|whey/i],
  ["egg", /\beggs?\b/i],
  ["wheat", /wheat|gluten|celiac|coeliac/i],
  ["soy", /\bsoy/i],
  ["sesame", /sesame|tahini/i],
  ["fish", /\bfish\b/i],
  ["shellfish", /shellfish|shrimp|crab|lobster/i],
  ["corn", /\bcorn\b|maize/i],
  ["latex", /latex|balloon/i],
];
// Phrases in the kids field that are not allergies: "age 3" from a converted lead,
// "none", medicine locations and the like.
const NOT_ALLERGY = /^(age\s+\S+|none|no allergies|n\/?a|epi-?pen.*|inhaler.*|notes?:.*)$/i;

export function allergyKeys(text) {
  const parts = String(text || "").split(/[;,]/).map((s) => s.trim()).filter((s) => s && !NOT_ALLERGY.test(s));
  const keys = new Set();
  const unknown = [];
  for (const part of parts) {
    let hit = false;
    for (const [k, re] of ALLERGENS) if (re.test(part)) { keys.add(k); hit = true; }
    if (!hit && /allerg|intoleran|reaction|anaphyla|food/i.test(part)) unknown.push(part);
  }
  return { keys: [...keys], unknown };
}

function kidAge(kid, date) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(kid.birth || ""))) return Math.floor(daysBetween(kid.birth, date) / 30.4375);
  const m = /\bage\s+(\d+(?:\.\d+)?)\s*(m|mo|mos|months?|y|yrs?|years?)?\b/i.exec(`${kid.allergies || ""} ${kid.notes || ""}`);
  if (!m) return null;
  return /^m/i.test(m[2] || "") ? Number(m[1]) : Math.round(Number(m[1]) * 12);
}

export function kidsFor(family, date) {
  return (family && Array.isArray(family.kids) ? family.kids : []).map((k, i) => {
    const months = kidAge(k, date);
    const al = allergyKeys(k.allergies);
    return { name: String(k.name || "").trim() || `Child ${i + 1}`, months, band: bandOf(months), allergens: al.keys, unknownAllergies: al.unknown, allergyText: String(k.allergies || "") };
  });
}

// Why an activity is unsafe for these kids, or "" when it is fine.
function unsafeFor(a, kids) {
  for (const k of kids) {
    const hit = a.allergens.find((x) => k.allergens.includes(x));
    if (hit) return { child: k.name, reason: `${hit === "treenut" ? "tree nut" : hit} allergy` };
    if (a.smallParts && k.months !== null && k.months < 36) return { child: k.name, reason: "small parts, under 3" };
  }
  return null;
}

// ---------- the plan ----------

export function timeOfDay(start) {
  const m = toMin(start);
  if (!Number.isFinite(m)) return "afternoon";
  if (m < 12 * 60) return "morning";
  if (m < 17 * 60) return "afternoon";
  return "evening";
}

const ORDER = {
  morning: ["active", "creative", "snack", "calm", "winddown"],
  afternoon: ["snack", "active", "creative", "calm", "winddown"],
  evening: ["active", "creative", "snack", "calm", "winddown"],
};
const FILL = ["active", "creative", "calm", "active", "creative", "calm", "snack"];
// Where an evening plan stops when neither the call nor the family record gives a
// bedtime: a starting guess by the oldest child's age, shown to the sitter to correct.
export const DEFAULT_BEDTIME = { infant: "19:00", toddler: "19:00", preschool: "19:30", "school-age": "20:00", tween: "21:00" };
const DROP = ["creative", "calm", "active", "snack"];

function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function fits(a, { weather, when, screens, faith }) {
  if (a.faith && !faith) return false;
  if (!a.screenFree && !screens) return false;
  if (a.when && !a.when.includes(when)) return false;
  if (a.place === "out" && !a.weather.includes(weather)) return false;
  return true;
}

/**
 * planSit(desk, { familyId | booking, date, start, end, weather, screens, avoid, seed })
 * A balanced plan for one sit. `booking` may be a desk booking (its familyId, date, start
 * and end are used). `avoid` is a list of activity ids to skip if anything else fits
 * (recent sits with this family). Returns slots with clock times, side activities for
 * any child the main one doesn't suit, a supplies checklist, what was left out for
 * allergies, and warnings.
 */
export function planSit(desk, opts = {}) {
  const b = opts.booking || {};
  const familyId = opts.familyId || b.familyId || "";
  const family = (desk.families || []).find((f) => f.id === familyId) || null;
  const date = opts.date || b.date || "2026-01-01";
  const start = opts.start || b.start || "18:00";
  const end = opts.end || b.end || "21:00";
  let minutes = toMin(end) - toMin(start);
  if (!(minutes > 0)) minutes += 1440;
  if (!Number.isFinite(minutes)) minutes = 180;
  const when = opts.timeOfDay || timeOfDay(start);
  const weather = WEATHER.includes(opts.weather) ? opts.weather : "nice";
  const screens = opts.screens ?? !!(family && family.screensOk);
  const faith = faithAllowed(desk, family);
  const avoid = new Set(opts.avoid || []);
  const seed = hash(opts.seed ?? `${familyId}|${date}|${start}`);
  const warnings = [];

  let kids = kidsFor(family, date);
  if (!kids.length) warnings.push("No children on the family record: the plan assumes ages 3 to 9. Add the kids with birth dates in Families.");
  const unaged = kids.filter((k) => !k.band);
  if (unaged.length) warnings.push(`No birth date for ${unaged.map((k) => k.name).join(", ")}: add one in Families so the plan fits their age.`);
  for (const k of kids) if (k.unknownAllergies.length) warnings.push(`${k.name}: "${k.unknownAllergies.join(", ")}" isn't an allergy this kit recognizes, so check every food and craft with the parents.`);
  const bands = kids.map((k) => k.band).filter(Boolean);
  const coverBands = bands.length ? bands : ["preschool", "school-age"];
  const ctx = { weather, when, screens, faith };

  const pool = (faith ? ALL : LIBRARY).filter((a) => fits(a, ctx));
  const avoided = [];
  const safe = [];
  for (const a of pool) {
    if (!a.ages.some((x) => coverBands.includes(x))) continue;
    const why = unsafeFor(a, kids);
    if (why) avoided.push({ id: a.id, title: a.title, child: why.child, reason: why.reason });
    else safe.push(a);
  }

  const used = new Set();
  const suits = (a) => (kids.length ? kids.filter((k) => k.band && a.ages.includes(k.band)).map((k) => k.name) : []);
  const score = (a, kind) => {
    const cover = kids.length ? suits(a).length : a.ages.filter((x) => coverBands.includes(x)).length;
    let s = cover * 10;
    if (faith && a.faith) s += 6; // the family asked for these
    if (kind === "active" && a.place === "out" && ["nice", "snow", "rain"].includes(weather)) s += 4;
    if (a.weather && a.weather !== OUT && a.weather.includes(weather)) s += 4; // made for this weather (snow, rain, heat)
    s -= a.mess * (when === "evening" ? 2 : 1);
    if (avoid.has(a.id)) s -= 15;
    if (kind === "winddown" && when === "evening" && a.bedtime) s += 5;
    if (when === "evening" && kind === "calm" && a.energy > 1) s -= 3;
    return s + (((hash(a.id) ^ seed) >>> 0) % 100) / 50; // 0 to 2: varies plans between sits
  };
  const pick = (kind, filter = () => true) => {
    let best = null, bestS = -Infinity;
    for (const a of safe) {
      if (a.kind !== kind || used.has(a.id) || !filter(a)) continue;
      if (kind === "winddown" && when === "evening" && !a.bedtime && safe.some((x) => x.kind === "winddown" && x.bedtime && !used.has(x.id))) continue;
      if (kind === "winddown" && when !== "evening" && a.bedtime && !a.quiet) continue;
      const s = score(a, kind);
      if (s > bestS) { best = a; bestS = s; }
    }
    return best;
  };

  // evening: the plan runs to bedtime; after that the kids are asleep
  const startMin = toMin(start);
  let bedtime = "", awake = minutes;
  if (when === "evening") {
    const oldest = [...BANDS].reverse().find((x) => kids.some((k) => k.band === x)) || "school-age";
    bedtime = /^\d{1,2}:\d{2}$/.test(String(opts.bedtime || "")) ? opts.bedtime : /^\d{1,2}:\d{2}$/.test(String((family && family.bedtime) || "")) ? family.bedtime : "";
    if (!bedtime) { bedtime = DEFAULT_BEDTIME[oldest]; warnings.push(`Bedtime ${bedtime} is a guess for this age; set the family's real bedtime.`); }
    let bt = toMin(bedtime);
    if (bt < 12 * 60) bt += 1440; // after midnight
    awake = Math.min(minutes, Math.max(0, bt - startMin));
    if (awake === 0) warnings.push("This sit starts at or after bedtime: the plan is only the settling-down part.");
  }
  const outdoorOk = (t) => (x) => !(when === "evening" && x.place === "out" && t >= 19 * 60 && x.id !== "stargazing");

  // shape: the five kinds, padded with fillers for long sits and trimmed for short ones
  const shape = awake === 0 ? ["winddown"] : [...ORDER[when]];
  const estimate = (list) => list.length * 20;
  for (let i = 0; awake > 0 && estimate(shape) + 20 <= awake && shape.length < 14; i++) shape.splice(shape.length - 1, 0, FILL[i % FILL.length]);
  for (const k of DROP) if (estimate(shape) > awake + 10 && shape.length > 2 && shape.includes(k)) shape.splice(shape.lastIndexOf(k), 1);

  const slots = [];
  let t = toMin(start);
  let planned = 0;
  for (const kind of shape) {
    const a = pick(kind, outdoorOk(t));
    if (!a) continue;
    if (planned + Math.min(a.minutes, 30) > awake && slots.length >= 2 && kind !== "winddown") continue;
    used.add(a.id);
    const forKids = suits(a);
    const side = [];
    for (const k of kids) {
      if (!k.band || forKids.includes(k.name)) continue;
      const alt = pick(kind, (x) => x.ages.includes(k.band) && outdoorOk(t)(x)) || KINDS.map((kk) => pick(kk, (x) => x.ages.includes(k.band) && x.kind !== "snack" && outdoorOk(t)(x))).find(Boolean);
      if (alt) { used.add(alt.id); side.push({ child: k.name, id: alt.id, title: alt.title, how: alt.how }); }
    }
    const len = Math.max(5, Math.min(a.minutes, a.id === "movie" ? 90 : 40, awake - planned || a.minutes));
    const note = [
      a.food ? "Confirm with the parents what the kids may eat." : "",
      kind === "snack" && faith ? "Say grace the way the family does, if they asked." : "",
      a.safety,
    ].filter(Boolean).join(" ");
    slots.push({ at: fmtMin(t % 1440), minutes: len, kind, id: a.id, title: a.title, how: a.how, place: a.place, forKids, side, note, faith: a.faith });
    t += len;
    planned += len;
  }

  // supplies checklist
  const supplies = new Map();
  for (const s of slots) {
    const items = [activityById(s.id), ...s.side.map((x) => activityById(x.id))];
    for (const a of items) for (const item of a.supplies) {
      const e = supplies.get(item) || { item, for: [], food: false };
      if (!e.for.includes(a.title)) e.for.push(a.title);
      e.food = e.food || a.food;
      supplies.set(item, e);
    }
  }

  return {
    familyId, familyName: family ? family.name || "" : "", bookingKey: b.key || b.id || "", date, start, end, minutes,
    timeOfDay: when, weather, screens, faith, kids, slots, planned, bedtime, asleep: minutes - awake, free: Math.max(0, awake - planned),
    supplies: [...supplies.values()], avoided, warnings,
  };
}

// Activities used with this family in the last `n` saved plans, so the next plan varies.
export function recentActivityIds(desk, familyId, n = 3) {
  return (desk.activityPlans || []).filter((p) => p.familyId === familyId).slice(-n).flatMap((p) => (p.items || []).map((i) => i.id));
}

// The plan for a booking as the app shows it: recent plans with this family are avoided.
export function planForBooking(desk, booking, opts = {}) {
  return planSit(desk, { ...opts, booking, avoid: opts.avoid || recentActivityIds(desk, booking.familyId) });
}

// Upcoming sits to plan for, as expanded occurrences, soonest first.
export function upcomingSits(desk, today, days = 30) {
  const last = new Date(`${today}T12:00:00Z`);
  last.setUTCDate(last.getUTCDate() + days);
  const to = last.toISOString().slice(0, 10);
  return expandBookings(desk.bookings || []).filter((b) => b.status !== "cancelled" && b.status !== "done" && b.date >= today && b.date <= to);
}

// ---------- saved plans and the sit report ----------

// The compact form kept in desk.activityPlans. `done` starts true for everything planned;
// the sitter unticks what didn't happen.
export function planRecord(plan, id = `ap_${hash(`${plan.bookingKey}|${plan.date}|${plan.start}`).toString(36)}`) {
  const items = [];
  for (const s of plan.slots) {
    items.push({ id: s.id, title: s.title, kind: s.kind, minutes: s.minutes, kids: s.forKids, done: true });
    for (const x of s.side) items.push({ id: x.id, title: x.title, kind: activityById(x.id)?.kind || s.kind, minutes: s.minutes, kids: [x.child], done: true });
  }
  return { id, bookingKey: plan.bookingKey, familyId: plan.familyId, date: plan.date, start: plan.start, weather: plan.weather, timeOfDay: plan.timeOfDay, items };
}

// Keep one saved plan per sit (the newest), at most `max` overall.
export function savePlan(desk, record, max = 200) {
  const list = (desk.activityPlans || []).filter((p) => p.id !== record.id && !(p.bookingKey && p.bookingKey === record.bookingKey && p.date === record.date));
  list.push(record);
  return list.slice(-max);
}

/**
 * activitiesForReport(plan) -> [{ title, kind, minutes, kids }]
 * The activities that happened, for a sit report. Takes a plan from planSit() or a saved
 * record from planRecord(); items the sitter unticked (done: false) are left out.
 */
export function activitiesForReport(plan) {
  if (!plan) return [];
  const items = Array.isArray(plan.items) ? plan.items : planRecord(plan).items;
  return items.filter((i) => i.done !== false).map((i) => ({ title: i.title, kind: KIND_LABEL[i.kind] || i.kind, minutes: i.minutes, kids: [...(i.kids || [])] }));
}

// ---------- bag of tricks ----------

// Things nearly every home has, which the sitter asks to borrow instead of packing.
const HOUSE = new Set(["couch cushions", "pillows", "blanket", "blankets", "two chairs", "chairs", "pots", "wooden spoons", "cups", "cups of water", "bowl", "bowls", "spoons", "towel", "towels", "towel underneath", "tub of water", "plastic tub", "household objects", "cup", "tray", "cup of water", "water", "books", "board books", "soft toys", "favorite toy", "a table as the stage", "empty plastic bottles", "old socks", "socks or blocks in different colors", "broom handle or rope", "music player", "paper bag", "large cardboard box", "the parents' bedtime list", "the baby's sleep sack or blanket the parents use", "their own helmet", "their own bike or scooter", "snow clothes", "rain boots", "raincoats", "swimsuits", "sprinkler or hose", "leaves and petals found outside", "a movie the parents approved", "a video the parents approved", "speaker or phone (audio only)", "the snack the parents left", "items the parents provide", "a Bible storybook, if the family has one"]);

export const ESSENTIALS = [
  "Phone, charged, with the parents' numbers and the family's emergency contact saved",
  "The family's info sheet (allergies, medicines, doctor), if they filled one in",
  "A small first-aid kit (bandages, wipes, gloves)",
  "Hand wipes and a plastic bag for wet or messy clothes",
  "A book or two you love reading aloud",
];

/**
 * bagOfTricks(desk, familyId, today) -> { kids, pack, borrow, avoided, warnings, essentials }
 * The portable supplies that unlock the most activities for this family's kids, safe for
 * their allergies and ages; food is left to the parents.
 */
export function bagOfTricks(desk, familyId, today, { limit = 12 } = {}) {
  const family = (desk.families || []).find((f) => f.id === familyId) || null;
  const kids = kidsFor(family, today);
  const bands = kids.map((k) => k.band).filter(Boolean);
  const cover = bands.length ? bands : ["preschool", "school-age"];
  const faith = faithAllowed(desk, family);
  const screens = !!(family && family.screensOk);
  const counts = new Map();
  const borrow = new Set();
  const avoided = [];
  for (const a of faith ? ALL : LIBRARY) {
    if (!a.ages.some((x) => cover.includes(x)) || (!a.screenFree && !screens)) continue;
    const why = unsafeFor(a, kids);
    if (why) { avoided.push({ title: a.title, child: why.child, reason: why.reason }); continue; }
    if (a.food) continue;
    for (const item of a.supplies) {
      if (HOUSE.has(item)) { borrow.add(item); continue; }
      const e = counts.get(item) || { item, unlocks: [], kinds: new Set() };
      e.unlocks.push(a.title);
      e.kinds.add(a.kind);
      counts.set(item, e);
    }
  }
  const pack = [...counts.values()]
    .sort((x, y) => y.unlocks.length - x.unlocks.length || y.kinds.size - x.kinds.size || x.item.localeCompare(y.item))
    .slice(0, limit)
    .map((e) => ({ item: e.item, unlocks: e.unlocks.length, examples: e.unlocks.slice(0, 3) }));
  const warnings = [];
  if (!kids.length) warnings.push("No children on the family record yet: this list assumes ages 3 to 9.");
  for (const k of kids) if (k.unknownAllergies.length) warnings.push(`${k.name}: check "${k.unknownAllergies.join(", ")}" against everything you pack.`);
  return { familyName: family ? family.name || "" : "", kids, pack, borrow: [...borrow].sort(), avoided, warnings, essentials: ESSENTIALS };
}

// ---------- the printable plan for parents ----------

const STYLE = `body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#222;background:#fff}
h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1.1rem;margin:20px 0 6px;border-bottom:1px solid #ddd}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #e3e3e3;padding:6px 8px;text-align:left;vertical-align:top}
.note{color:#555;font-size:.9rem}.pill{display:inline-block;padding:0 8px;border-radius:9px;background:#f1e4ea;font-size:.85rem}
.allergy{color:#a3122a;font-weight:600}ul.check{list-style:none;padding-left:0}ul.check li::before{content:"\\2610  "}
footer{margin-top:28px;font-size:.8rem;color:#555;border-top:1px solid #ddd;padding-top:8px}
@media print{body{margin:0}footer a{color:#555}}`;

export function planPage(plan, profile = DEFAULT_PROFILE) {
  const who = profile.businessName || profile.name || "Your sitter";
  const kids = plan.kids.map((k) => `${esc(k.name)}${k.allergyText && k.allergens.length ? ` <span class="allergy">(allergies: ${esc(k.allergyText)})</span>` : ""}`).join(", ");
  const rows = plan.slots.map((s) => `<tr><td>${esc(s.at)}</td><td><span class="pill">${esc(KIND_LABEL[s.kind])}</span></td><td><strong>${esc(s.title)}</strong>${s.forKids.length && plan.kids.length > 1 ? ` <span class="note">(${esc(s.forKids.join(", "))})</span>` : ""}<br>${esc(s.how)}${s.side.map((x) => `<br><span class="note">For ${esc(x.child)}: ${esc(x.title)}</span>`).join("")}${s.note ? `<br><span class="note">${esc(s.note)}</span>` : ""}</td><td>${s.minutes} min</td></tr>`).join("");
  const supplies = plan.supplies.map((s) => `<li>${esc(s.item)}${s.food ? " <span class=\"note\">(food: only if you say it's fine)</span>" : ""}</li>`).join("");
  const avoided = [...new Map(plan.avoided.map((a) => [a.title, a])).values()].slice(0, 8);
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Sit plan ${esc(plan.date)}${plan.familyName ? `: ${esc(plan.familyName)}` : ""}</title><style>${STYLE}</style></head>
<body>
<h1>Plan for ${esc(plan.date)}, ${esc(plan.start)} to ${esc(plan.end)}</h1>
<p>${plan.familyName ? `${esc(plan.familyName)}. ` : ""}${kids ? `Kids: ${kids}.` : ""} Weather: ${esc(WEATHER_LABEL[plan.weather])}.</p>
<p class="note">A plan, not a promise: we follow the kids' mood and your house rules first. Anything you'd rather we skip, just say.</p>
<table><thead><tr><th>Time</th><th>Type</th><th>Activity</th><th>Length</th></tr></thead><tbody>${rows}</tbody></table>
${plan.free >= 15 ? `<p class="note">About ${plan.free} minutes left for free play and the kids' own choices.</p>` : ""}
<h2>What we'll use</h2><ul class="check">${supplies || "<li>Nothing special</li>"}</ul>
${avoided.length ? `<h2>Left out because of allergies or ages</h2><ul>${avoided.map((a) => `<li>${esc(a.title)}: ${esc(a.reason)} (${esc(a.child)})</li>`).join("")}</ul>` : ""}
<p>${esc(who)}${profile.phone ? `, ${esc(profile.phone)}` : ""}</p>
<footer><p>${NO_WARRANTY}</p><p>Made with the free <a href="https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/">Babysitting Business Kit</a>. ${SPONSOR}</p></footer>
</body>
</html>`;
}

// The packing list as a printable page for the sitter.
export function bagPage(bag) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Bag of tricks${bag.familyName ? `: ${esc(bag.familyName)}` : ""}</title><style>${STYLE}</style></head>
<body>
<h1>Bag of tricks${bag.familyName ? `: ${esc(bag.familyName)}` : ""}</h1>
<p>${bag.kids.map((k) => `${esc(k.name)}${k.band ? ` (${esc(BAND_LABEL[k.band])})` : ""}${k.allergens.length ? ` <span class="allergy">allergies: ${esc(k.allergyText)}</span>` : ""}`).join(", ")}</p>
${bag.warnings.map((w) => `<p class="allergy">${esc(w)}</p>`).join("")}
<h2>Pack</h2><ul class="check">${bag.pack.map((p) => `<li>${esc(p.item)} <span class="note">(${p.unlocks} activit${p.unlocks === 1 ? "y" : "ies"}: ${esc(p.examples.join(", "))})</span></li>`).join("")}</ul>
<h2>Always</h2><ul class="check">${bag.essentials.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
<h2>Ask to borrow at the house</h2><p class="note">${esc(bag.borrow.join(", "))}</p>
<footer><p>${NO_WARRANTY}</p><p>Made with the free <a href="https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/">Babysitting Business Kit</a>. ${SPONSOR}</p></footer>
</body>
</html>`;
}
