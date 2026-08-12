/**
 * Narration for the demo film, with word-accurate cue times.
 *
 * Reads the ¶1–¶7 paragraphs out of demo/script.md and renders one MP3 per
 * paragraph via ElevenLabs' `with-timestamps` endpoint, which returns
 * character-level alignment alongside the audio. That alignment is what lets
 * the edit cut a punch-in on the exact frame a phrase is spoken, instead of
 * hand-typed timecodes that drift the moment a line is reworded.
 *
 * Two things this script refuses to do:
 *   - Speak a hardcoded counter value. Every figure in the narration is a
 *     {{token}} resolved from demo/capture/marks.json, so a stale number
 *     cannot survive a re-capture.
 *   - Resolve a cue phrase approximately. If a cue is not found verbatim in
 *     its paragraph, the build fails rather than guessing an offset.
 *
 * Requires ELEVENLABS_API_KEY in the repo-root .env (gitignored).
 *
 *   pnpm exec tsx scripts/generate-vo.ts        # render every paragraph
 *   pnpm exec tsx scripts/generate-vo.ts p3     # re-render one paragraph
 */
import "dotenv/config";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const DEMO = join(process.cwd(), "demo");
const SCRIPT_MD = join(DEMO, "script.md");
const MARKS = join(DEMO, "capture", "marks.json");
const OUT_DIR = join(DEMO, "vo");

/**
 * Calm, measured, lower register — forensic, not announcer.
 * Voice defaults to George (warm, low narrator); override with ELEVENLABS_VOICE_ID.
 */
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2";
const VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
  speed: 0.92, // slightly slowed, per the brief
};

/**
 * Cue phrases from the shot list, per paragraph. Each becomes a timestamp the
 * assembler cuts on. The phrase must appear verbatim in the paragraph — that
 * coupling is deliberate: reword a line and the build tells you the cue broke,
 * rather than silently firing a punch-in on the wrong word.
 */
const CUES: Record<string, Record<string, string>> = {
  p1: { paysTwice: "and pays twice" },
  p2: { zeroDouble: "zero double payments" },
  p3: {
    reportedFailed: "Reported: failed",
    chainTruth: "Chain truth: success",
    retryBlocked: "Retry blocked",
    oneTransaction: "One transaction, not two",
  },
  p4: {}, // held dead still — no cuts inside this paragraph
  p5: {
    nothingSent: "nothing sent, no hash",
    settlesForReal: "settles for real",
    twoRows: "Two rows, one settlement",
  },
  p6: {}, // one continuous scroll
  p7: { agentsCanAct: "Agents can already act" },
};

interface Paragraph {
  index: number;
  id: string; // p1…p7
  key: string; // capture shot key, e.g. blockedRow
  text: string; // token-resolved, as spoken
  rawText: string; // as authored, tokens intact
}

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

// ── Numbers ────────────────────────────────────────────────────────────────

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/**
 * Spell a counter for the voice. TTS reads bare digits inconsistently — "60"
 * can come out "six zero" — and these numbers are the film's evidence.
 */
function numberToWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) throw new Error(`cannot speak number: ${n}`);
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const o = n % 10;
    return o ? `${t}-${ONES[o]}` : t;
  }
  if (n < 1000) {
    const h = `${ONES[Math.floor(n / 100)]} hundred`;
    const r = n % 100;
    return r ? `${h} and ${numberToWords(r)}` : h;
  }
  throw new Error(`counter ${n} is larger than this script can spell — extend numberToWords`);
}

/** Sentence-initial numbers need a capital; mid-sentence ones must not get one. */
const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// ── Parsing ────────────────────────────────────────────────────────────────

/**
 * Pull `### … — \`key\` (VO ¶N…)` headings and the `**¶N —**` paragraph beneath
 * each. Headings without a paragraph (title cards, notes) are skipped.
 */
function parseParagraphs(md: string): Array<Omit<Paragraph, "text">> {
  const out: Array<Omit<Paragraph, "text">> = [];
  for (const block of md.split(/^### /m).slice(1)) {
    const head = block.split("\n", 1)[0];
    const m = head.match(/`([A-Za-z][A-Za-z0-9]*)`\s*\(VO ¶(\d+)/);
    if (!m) continue;
    const body = block.match(/\*\*¶\d+\s*—\*\*\s*([\s\S]*?)(?=\n\s*\n|$)/);
    if (!body) continue;
    const rawText = body[1].replace(/\s*\n\s*/g, " ").trim();
    if (rawText) out.push({ index: Number(m[2]), id: `p${m[2]}`, key: m[1], rawText });
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Counter tokens, resolved off the capture. Never defaulted. */
async function buildTokens(): Promise<Record<string, string>> {
  let marks: {
    evidence?: {
      countersAtCapture?: Record<string, string>;
      countersAtEnd?: Record<string, string>;
    };
  };
  try {
    marks = JSON.parse(await readFile(MARKS, "utf8"));
  } catch {
    throw new Error(
      `cannot read ${MARKS} — run scripts/capture-demo.ts first. The narration quotes ` +
        `the counters, so it cannot be rendered before the capture that produces them.`,
    );
  }

  const before = marks.evidence?.countersAtCapture;
  const after = marks.evidence?.countersAtEnd;
  if (!before || !after) {
    throw new Error("marks.json has no countersAtCapture/countersAtEnd — re-run the capture.");
  }

  const num = (src: Record<string, string>, label: string): number => {
    const raw = src[label];
    if (raw === undefined) throw new Error(`counter "${label}" missing from the capture`);
    const n = Number(raw.replace(/[^\d]/g, ""));
    if (!Number.isFinite(n)) throw new Error(`counter "${label}" is not a number: ${raw}`);
    return n;
  };

  return {
    settledBefore: capitalise(numberToWords(num(before, "Settled onchain"))),
    reconciledBefore: capitalise(numberToWords(num(before, "Attempts reconciled"))),
    discrepanciesBefore: numberToWords(num(before, "Discrepancies caught")),
    settledAfter: capitalise(numberToWords(num(after, "Settled onchain"))),
    reconciledAfter: capitalise(numberToWords(num(after, "Attempts reconciled"))),
    discrepanciesAfter: numberToWords(num(after, "Discrepancies caught")),
  };
}

function resolveTokens(text: string, tokens: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const v = tokens[name];
    if (v === undefined) throw new Error(`unknown token {{${name}}} in the narration`);
    return v;
  });
}

// ── Render ─────────────────────────────────────────────────────────────────

async function durationOf(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  return Number(stdout.trim());
}

async function render(text: string, outFile: string, apiKey: string): Promise<Alignment> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=mp3_44100_192`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
    },
  );
  if (!res.ok) {
    // Never echo the key; the body is safe and is the only useful diagnostic.
    throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const body = (await res.json()) as { audio_base64: string; alignment: Alignment; normalized_alignment?: Alignment };
  await writeFile(outFile, Buffer.from(body.audio_base64, "base64"));
  const alignment = body.alignment ?? body.normalized_alignment;
  if (!alignment?.characters?.length) {
    throw new Error("ElevenLabs returned no alignment — cue times cannot be derived");
  }
  return alignment;
}

/**
 * Time at which `phrase` begins, from character alignment.
 *
 * Matching is done on a whitespace-normalised copy with an index map back to
 * the original character stream, so a line break in the script never breaks a
 * cue. A cue that does not match is a build failure, not a warning — a punch
 * fired on the wrong word is worse than no film.
 */
function cueTime(alignment: Alignment, phrase: string): number {
  const chars = alignment.characters;
  const flat: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (/\s/.test(c)) {
      if (flat.length && flat[flat.length - 1] !== " ") {
        flat.push(" ");
        map.push(i);
      }
    } else {
      flat.push(c);
      map.push(i);
    }
  }
  const haystack = flat.join("").toLowerCase();
  const needle = phrase.replace(/\s+/g, " ").trim().toLowerCase();
  const at = haystack.indexOf(needle);
  if (at === -1) {
    throw new Error(
      `cue "${phrase}" does not appear in the rendered narration.\n` +
        `  spoken: ${flat.join("")}\n` +
        `  Fix the cue in CUES or the wording in demo/script.md — do not approximate it.`,
    );
  }
  return alignment.character_start_times_seconds[map[at]];
}

async function main(): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY missing — add it to the repo-root .env");
  }

  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const parsed = parseParagraphs(await readFile(SCRIPT_MD, "utf8"));
  if (parsed.length === 0) throw new Error(`no narration parsed from ${SCRIPT_MD}`);

  const tokens = await buildTokens();
  const paragraphs: Paragraph[] = parsed.map((p) => ({ ...p, text: resolveTokens(p.rawText, tokens) }));

  await mkdir(OUT_DIR, { recursive: true });
  const targets = only.length ? paragraphs.filter((p) => only.includes(p.id) || only.includes(p.key)) : paragraphs;
  if (targets.length === 0) throw new Error(`no paragraph matched: ${only.join(", ")}`);

  console.log(`\nVoice ${VOICE_ID} · ${MODEL_ID} · speed ${VOICE_SETTINGS.speed}`);
  console.log(`Counters  ${tokens.settledBefore} → ${tokens.settledAfter} settled\n`);

  interface Entry {
    index: number;
    id: string;
    key: string;
    file: string;
    duration: number;
    words: number;
    text: string;
    cues: Record<string, number>;
  }

  const rendered: Entry[] = [];
  for (const p of targets) {
    const name = `${String(p.index).padStart(2, "0")}-${p.key}.mp3`;
    const outFile = join(OUT_DIR, name);
    const alignment = await render(p.text, outFile, apiKey);
    const duration = await durationOf(outFile);

    const cues: Record<string, number> = {};
    for (const [cueName, phrase] of Object.entries(CUES[p.id] ?? {})) {
      cues[cueName] = cueTime(alignment, phrase);
    }

    await writeFile(join(OUT_DIR, `${p.id}-alignment.json`), JSON.stringify(alignment));
    rendered.push({
      index: p.index,
      id: p.id,
      key: p.key,
      file: name,
      duration,
      words: p.text.split(/\s+/).length,
      text: p.text,
      cues,
    });

    const cueTxt = Object.entries(cues)
      .map(([k, v]) => `${k}@${v.toFixed(1)}s`)
      .join(" ");
    console.log(`  ${name.padEnd(26)} ${duration.toFixed(2).padStart(6)}s  ${cueTxt}`);
  }

  // Merge into any existing manifest so single-paragraph re-renders stay valid.
  const manifestPath = join(OUT_DIR, "manifest.json");
  let merged = rendered;
  if (only.length) {
    try {
      const prev = JSON.parse(await readFile(manifestPath, "utf8")) as Entry[];
      const byId = new Map(prev.map((e) => [e.id, e]));
      for (const e of rendered) byId.set(e.id, e);
      merged = [...byId.values()].sort((a, b) => a.index - b.index);
    } catch {
      /* no previous manifest — first run */
    }
  }
  await writeFile(manifestPath, JSON.stringify(merged, null, 2));

  const total = merged.reduce((n, e) => n + e.duration, 0);
  console.log(
    `\n  total narration ${total.toFixed(1)}s (${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")})`,
  );
  console.log(`  manifest ${manifestPath}\n`);
}

main().catch((err) => {
  console.error("\nVoiceover failed:", err.message);
  process.exit(1);
});
