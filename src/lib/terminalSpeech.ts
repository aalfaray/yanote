// Pulls the "last answer" out of a terminal buffer so it can be read aloud.
//
// Claude Code transcript layout (rendered text, no ANSI):
//   ❯ user message                      <- user turn (figures.pointer: "❯", or ">" on some consoles)
//   ● Assistant text, wrapped by the       <- answer block; "●" on Windows/Linux, "⏺" on macOS
//     TUI onto several lines.               (continuation lines are indented)
//   ● Bash(npm test)                      <- tool call (not read)
//     ⎿  tool output ...                  <- tool result (not read)
//   ✻ Cogitated for 12s                    <- status line (ends a block)
//   ───────────────                        <- input box border
//   ❯ (input)
// Codex-style CLIs use "›" for the user and "•" for the assistant.
// Markers only count at the start of the line (at most one leading space): indented "•" / ">" inside
// an answer or a tool's output are content, not turns.
// For a plain shell the last command's output (between the last two prompts) is used instead.

const MARK = '[⏺●•]';
const ANSWER_MARK = new RegExp(`^\\s?${MARK}\\s?`);
const USER_TURN = /^\s?[>❯›]\s/;
const TOOL_CALL = new RegExp(`^\\s?${MARK}\\s+(?:[\\w.-]+\\(|[\\w.-]+\\s+-\\s+.+\\(MCP\\))`);
/** Never read more than this many lines when no AI markers are found (fallback safety cap). */
const FALLBACK_MAX_LINES = 40;
const TOOL_RESULT = /^\s*⎿/;
const RULE = /^\s*[─━═]{6,}\s*$/;
const STATUS = /^\s*[✻✶✳✢✽·*]\s/;
const SHELL_PROMPT = /^(?:PS [^>]*>|[A-Za-z]:\\[^>]*>)/;
const BOX_CHARS = /[│┃┌┐└┘├┤┬┴┼─━╭╮╰╯║═╔╗╚╝╠╣╦╩╬]/g;
const LIST_START = /^(?:[-*•]\s|\d+[.)]\s|#{1,6}\s)/;

/** Groups wrapped terminal lines into paragraphs / list items. */
export function linesToParagraphs(lines: string[]): string[] {
  const out: string[] = [];
  let current = '';
  const flush = () => {
    const text = current.replace(BOX_CHARS, ' ').replace(/\s+/g, ' ').trim();
    if (text) out.push(text);
    current = '';
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (LIST_START.test(line)) flush();
    current += (current ? ' ' : '') + line;
  }
  flush();
  return out;
}

/** Answer text of the last Claude Code turn (all text blocks, skipping tool calls and their output). */
function lastClaudeAnswer(lines: string[]): string[] | null {
  let lastAnswer = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (ANSWER_MARK.test(lines[i]) && !TOOL_CALL.test(lines[i])) {
      lastAnswer = i;
      break;
    }
  }
  if (lastAnswer < 0) return null;

  let turnStart = 0;
  for (let i = lastAnswer; i >= 0; i--) {
    if (USER_TURN.test(lines[i])) {
      turnStart = i + 1;
      break;
    }
  }

  const answer: string[] = [];
  let inText = false;
  for (let i = turnStart; i < lines.length; i++) {
    const line = lines[i];
    if (RULE.test(line) || USER_TURN.test(line)) break; // input box / next turn
    if (ANSWER_MARK.test(line)) {
      inText = !TOOL_CALL.test(line);
      if (inText) {
        if (answer.length) answer.push('');
        answer.push(line.replace(ANSWER_MARK, ''));
      }
      continue;
    }
    if (TOOL_RESULT.test(line) || STATUS.test(line)) {
      inText = false;
      continue;
    }
    if (inText) answer.push(line);
  }
  return answer;
}

/** Output of the last shell command: lines between the last two prompts. */
function lastShellOutput(lines: string[]): string[] {
  const prompts: number[] = [];
  lines.forEach((l, i) => SHELL_PROMPT.test(l) && prompts.push(i));
  let output: string[];
  if (prompts.length >= 2) output = lines.slice(prompts[prompts.length - 2] + 1, prompts[prompts.length - 1]);
  else if (prompts.length === 1) output = lines.slice(prompts[0] + 1);
  else output = lines;
  // Only the tail: never read a whole session from the top
  while (output.length && !output[output.length - 1].trim()) output = output.slice(0, -1);
  return output.slice(-FALLBACK_MAX_LINES);
}

/** Speakable paragraphs of the latest answer in the terminal (Claude Code reply or last command output). */
export function extractLastResponse(lines: string[]): string[] {
  const answer = lastClaudeAnswer(lines) ?? lastShellOutput(lines);
  return linesToParagraphs(answer);
}
