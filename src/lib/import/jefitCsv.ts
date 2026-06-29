/**
 * Parser for JEFIT's multi-section CSV export.
 *
 * The export is several DB tables dumped into one file, each introduced by a
 * `### SECTION NAME ###` banner, followed by a CSV header row and data rows.
 * Some fields are quoted because they contain commas (timestamps, exercise
 * names, and crucially the `logs` field like "155.0x8,155.0x8,155.0x8").
 *
 * This module only knows how to read the file into typed rows. Turning those
 * rows into training history lives in the domain extractors at the bottom.
 */

export interface Section {
  name: string;
  header: string[];
  rows: Record<string, string>[];
}

export type JefitExport = Map<string, Section>;

/** Parse one CSV line, respecting double-quoted fields. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

const SECTION_RE = /^###\s+([A-Z][A-Z0-9 ]*?)\s*#+\s*$/;
const DIVIDER_RE = /^#+\s*$/; // a line of only hashes

/**
 * Read the whole export into sections. When a section contains more than one
 * sub-table (e.g. ROUTINES), only the FIRST header+rows group is kept under the
 * section name; the others are ignored. The sections we care about for training
 * history (EXERCISE LOGS, EXERCISE SET LOGS, WORKOUT SESSIONS) are single-table.
 */
export function parseJefitExport(text: string): JefitExport {
  const lines = text.split(/\r?\n/);
  const sections: JefitExport = new Map();

  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(SECTION_RE);
    if (!m) {
      i++;
      continue;
    }
    const name = m[1].trim();
    i++;

    // Skip blanks/dividers until the header row.
    while (i < lines.length && (lines[i].trim() === "" || DIVIDER_RE.test(lines[i]))) i++;
    if (i >= lines.length || SECTION_RE.test(lines[i])) continue;

    const header = parseCsvLine(lines[i]);
    i++;

    const rows: Record<string, string>[] = [];
    while (i < lines.length) {
      const line = lines[i];
      if (SECTION_RE.test(line)) break; // next section
      if (line.trim() === "" || DIVIDER_RE.test(line)) {
        i++;
        continue;
      }
      const values = parseCsvLine(line);
      // A repeated header row (sub-tables) — skip it rather than treat as data.
      if (values[0] === header[0] && values[1] === header[1]) {
        i++;
        continue;
      }
      const row: Record<string, string> = {};
      header.forEach((col, idx) => (row[col] = values[idx] ?? ""));
      rows.push(row);
      i++;
    }

    if (!sections.has(name)) sections.set(name, { name, header, rows });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Domain extractors: JEFIT rows -> training history
// ---------------------------------------------------------------------------

export interface LoggedSet {
  weight: number; // lbs
  reps: number;
}

export interface ExerciseEntry {
  date: string; // yyyy-mm-dd (JEFIT `mydate`)
  exerciseId: string;
  name: string;
  sessionId: string;
  sets: LoggedSet[];
}

/** Parse a logs string like "45x6,75x5,145.0x8,145.0x8" into sets. */
export function parseLogsString(logs: string): LoggedSet[] {
  if (!logs) return [];
  return logs
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [w, r] = chunk.split("x");
      return { weight: parseFloat(w), reps: parseInt(r, 10) };
    })
    .filter((s) => Number.isFinite(s.weight) && Number.isFinite(s.reps));
}

/** Pull every exercise-session entry from the EXERCISE LOGS table (full history). */
export function extractExerciseEntries(exp: JefitExport): ExerciseEntry[] {
  const section = exp.get("EXERCISE LOGS");
  if (!section) return [];
  return section.rows
    .map((r) => ({
      date: r["mydate"],
      exerciseId: r["eid"],
      name: r["ename"],
      sessionId: r["belongsession"],
      sets: parseLogsString(r["logs"]),
    }))
    .filter((e) => e.date && e.sets.length > 0);
}
