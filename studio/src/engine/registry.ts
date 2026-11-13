import type React from "react";
import type { PrimitiveProps } from "../primitives/common";
import { Counter, Decode, Highlight, MaskReveal, Stomp, Strike } from "../primitives/text";
import { Chat, Code, DayStamp, GhGrid, Notifs, Terminal } from "../primitives/ui";
import { Bars, List, Outro, Photo, Versus } from "../primitives/layout";
import { Browser, CommentCta, Phone, Poll, Search, Tweet } from "../primitives/social";
import { Burst, Quote, Roadmap, SplitFlap, Tape, TierList } from "../primitives/kinetic";
import { Calendar, Checklist, LineChart, Meter, Price, Ring } from "../primitives/data";
import { BeforeAfter, CardFan, Flip3D, GlitchTitle, Orbit, ZoomThrough } from "../primitives/cinematic";
import { AuroraType, Blob, CodeRain, DotWave, FlowField, Globe, IsoBuild, NeuralNet, Prism, Radar, Warp } from "../primitives/generative";
import { ErrorPopups, Keyboard, Loading, Pov, Receipt, Rotator, Scoreboard, SlotMachine, Spotlight, StickyNotes, Timer, Verdict } from "../primitives/memes";
import { AppGrid, Funnel, Headlines, History, Iceberg, MindMap, NewsBanner, Pie, Pyramid, Quadrant, StatGrid, Venn } from "../primitives/explainers";
import { ArchiveFilm, BookChapter, Declassified, FactCard, Locate, MuseumFrame, RedString, ResearchPaper, ScaleCompare, ThenNow, Typewriter, YearRewind } from "../primitives/documentary";

export type PrimitiveMeta = {
  id: string;
  category: "text" | "ui" | "data" | "layout" | "media" | "brand";
  /** True if the primitive already shows the words or a big hero word → karaoke captions are hidden (one text layer per beat). */
  showsText: boolean;
  /** Energy it suits best (the editor LLM uses this as a hint). */
  energy: 1 | 2 | 3;
  description: string;
  /** Prop schema in plain words — this text is fed to the editor LLM verbatim. */
  props: string;
};

type Entry = { Component: React.FC<PrimitiveProps>; meta: PrimitiveMeta };

const def = (Component: React.FC<PrimitiveProps>, meta: PrimitiveMeta): Entry => ({ Component, meta });

/**
 * THE MENU. Claude Code authors primitives once; the daily editor LLM only picks ids + fills props.
 * Unknown ids fall back to "stomp", so a typo never breaks a render.
 */
export const REGISTRY: Record<string, Entry> = {
  stomp: def(Stomp, { id: "stomp", category: "text", showsText: true, energy: 3, description: "Giant words slam in one per spoken word; emphasis words get an accent block + echo. The hook primitive.", props: "none (uses beat.text + emphasis)" }),
  maskReveal: def(MaskReveal, { id: "maskReveal", category: "text", showsText: true, energy: 2, description: "Editorial headline: lines slide up out of masks with a kicker label and accent rule.", props: "kicker?: string" }),
  decode: def(Decode, { id: "decode", category: "text", showsText: true, energy: 2, description: "Hacker scramble: glyphs lock in left-to-right with a blinking cursor. Tech reveals, secrets.", props: "none" }),
  highlight: def(Highlight, { id: "highlight", category: "text", showsText: true, energy: 1, description: "Calm sentence; a marker swipes across the emphasis word exactly when it is spoken.", props: "none (set emphasis)" }),
  counter: def(Counter, { id: "counter", category: "data", showsText: false, energy: 3, description: "Odometer: digit columns roll to a big number. Money, views, days, users.", props: "from?: number, to: number, prefix?: string, suffix?: string, label?: string" }),
  strike: def(Strike, { id: "strike", category: "text", showsText: false, energy: 3, description: "Myth-bust: the wrong claim gets struck through, then the right one slams in.", props: "wrong: string, right: string" }),
  terminal: def(Terminal, { id: "terminal", category: "ui", showsText: false, energy: 2, description: "macOS terminal; commands type themselves, output lines land. Build-in-public proof.", props: "lines: string[] ('$ cmd' for commands, plain for output, '✓ ...' green), title?: string" }),
  code: def(Code, { id: "code", category: "ui", showsText: false, energy: 2, description: "Code editor with syntax highlight; lines type in. Show the actual trick.", props: "lines: string[], file?: string" }),
  notifs: def(Notifs, { id: "notifs", category: "ui", showsText: false, energy: 3, description: "iOS notification banners stack in — the dopamine hit (subs, sales, DMs).", props: "items: {app, title, body?, color?: hex, icon?: 1 char}[]" }),
  chat: def(Chat, { id: "chat", category: "ui", showsText: false, energy: 2, description: "DM thread with typing dots before each bubble. Story via messages.", props: "messages: {from: 'me'|'them', text}[], name?: string" }),
  ghGrid: def(GhGrid, { id: "ghGrid", category: "data", showsText: false, energy: 2, description: "GitHub contribution graph sweeps in with a counting total. Proof of consistency.", props: "count?: number, label?: string" }),
  dayStamp: def(DayStamp, { id: "dayStamp", category: "brand", showsText: true, energy: 3, description: "Series identity: 'DAY 01' rubber-stamps with a shockwave + title. Open every build-in-public video with it.", props: "day: number, title?: string" }),
  list: def(List, { id: "list", category: "layout", showsText: false, energy: 2, description: "Numbered items punch in; current item lit, others dim.", props: "items: string[], title?: string" }),
  versus: def(Versus, { id: "versus", category: "layout", showsText: false, energy: 2, description: "Split screen old-way (struck, grey) vs new-way (lit accent) with a spinning VS badge.", props: "left: string, right: string, leftSub?: string, rightSub?: string" }),
  bars: def(Bars, { id: "bars", category: "data", showsText: false, energy: 2, description: "Horizontal bar race with counting values; winner glows.", props: "data: {label, value}[], unit?: string, prefix?: string, highlight?: index, title?: string" }),
  photo: def(Photo, { id: "photo", category: "media", showsText: false, energy: 1, description: "Photo as a floating 3D card with Ken-Burns push, blurred self-background and caption tag. With only a `prompt`, a free AI image is generated; with neither, a seeded generative world renders instead.", props: "src?: 'photos/<file>' (in public/) or https URL, prompt?: string (AI image of a scene, no text), caption?: string" }),
  tweet: def(Tweet, { id: "tweet", category: "ui", showsText: false, energy: 2, description: "X/Threads post card tilts in, text types, likes/reposts climb, heart pops. Hot takes, quotes from people.", props: "body?: string, name?: string, handle?: string, likes?: number, reposts?: number" }),
  commentCta: def(CommentCta, { id: "commentCta", category: "brand", showsText: false, energy: 3, description: "Giant pulsing keyword + pinned IG comment ('Comment SYSTEM and I'll DM you…'). The engagement CTA; use near the end.", props: "keyword: string, line?: string" }),
  poll: def(Poll, { id: "poll", category: "ui", showsText: false, energy: 2, description: "IG story poll sticker; a tap lands and percentages race to the result.", props: "question: string, options: string[], result: number[] (percents)" }),
  search: def(Search, { id: "search", category: "ui", showsText: false, energy: 2, description: "Google search bar: query types, autocomplete drops, one suggestion highlights. 'Everyone is searching for…'", props: "query: string, suggestions?: string[], pick?: index" }),
  browser: def(Browser, { id: "browser", category: "ui", showsText: false, energy: 2, description: "Browser: URL types, page loads, hero + cards stagger in. Product / website reveal.", props: "url: string, headline?: string, cards?: string[] (max 3)" }),
  phone: def(Phone, { id: "phone", category: "ui", showsText: false, energy: 1, description: "iPhone tilts in in 3D and auto-scrolls a feed of items.", props: "items: string[], app?: string" }),
  splitFlap: def(SplitFlap, { id: "splitFlap", category: "text", showsText: true, energy: 2, description: "Airport split-flap board flips to the words (max ~4 rows x 10 chars). Announcements, dates, launches.", props: "rows?: string[] (else derived from text)" }),
  tape: def(Tape, { id: "tape", category: "text", showsText: true, energy: 3, description: "Two crossing marquee tapes scroll opposite ways; a hero word slams in between. Hype/section break.", props: "tape: string (repeating), word: string" }),
  quote: def(Quote, { id: "quote", category: "text", showsText: true, energy: 1, description: "Huge quote mark swings in, quote reveals word-by-word synced to the voice, author tag.", props: "author?: string" }),
  roadmap: def(Roadmap, { id: "roadmap", category: "layout", showsText: false, energy: 2, description: "Vertical path draws, a glowing dot travels it lighting each milestone. Plans, process, 'how I did it'.", props: "steps: string[] (max 5), done?: number (steps completed; rest show 'soon')" }),
  burst: def(Burst, { id: "burst", category: "text", showsText: true, energy: 3, description: "Word slams centre while a ring of particles explodes with gravity. Wins, milestones.", props: "word: string, glyphs?: string[]" }),
  tierList: def(TierList, { id: "tierList", category: "data", showsText: false, energy: 2, description: "S/A/B/C tier rows; items fly into their tier one by one. Opinion/ranking content.", props: "items: {name, tier}[], tiers?: string[]" }),
  meter: def(Meter, { id: "meter", category: "data", showsText: false, energy: 3, description: "Speedometer needle slams to a value with a glowing arc. Intensity, scores, 'how hard is it'.", props: "value: 0-100, unit?: string, label?: string" }),
  ring: def(Ring, { id: "ring", category: "data", showsText: false, energy: 2, description: "Donut fills to a percentage with a spark on the leading edge; number counts inside.", props: "value: 0-100, label?: string" }),
  lineChart: def(LineChart, { id: "lineChart", category: "data", showsText: false, energy: 2, description: "Growth curve draws itself with a glowing pen tip and area fill; end value tag pops.", props: "data: number[], label?: string, end?: string (e.g. '+412%')" }),
  calendar: def(Calendar, { id: "calendar", category: "data", showsText: false, energy: 2, description: "Month grid; days get X'd off fast up to today, which pulses. Streaks, 'day N', countdowns.", props: "day: number, days?: number, month?: string (header)" }),
  price: def(Price, { id: "price", category: "data", showsText: false, energy: 3, description: "Old price gets slashed, new price drops in huge. '$4,000 → $0'.", props: "was: string, now: string, note?: string" }),
  checklist: def(Checklist, { id: "checklist", category: "layout", showsText: false, energy: 2, description: "Items tick off in sequence with drawn checks and soft strikes. Steps done, requirements.", props: "items: string[], title?: string" }),
  flip3d: def(Flip3D, { id: "flip3d", category: "text", showsText: true, energy: 2, description: "Each word rotates in on X like a cube face exactly when spoken. Clean premium kinetic type.", props: "none (uses text + emphasis)" }),
  glitchTitle: def(GlitchTitle, { id: "glitchTitle", category: "text", showsText: true, energy: 3, description: "Title with RGB split, slice-displacement bursts and scanlines. Tech/hacker/news beats.", props: "title?: string" }),
  zoomThrough: def(ZoomThrough, { id: "zoomThrough", category: "text", showsText: true, energy: 3, description: "Camera flies INTO a giant word, through an accent flash, revealing the next line. Big transitions of idea.", props: "word: string (short), reveal: string" }),
  orbit: def(Orbit, { id: "orbit", category: "layout", showsText: false, energy: 1, description: "Keywords orbit a centre word on a tilted 3D ring with depth blur. Ecosystems, 'everything around X'.", props: "center: string, items: string[] (4-7)" }),
  cardFan: def(CardFan, { id: "cardFan", category: "layout", showsText: false, energy: 2, description: "Deck deals and fans out; the chosen card lifts, spins and lights. 'Pick one', options, the secret card.", props: "cards: string[] (3-6), pick?: index" }),
  beforeAfter: def(BeforeAfter, { id: "beforeAfter", category: "media", showsText: false, energy: 2, description: "Wipe slider sweeps from BEFORE (grey) to AFTER (lit). Works with two photos or as labelled panels.", props: "before?: 'photos/..', after?: 'photos/..', beforeLabel?: string, afterLabel?: string" }),
  globe: def(Globe, { id: "globe", category: "media", showsText: false, energy: 2, description: "GENERATIVE: rotating wireframe planet; arcs launch from the home city to others and draw across it. Global reach, markets, expansion.", props: "pins?: {name, lat, lon}[] (first = home; default Karachi→Dubai/London/Lagos/Singapore/Istanbul), label?: string" }),
  warp: def(Warp, { id: "warp", category: "media", showsText: true, energy: 3, description: "GENERATIVE: hyperspace star streaks rush past, then the word arrives. Big openings, 'the future'.", props: "word?: string" }),
  blob: def(Blob, { id: "blob", category: "media", showsText: true, energy: 1, description: "GENERATIVE: liquid metaball morphs and breathes with orbiting droplets; word on top. Calm concept beats.", props: "word?: string" }),
  flowField: def(FlowField, { id: "flowField", category: "media", showsText: true, energy: 1, description: "GENERATIVE: hundreds of particle trails follow a wind/noise field. Premium calm backdrop for a statement.", props: "word?: string" }),
  isoBuild: def(IsoBuild, { id: "isoBuild", category: "media", showsText: false, energy: 2, description: "GENERATIVE: isometric blocks drop and stack into a tower, one labelled layer each. 'What I built', stacks, foundations.", props: "layers: string[] (3-6, bottom first)" }),
  dotWave: def(DotWave, { id: "dotWave", category: "media", showsText: true, energy: 1, description: "GENERATIVE: 3D ocean of dots rolls under the word. Data/AI/scale vibe.", props: "word?: string" }),
  prism: def(Prism, { id: "prism", category: "text", showsText: true, energy: 2, description: "GENERATIVE: real 3D cube snaps a quarter-turn per face; each face carries a word. 3-4 punchy words.", props: "faces?: string[] (2-4 short words)" }),
  auroraType: def(AuroraType, { id: "auroraType", category: "text", showsText: true, energy: 1, description: "GENERATIVE: giant type filled with a moving aurora gradient over light ribbons. Premium poster statement.", props: "word?: string (else the spoken words build up)" }),
  neuralNet: def(NeuralNet, { id: "neuralNet", category: "media", showsText: false, energy: 2, description: "GENERATIVE: neural network layers; signal pulses fire through edges to an output label. AI explainers.", props: "output: string, inputs?: string[] (3-6 labels)" }),
  codeRain: def(CodeRain, { id: "codeRain", category: "media", showsText: true, energy: 3, description: "GENERATIVE: falling glyph columns; the word resolves out of the rain. Hacker/AI intros.", props: "word?: string" }),
  radar: def(Radar, { id: "radar", category: "media", showsText: false, energy: 2, description: "GENERATIVE: radar beam sweeps; tagged blips light up as it passes. Opportunities, scanning a market.", props: "items: string[] (3-6), label?: string" }),
  pov: def(Pov, { id: "pov", category: "text", showsText: true, energy: 2, description: "MEME: 'POV:' tag slams, the scenario types out inside camera viewfinder corners with a REC dot. Relatable openers.", props: "text?: string (scenario; else beat text without 'POV:')" }),
  loading: def(Loading, { id: "loading", category: "ui", showsText: false, energy: 2, description: "MEME: progress bar fills, stalls at 99% ('time remaining: 98 years'), then snaps to 100 with a flash.", props: "label?: string, done?: string" }),
  errorPopups: def(ErrorPopups, { id: "errorPopups", category: "ui", showsText: false, energy: 3, description: "MEME: retro OS error dialogs cascade ('motivation.exe has stopped responding'). Struggles, burnout, chaos.", props: "errors: string[] (3-5 short lines)" }),
  receipt: def(Receipt, { id: "receipt", category: "data", showsText: false, energy: 2, description: "Thermal receipt prints line items, TOTAL, then a PAID stamp slams. Cost breakdowns.", props: "lines: {item, price}[], total: string, title?: string, stamp?: string" }),
  rotator: def(Rotator, { id: "rotator", category: "text", showsText: true, energy: 2, description: "'I build [apps → brands → videos → empires]' — the last word rolls through options, lands on the final one.", props: "lead: string, words: string[] (last = punchline)" }),
  slotMachine: def(SlotMachine, { id: "slotMachine", category: "data", showsText: false, energy: 3, description: "Three reels spin and land one by one; jackpot glow. Luck vs systems, 'the odds'.", props: "result: string[3] (single chars/emoji), symbols?: string[], label?: string" }),
  verdict: def(Verdict, { id: "verdict", category: "text", showsText: false, energy: 3, description: "A claim card gets slammed with a stamp (OVERRATED / APPROVED / MYTH). Hot takes, myth-busting.", props: "claim: string, verdict: string, good?: boolean (green stamp)" }),
  timer: def(Timer, { id: "timer", category: "data", showsText: false, energy: 3, description: "Countdown clock races to 00:00 with a shrinking ring; pulses when urgent. Urgency, deadlines.", props: "from?: seconds, label?: string" }),
  stickyNotes: def(StickyNotes, { id: "stickyNotes", category: "layout", showsText: false, energy: 2, description: "Sticky notes slap onto the wall at jaunty angles, one per idea (max 4).", props: "notes: string[] (max 4, 1-3 words each)" }),
  spotlight: def(Spotlight, { id: "spotlight", category: "text", showsText: true, energy: 2, description: "Black stage; a spotlight searches, then locks onto the word. The big reveal.", props: "word?: string" }),
  keyboard: def(Keyboard, { id: "keyboard", category: "ui", showsText: false, energy: 2, description: "3D keyboard; keys light as a shortcut is pressed, combo appears above. Tips, shortcuts, tools.", props: "keys: string[] (e.g. ['CTRL','SHIFT','P'] — letters must exist on the keyboard), caption?: string" }),
  scoreboard: def(Scoreboard, { id: "scoreboard", category: "data", showsText: false, energy: 2, description: "Stadium scoreboard: two sides, stat rows count up, winning values glow.", props: "a: string, b: string, rows: {label, a: number, b: number}[], lowerWins?: string[] (row labels where lower is better)" }),
  newsBanner: def(NewsBanner, { id: "newsBanner", category: "text", showsText: true, energy: 3, description: "NEWS: BREAKING/LIVE bar wipes in, headline slams, ticker crawls. Open every tech-news reel with it.", props: "headline: string, label?: string ('BREAKING'), ticker?: string" }),
  headlines: def(Headlines, { id: "headlines", category: "text", showsText: false, energy: 2, description: "NEWS: newspaper clippings from different outlets stack up, rotated. 'Everyone is talking about this'.", props: "clips: {source, title}[] (2-3; invent generic outlet names, never real publications)" }),
  history: def(History, { id: "history", category: "layout", showsText: false, energy: 2, description: "Horizontal timeline scrolls through years; active milestone lifts. Company/tech history, 'how we got here'.", props: "items: {year, text}[] (3-5)" }),
  appGrid: def(AppGrid, { id: "appGrid", category: "ui", showsText: false, energy: 2, description: "Home-screen app grid; one icon jiggles then lifts. 'The tools I use', tool reveals.", props: "apps: {name, letter?, color?}[] (6-9), pick?: index" }),
  mindMap: def(MindMap, { id: "mindMap", category: "layout", showsText: false, energy: 2, description: "Centre idea with curved branches drawing out to child nodes. Frameworks, 'everything you need for X'.", props: "center: string, branches: string[] (4-7)" }),
  funnel: def(Funnel, { id: "funnel", category: "data", showsText: false, energy: 2, description: "Funnel stages narrow downward with values. Marketing/sales/growth breakdowns.", props: "stages: {label, value}[] (3-5, top first)" }),
  venn: def(Venn, { id: "venn", category: "layout", showsText: false, energy: 2, description: "Two circles slide together; the overlap label slams in. 'The sweet spot'.", props: "a: string, b: string, mid: string" }),
  pyramid: def(Pyramid, { id: "pyramid", category: "layout", showsText: false, energy: 2, description: "Levels stack bottom-up into a pyramid; top tier lit. Hierarchies, priorities.", props: "levels: string[] (3-5, bottom first)" }),
  quadrant: def(Quadrant, { id: "quadrant", category: "data", showsText: false, energy: 2, description: "2x2 matrix; option dots pop in, the hero dot travels to the best corner (low effort, high impact).", props: "dots: {label, x: 0-1, y: 0-1}[], hero: string, xLabel?: string, yLabel?: string" }),
  iceberg: def(Iceberg, { id: "iceberg", category: "layout", showsText: false, energy: 2, description: "MEME: iceberg — the tip is what people see; camera dives and hidden layers appear below. Success vs reality.", props: "top: string, below: string[] (3-5)" }),
  pie: def(Pie, { id: "pie", category: "data", showsText: false, energy: 2, description: "Pie slices sweep in; the biggest pops out; % labels + legend.", props: "data: {label, value}[] (2-5)" }),
  statGrid: def(StatGrid, { id: "statGrid", category: "data", showsText: false, energy: 2, description: "2x2 KPI tiles flip up in sequence with counting numbers. Results recaps.", props: "stats: {value: number, prefix?, suffix?, label}[] (4)" }),
  archiveFilm: def(ArchiveFilm, { id: "archiveFilm", category: "media", showsText: false, energy: 1, description: "DOC: the image plays as an old film strip (sprocket holes, gate weave, scratches) with a stamped PLACE · YEAR. History scenes.", props: "prompt?: string (AI image of the historical scene, no text) or src?: 'photos/..', year?: string, place?: string" }),
  yearRewind: def(YearRewind, { id: "yearRewind", category: "data", showsText: false, energy: 3, description: "DOC: time travel — the year counter spins back (2026 → 1969) while colour fades to sepia, then lands. History intros.", props: "from?: number (default 2026), to: number, label?: string" }),
  declassified: def(Declassified, { id: "declassified", category: "text", showsText: false, energy: 2, description: "DOC: typed case file with black redaction bars; the key line is un-redacted, then DECLASSIFIED stamps. Hidden history, mysteries.", props: "lines: string[] (3-4 short), reveal: index of the line to un-redact, title?: string" }),
  redString: def(RedString, { id: "redString", category: "layout", showsText: false, energy: 2, description: "DOC: detective cork board; cards pin up and red string connects them in order, last one circled. Cause → effect chains.", props: "cards: string[] (3-5, 1-4 words each)" }),
  researchPaper: def(ResearchPaper, { id: "researchPaper", category: "text", showsText: false, energy: 2, description: "DOC: journal page tilts up; highlighter sweeps the key finding; SOURCE tag pops. Research facts — always pass the real citation.", props: "finding: string (1 sentence), title?: string, citation?: string (e.g. 'Nature, 2023' — ONLY if given in the script)" }),
  factCard: def(FactCard, { id: "factCard", category: "text", showsText: false, energy: 2, description: "DOC: collectible 'FACT #07' card flips in with a holo sheen; the fact in bold, source line at the bottom. Fact series.", props: "fact: string, n?: number, source?: string (only if given in the script)" }),
  scaleCompare: def(ScaleCompare, { id: "scaleCompare", category: "data", showsText: false, energy: 2, description: "DOC: size comparison — circles grow to TRUE relative scale and the camera zooms out to fit each bigger one; ratio counter. 'How big is it really'.", props: "items: {label, size: number (relative)}[] (2-5, real values only), unit?: string (default '×')" }),
  bookChapter: def(BookChapter, { id: "bookChapter", category: "brand", showsText: false, energy: 1, description: "DOC: a hardback opens in 3D onto 'CHAPTER III' + title. Splits long explainers into chapters.", props: "chapter: string (roman numeral), title: string, cover?: string" }),
  locate: def(Locate, { id: "locate", category: "media", showsText: false, energy: 2, description: "DOC: satellite target-lock — coordinates tick in, rings tighten, crosshair locks, place name prints. 'Where it happened'.", props: "place: string, lat: number, lon: number (real coordinates), year?: string" }),
  museumFrame: def(MuseumFrame, { id: "museumFrame", category: "media", showsText: false, energy: 1, description: "DOC: gilded gallery frame under a spotlight holds an aged portrait; brass placard with name and dates. Historical figures.", props: "prompt?: string (AI portrait, no text) or src?, name: string, dates?: string" }),
  typewriter: def(Typewriter, { id: "typewriter", category: "text", showsText: true, energy: 1, description: "DOC: old paper in a typewriter; the spoken words type in sync with key-strike jitter. Letters, quotes, documents.", props: "heading?: string (e.g. 'LONDON, 1940')" }),
  thenNow: def(ThenNow, { id: "thenNow", category: "media", showsText: false, energy: 2, description: "DOC: split frame — THEN (sepia film) above, NOW (colour) wipes in below. How things changed.", props: "prompt?: string (then scene), prompt2?: string (now scene), then?: label, now?: label" }),
  outro: def(Outro, { id: "outro", category: "brand", showsText: false, energy: 1, description: "End card: avatar ring draws, handle types, follow button gets tapped. Always the last beat.", props: "handle?: string, cta?: string, logo?: 'brand/<file>'" }),
};

export const resolvePrimitive = (id: string): Entry => REGISTRY[id] || REGISTRY.stomp;

/** Plain-text menu for the editor LLM prompt (generated, so the prompt never drifts from the code). */
export const menuForLLM = () =>
  Object.values(REGISTRY)
    .map(({ meta: m }) => `- ${m.id} [${m.category}, energy ${m.energy}]: ${m.description} Props: ${m.props}`)
    .join("\n");
