/**
 * PRIMITIVE LIBRARY — 30 simple, recognizable, DRAW-ON-friendly icons (100x100 viewBox).
 *
 * Each primitive has:
 *   draw  — the full outline path, animated stroke-on (the "hand drawing" effect).
 *   fill? — an optional CLOSED sub-region filled with the accent gradient AFTER the draw completes,
 *           giving the premium 2.5D "ink lifts off the page" look (skip for pure line icons).
 *   tags  — keywords the AI selector matches script lines against.
 *
 * Keep new icons single-ish outline paths (works with the draw-on). Scales to 100+ the same way.
 */
export type Primitive = { id: string; tags: string[]; draw: string; fill?: string };

const C = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;

export const PRIMITIVES: Primitive[] = [
  { id: "idea", tags: ["idea", "insight", "innovation", "think", "learn", "lesson", "aha", "realize"],
    draw: `${C(50, 40, 20)} M42 62 h16 M44 70 h12 M47 78 h6`, fill: C(50, 40, 20) },
  { id: "rocket", tags: ["launch", "startup", "growth", "ship", "scale", "fast", "takeoff", "momentum"],
    draw: `M50 12 C62 24 66 44 62 64 L38 64 C34 44 38 24 50 12 Z M38 58 L26 74 L40 66 M62 58 L74 74 L60 66 ${C(50, 40, 6)} M44 70 q6 12 12 0`,
    fill: `M50 12 C62 24 66 44 62 64 L38 64 C34 44 38 24 50 12 Z` },
  { id: "chart_up", tags: ["growth", "revenue", "chart", "increase", "results", "profit", "up", "traction"],
    draw: `M18 18 V82 H86 M28 70 L46 52 L58 60 L82 30 M82 30 H70 M82 30 V42` },
  { id: "bars", tags: ["data", "metrics", "comparison", "stats", "numbers", "benchmark"],
    draw: `M22 82 H84 M30 82 V60 H44 V82 M50 82 V44 H64 V82 M70 82 V28 H84 V82` },
  { id: "arrow_right", tags: ["next", "flow", "then", "leads", "step", "cause", "so", "result"],
    draw: `M20 50 H76 M60 34 L78 50 L60 66` },
  { id: "target", tags: ["goal", "target", "focus", "aim", "objective", "product market fit", "niche"],
    draw: `${C(50, 50, 30)} ${C(50, 50, 18)} ${C(50, 50, 6)}`, fill: C(50, 50, 6) },
  { id: "coin", tags: ["money", "cash", "coin", "revenue", "price", "dollar", "invest", "wealth", "capital"],
    draw: `${C(50, 50, 32)} M50 30 V70 M60 38 H45 a8 8 0 0 0 0 16 h10 a8 8 0 0 1 0 16 H40`, fill: C(50, 50, 32) },
  { id: "person", tags: ["founder", "customer", "person", "user", "you", "individual", "ceo"],
    draw: `${C(50, 30, 12)} M26 82 C26 58 74 58 74 82`, fill: C(50, 30, 12) },
  { id: "people", tags: ["team", "network", "community", "users", "audience", "cohort", "founders", "partners"],
    draw: `${C(36, 30, 10)} M18 76 C18 55 54 55 54 76 ${C(66, 32, 9)} M52 74 C52 57 84 57 84 74` },
  { id: "building", tags: ["company", "business", "market", "corporate", "office", "enterprise", "vc firm"],
    draw: `M28 82 V26 H62 V82 M62 40 H78 V82 M36 34 h6 M50 34 h6 M36 46 h6 M50 46 h6 M36 58 h6 M50 58 h6 M22 82 H84`,
    fill: `M28 82 V26 H62 V82 Z` },
  { id: "warning", tags: ["warning", "risk", "mistake", "danger", "avoid", "fail", "caution", "trap"],
    draw: `M50 18 L84 78 H16 Z M50 40 V60 M50 67 v3`, fill: `M50 18 L84 78 H16 Z` },
  { id: "check", tags: ["success", "correct", "do", "right", "win", "done", "yes", "works"],
    draw: `${C(50, 50, 32)} M34 52 L46 64 L68 38`, fill: C(50, 50, 32) },
  { id: "cross", tags: ["wrong", "dont", "stop", "avoid", "no", "fail", "not", "myth"],
    draw: `${C(50, 50, 32)} M38 38 L62 62 M62 38 L38 62`, fill: C(50, 50, 32) },
  { id: "clock", tags: ["time", "patience", "timing", "wait", "deadline", "speed", "long term", "compound"],
    draw: `${C(50, 50, 32)} M50 50 V30 M50 50 L66 58` },
  { id: "gear", tags: ["system", "how", "process", "engine", "mechanism", "ops", "build", "works"],
    draw: `${C(50, 50, 26)} ${C(50, 50, 10)} M50 24 V14 M50 76 V86 M24 50 H14 M76 50 H86 M31 31 L25 25 M69 31 L75 25 M31 69 L25 75 M69 69 L75 75`,
    fill: C(50, 50, 10) },
  { id: "magnifier", tags: ["research", "find", "search", "analysis", "discover", "insight", "due diligence"],
    draw: `${C(44, 44, 22)} M60 60 L82 82` },
  { id: "steps", tags: ["steps", "how to", "guide", "plan", "roadmap", "process", "framework", "stages"],
    draw: `M18 82 H34 V66 H50 V50 H66 V34 H82` },
  { id: "speech", tags: ["advice", "quote", "talk", "opinion", "say", "message", "story", "ask"],
    draw: `M20 24 H80 V64 H44 L30 78 V64 H20 Z`, fill: `M20 24 H80 V64 H44 L30 78 V64 H20 Z` },
  { id: "shield", tags: ["moat", "defense", "protect", "security", "safe", "trust", "advantage"],
    draw: `M50 16 L80 26 V52 C80 70 66 80 50 86 C34 80 20 70 20 52 V26 Z`,
    fill: `M50 16 L80 26 V52 C80 70 66 80 50 86 C34 80 20 70 20 52 V26 Z` },
  { id: "flag", tags: ["milestone", "goal", "win", "launch", "flag", "achievement", "target hit"],
    draw: `M30 16 V86 M30 20 H74 L64 34 L74 48 H30`, fill: `M30 20 H74 L64 34 L74 48 H30 Z` },
  { id: "handshake", tags: ["deal", "partnership", "agreement", "funding", "close", "acquire", "term sheet"],
    draw: `M18 48 L36 42 L50 52 L64 42 L82 48 M36 42 L46 60 L54 60 L64 42 M46 60 L40 68 M54 60 L60 68` },
  { id: "brain", tags: ["ai", "brain", "learn", "smart", "think", "intelligence", "psychology", "mindset"],
    draw: `M50 24 C34 24 26 36 30 48 C24 56 30 70 44 72 C46 80 58 80 60 72 C74 70 78 56 70 48 C74 36 66 24 50 24 Z M50 24 V72`,
    fill: `M50 24 C34 24 26 36 30 48 C24 56 30 70 44 72 C46 80 58 80 60 72 C74 70 78 56 70 48 C74 36 66 24 50 24 Z` },
  { id: "funnel", tags: ["funnel", "sales", "conversion", "filter", "leads", "pipeline", "acquisition"],
    draw: `M22 24 H78 L56 54 V78 L44 72 V54 Z`, fill: `M22 24 H78 L56 54 V78 L44 72 V54 Z` },
  { id: "scale", tags: ["balance", "tradeoff", "compare", "decision", "risk reward", "versus", "weigh"],
    draw: `M50 20 V76 M30 76 H70 M22 34 H78 M22 34 L14 50 H30 Z M78 34 L70 50 H86 Z` },
  { id: "key", tags: ["key", "unlock", "secret", "access", "solution", "insight", "the answer"],
    draw: `${C(40, 40, 16)} M52 52 L78 78 M70 70 L78 62 M62 78 L70 70`, fill: C(40, 40, 16) },
  { id: "trophy", tags: ["win", "success", "trophy", "best", "achievement", "top", "champion"],
    draw: `M36 20 H64 V38 C64 52 36 52 36 38 Z M36 26 H24 C24 40 32 44 38 44 M64 26 H76 C76 40 68 44 62 44 M48 50 V72 M40 80 H60 L56 68 H44 Z`,
    fill: `M36 20 H64 V38 C64 52 36 52 36 38 Z` },
  { id: "calendar", tags: ["calendar", "schedule", "daily", "date", "plan", "routine", "consistency", "habit"],
    draw: `M22 28 H78 V80 H22 Z M22 42 H78 M34 20 V34 M66 20 V34 M34 54 h8 M52 54 h8 M34 66 h8 M52 66 h8`,
    fill: `M22 28 H78 V42 H22 Z` },
  { id: "cloud", tags: ["cloud", "saas", "tech", "software", "platform", "internet", "infra"],
    draw: `M34 68 a16 16 0 0 1 2 -32 a20 20 0 0 1 38 6 a14 14 0 0 1 -4 26 Z`,
    fill: `M34 68 a16 16 0 0 1 2 -32 a20 20 0 0 1 38 6 a14 14 0 0 1 -4 26 Z` },
  { id: "chart_down", tags: ["loss", "crash", "decline", "down", "drop", "burn", "churn", "risk"],
    draw: `M18 18 V82 H86 M28 34 L46 52 L58 44 L82 70 M82 70 H70 M82 70 V58` },
  { id: "plus", tags: ["add", "more", "grow", "plus", "new", "benefit", "gain", "extra"],
    draw: `${C(50, 50, 32)} M50 34 V66 M34 50 H66`, fill: C(50, 50, 32) },
];

export const byId = (id: string): Primitive | undefined => PRIMITIVES.find((p) => p.id === id);
