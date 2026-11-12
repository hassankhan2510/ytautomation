import type React from "react";
import type { PrimitiveProps } from "../primitives/common";
import { Counter, Decode, Highlight, MaskReveal, Stomp, Strike } from "../primitives/text";
import { Chat, Code, DayStamp, GhGrid, Notifs, Terminal } from "../primitives/ui";
import { Bars, List, Outro, Photo, Versus } from "../primitives/layout";

export type PrimitiveMeta = {
  id: string;
  category: "text" | "ui" | "data" | "layout" | "media" | "brand";
  /** True if the primitive already shows the spoken words → karaoke captions are hidden on it. */
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
  dayStamp: def(DayStamp, { id: "dayStamp", category: "brand", showsText: false, energy: 3, description: "Series identity: 'DAY 01' rubber-stamps with a shockwave + title. Open every build-in-public video with it.", props: "day: number, title?: string" }),
  list: def(List, { id: "list", category: "layout", showsText: false, energy: 2, description: "Numbered items punch in; current item lit, others dim.", props: "items: string[], title?: string" }),
  versus: def(Versus, { id: "versus", category: "layout", showsText: false, energy: 2, description: "Split screen old-way (struck, grey) vs new-way (lit accent) with a spinning VS badge.", props: "left: string, right: string, leftSub?: string, rightSub?: string" }),
  bars: def(Bars, { id: "bars", category: "data", showsText: false, energy: 2, description: "Horizontal bar race with counting values; winner glows.", props: "data: {label, value}[], unit?: string, prefix?: string, highlight?: index, title?: string" }),
  photo: def(Photo, { id: "photo", category: "media", showsText: false, energy: 1, description: "User photo as a floating 3D card with Ken-Burns push, blurred self-background and caption tag.", props: "src: 'photos/<file>' (in public/) or https URL, caption?: string" }),
  outro: def(Outro, { id: "outro", category: "brand", showsText: false, energy: 1, description: "End card: avatar ring draws, handle types, follow button gets tapped. Always the last beat.", props: "handle?: string, cta?: string, logo?: 'brand/<file>'" }),
};

export const resolvePrimitive = (id: string): Entry => REGISTRY[id] || REGISTRY.stomp;

/** Plain-text menu for the editor LLM prompt (generated, so the prompt never drifts from the code). */
export const menuForLLM = () =>
  Object.values(REGISTRY)
    .map(({ meta: m }) => `- ${m.id} [${m.category}, energy ${m.energy}]: ${m.description} Props: ${m.props}`)
    .join("\n");
