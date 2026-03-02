import { createInterface } from "readline";
import { execFileSync, spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";

// ============================================================
// TAB COMPLETION
// ============================================================

// Track state between tab presses
let lastPrefix = "";
let tabCount = 0;

// ============================================================
// HISTORY
// ============================================================

// Every command entered by the user is appended here in order.
const history: string[] = [];

// ============================================================
// PATH EXECUTABLES
// ============================================================

/** Scans every directory in $PATH and returns a unique list of executable filenames. */
function getExecutablesFromPath(): string[] {
  const pathEnv = process.env.PATH || "";
  const executables = new Set<string>();

  for (const dir of pathEnv.split(path.delimiter)) {
    try {
      for (const file of fs.readdirSync(dir)) {
        executables.add(file);
      }
    } catch {
      // Skip directories that don't exist or can't be read
    }
  }

  return Array.from(executables);
}

// ============================================================
// BUILT-IN COMMANDS
// ============================================================

const builtInCommands: Record<string, (args: string[]) => void> = {
  echo: (args) => console.log(args.join(" ")),

  pwd: () => console.log(process.cwd()),

  cd: (args) => {
    if (!args[0]) {
      console.error("cd: missing operand");
      return;
    }
    changeDirectory(args[0]);
  },

  type: (args) => {
    const name = args[0];
    if (!name) return;

    if (name in builtInCommands) {
      console.log(`${name} is a shell builtin`);
    } else {
      const found = findExecutable(name);
      if (found) {
        console.log(`${name} is ${found.location}`);
      } else {
        console.log(`${name}: not found`);
      }
    }
  },

  history: (args) => {
    if (args[0] === "-r") {
      // Read history from file and append non-empty lines to in-memory history
      const filePath = args[1];
      if (!filePath) {
        console.error("history: -r: missing filename");
        return;
      }
      try {
        const lines = fs
          .readFileSync(filePath, "utf8")
          .split("\n")
          .filter((line) => line.trim() !== "");
        history.push(...lines);
      } catch {
        console.error(`history: ${filePath}: cannot read file`);
      }
      return;
    }

    if (args[0] === "-w") {
      // Write all in-memory history to file, one command per line + trailing newline
      const filePath = args[1];
      if (!filePath) {
        console.error("history: -w: missing filename");
        return;
      }
      try {
        fs.writeFileSync(filePath, history.join("\n"));
        // fs.writeFileSync(filePath, history.join("\n") + "\n");
      } catch {
        console.error(`history: ${filePath}: cannot write file`);
      }
      return;
    }

    const n = args[0] ? parseInt(args[0], 10) : history.length;
    const start = Math.max(0, history.length - n);
    history.slice(start).forEach((cmd, i) => {
      console.log(`${String(start + i + 1).padStart(4)}  ${cmd}`);
    });
  },

  exit: () => rl.close(),
};

/**
 * Returns the longest string that all entries in `words` start with.
 * e.g. ["xyz_foo", "xyz_foo_bar", "xyz_foo_bar_baz"] → "xyz_foo"
 * e.g. ["abc", "abd"] → "ab"
 */
function getLongestCommonPrefix(words: string[]): string {
  if (words.length === 0) return "";

  let lcp = words[0];

  for (let i = 1; i < words.length; i++) {
    // Shrink lcp until it matches the start of the next word
    while (!words[i].startsWith(lcp)) {
      lcp = lcp.slice(0, -1);
    }
  }

  return lcp;
}

/**
 * readline calls this function every time the user presses TAB.
 * It must return [completionList, prefix] where readline replaces
 * the prefix in the line with the common prefix of completionList.
 *
 * Behaviour:
 *  - No matches       → ring bell, do nothing
 *  - Single match     → complete immediately with a trailing space
 *  - Multiple matches, LCP > prefix → complete to the LCP silently
 *  - Multiple matches, LCP = prefix → 1st TAB: bell, 2nd TAB: print all options
 */
function completer(line: string): [string[], string] {
  // Build a deduplicated, sorted list of all known commands
  const allCommands = [
    ...new Set([...Object.keys(builtInCommands), ...getExecutablesFromPath()]),
  ].sort();

  // If the line has no space we're completing the command name.
  // If it does have a space we're completing the last argument.
  const prefix = line.includes(" ")
    ? line.slice(line.lastIndexOf(" ") + 1)
    : line;

  const matches = allCommands.filter((cmd) => cmd.startsWith(prefix));

  // Reset the tab-press counter whenever the user types a different prefix
  if (prefix !== lastPrefix) {
    tabCount = 0;
    lastPrefix = prefix;
  }

  // --- No matches: ring bell ---
  if (matches.length === 0) {
    process.stdout.write("\x07");
    return [[], prefix];
  }

  // --- Single match: complete it ---
  if (matches.length === 1) {
    tabCount = 0;
    lastPrefix = "";
    return [[matches[0] + " "], prefix]; // trailing space signals "done"
  }

  // --- Multiple Matches ---
  // Find the longest common prefix (LCP) shared by all matches.
  // e.g. ["xyz_foo", "xyz_foo_bar", "xyz_foo_bar_baz"] → "xyz_foo"
  const lcp = getLongestCommonPrefix(matches);

  if (lcp.length > prefix.length) {
    // We can complete further without ambiguity — advance to the LCP.
    // Don't ring the bell; don't show options. Just extend the input.
    tabCount = 0;
    lastPrefix = lcp;
    return [[lcp], prefix];
  }

  // LCP == prefix: no further completion possible without guessing.
  // 1st TAB → ring bell. 2nd TAB → show all options.
  tabCount++;

  if (tabCount === 1) {
    // First TAB → just ring the bell to hint there are options
    process.stdout.write("\x07");
    return [[], prefix];
  }

  // Second TAB → show all options, then redraw the prompt + current input
  console.log();
  console.log(matches.join("  "));
  console.log(`$ ${line}`);
  tabCount = 0;

  return [[], prefix];
}

// ============================================================
// READLINE INTERFACE
// ============================================================

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  completer,
});

rl.setPrompt("$ ");
rl.prompt();

rl.on("line", (line) => {
  const trimmed = line.trim();
  // Don't add empty lines to the history, but do add everything else verbatim (including duplicates). Record every command and add to history
  if (trimmed) history.push(trimmed);
  runCommand(line);
});

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/** Resolves ~ to the home directory and changes the process working directory. */
function changeDirectory(targetPath: string) {
  const home = process.env.HOME || process.env.USERPROFILE;

  if (targetPath === "~") {
    if (!home) {
      console.error("cd: HOME directory not set");
      return;
    }
    targetPath = home;
  }

  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    process.chdir(targetPath);
  } else {
    console.error(`cd: ${targetPath}: No such file or directory`);
  }
}

/**
 * Tokenises a shell input string, respecting single quotes, double quotes,
 * and backslash escaping — just like a real shell would.
 */
function parseInput(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    // Toggle single-quote mode (ignored inside double quotes)
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    // Toggle double-quote mode (ignored inside single quotes)
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (char === "\\") {
      if (inSingleQuote) {
        // Inside single quotes backslash is always literal
        current += char;
      } else if (inDoubleQuote) {
        // Inside double quotes only a handful of chars can be escaped
        const next = input[i + 1];
        if (next && ['"', "\\", "$", "`"].includes(next)) {
          current += next;
          i++;
        } else {
          current += char;
        }
      } else {
        // Outside any quotes the next character is taken literally
        const next = input[i + 1];
        if (next) {
          current += next;
          i++;
        }
      }
      continue;
    }

    // Unquoted whitespace → end of current token
    if (!inSingleQuote && !inDoubleQuote && /\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) tokens.push(current);

  return tokens;
}

/**
 * Uses the system `which` (or `where` on Windows) to locate an executable.
 * Returns undefined when the command is not found.
 */
function findExecutable(name: string): { location: string } | undefined {
  const which = process.platform === "win32" ? "where" : "which";

  try {
    const location = execFileSync(which, [name], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();

    return { location };
  } catch {
    return undefined;
  }
}

// ============================================================
// REDIRECTION
// ============================================================

type Redirection = {
  fd: 1 | 2; // 1 = stdout, 2 = stderr
  file: string;
  append: boolean;
};

/**
 * Scans the token list for a redirection operator (>, 1>, >>, 2>, 2>>).
 * Removes the operator and its target filename from the token list and
 * returns both the cleaned tokens and the redirection descriptor.
 */
function extractRedirection(tokens: string[]): {
  tokens: string[];
  redirection: Redirection | null;
} {
  for (let i = 0; i < tokens.length; i++) {
    const match = tokens[i].match(/^([12]?)(>>|>)$/);
    if (!match) continue;

    if (i === tokens.length - 1) {
      throw new Error("syntax error: no file specified");
    }

    const redirection: Redirection = {
      fd: match[1] === "2" ? 2 : 1,
      append: match[2] === ">>",
      file: tokens[i + 1],
    };

    // Remove the operator and the filename from the token list
    const cleanedTokens = [...tokens];
    cleanedTokens.splice(i, 2);

    return { tokens: cleanedTokens, redirection };
  }

  return { tokens, redirection: null };
}

// ============================================================
// COMMAND RUNNER
// ============================================================

/**
 * Splits a token list on the `|` operator into pipeline stages.
 * e.g. ["cat", "foo.txt", "|", "grep", "bar"] → [["cat", "foo.txt"], ["grep", "bar"]]
 */
function splitPipeline(tokens: string[]): string[][] {
  const stages: string[][] = [];
  let current: string[] = [];

  for (const token of tokens) {
    if (token === "|") {
      stages.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }

  stages.push(current);
  return stages;
}

function runCommand(input: string) {
  let tokens = parseInput(input.trim());
  if (tokens.length === 0) return;

  const stages = splitPipeline(tokens);

  // Pipeline path — two or more commands connected with |
  if (stages.length > 1) {
    runPipeline(stages);
    return;
  }

  // Single command path — extract redirection then dispatch
  let stageTokens = stages[0];
  // Pull out any redirection before we look at the command
  let redirection: Redirection | null = null;
  try {
    ({ tokens: stageTokens, redirection } = extractRedirection(stageTokens));
  } catch (err: any) {
    console.error(err.message);
    rl.prompt();
    return;
  }

  const [command, ...args] = stageTokens;
  if (!command) {
    rl.prompt();
    return;
  }

  // --- Built-in command ---
  if (command in builtInCommands) {
    runBuiltin(command, args, redirection);
    if (command !== "exit") rl.prompt();
    return;
  }

  // --- External command ---
  const found = findExecutable(command);
  if (!found) {
    console.error(`${command}: command not found`);
    rl.prompt();
    return;
  }

  runExternal(command, args, redirection);
}

/**
 * Runs a pipeline of two or more commands, supporting both external
 * commands and built-ins at any position in the pipeline.
 *
 * Strategy:
 *  - External commands are spawned as child processes with stdio pipes.
 *  - Built-in commands are executed in-process; their output is captured
 *    into a Buffer which is then fed into the next stage's stdin.
 */
function runPipeline(stages: string[][]) {
  const last = stages.length - 1;

  // Resolve each stage to either a spawned child or a captured buffer
  type ChildStage = { kind: "child"; proc: ReturnType<typeof spawn> };
  type BufferStage = { kind: "buffer"; data: Buffer };
  type Stage = ChildStage | BufferStage;

  const resolved: Stage[] = stages.map(([command, ...args]) => {
    if (command in builtInCommands) {
      // Built-ins run in-process; capture their output now
      return { kind: "buffer", data: runBuiltinToBuffer(command, args) };
    }
    return { kind: "child", proc: spawn(command, args, { stdio: "pipe" }) };
  });

  // Wire stages together: feed each stage's output into the next's stdin
  for (let i = 0; i < last; i++) {
    const current = resolved[i];
    const next = resolved[i + 1];

    // Get the output of the current stage as a readable source
    const outputData = current.kind === "buffer" ? current.data : null; // child stdout stream handled via .pipe() below

    if (next.kind === "child") {
      if (current.kind === "buffer") {
        // Write the buffer into the child's stdin and close it
        next.proc.stdin!.end(current.data);
      } else {
        // Pipe child stdout directly into next child's stdin
        current.proc.stdout!.pipe(next.proc.stdin!);
      }
    }
    // buffer→buffer: the next buffer was already computed eagerly above,
    // so nothing to wire (built-ins don't consume stdin in our model)
  }

  // Send the last stage's output to the terminal
  const lastStage = resolved[last];
  if (lastStage.kind === "buffer") {
    process.stdout.write(new Uint8Array(lastStage.data));
    rl.prompt();
  } else {
    lastStage.proc.stdout!.pipe(process.stdout);
    lastStage.proc.stderr!.pipe(process.stderr);
    lastStage.proc.on("close", () => rl.prompt());
  }
}

/**
 * Runs a built-in command, optionally redirecting its stdout or stderr
 * to a file. Uses synchronous file writes so the data is guaranteed to
 * be on disk before the next command runs.
 */
function runBuiltin(
  command: string,
  args: string[],
  redirection: Redirection | null,
) {
  if (!redirection) {
    builtInCommands[command](args);
    return;
  }

  const writeFlag = redirection.append ? "a" : "w";

  // Always create/touch the target file upfront so it exists even if
  // the command never writes to the redirected file descriptor.
  // e.g. `echo hi 2> file` — echo never calls console.error, but the
  // shell must still create the file (matching real shell behavior).
  if (!redirection.append) {
    fs.writeFileSync(redirection.file, "", { flag: "w" });
  } else if (!fs.existsSync(redirection.file)) {
    fs.writeFileSync(redirection.file, "", { flag: "a" });
  }

  // Temporarily replace the appropriate console method with one that
  // writes synchronously to the target file.
  const originalLog = console.log;
  const originalError = console.error;

  const writeToFile = (...data: any[]) => {
    fs.writeFileSync(redirection.file, data.join(" ") + "\n", {
      flag: writeFlag,
    });
  };

  if (redirection.fd === 1) {
    console.log = writeToFile;
  } else {
    console.error = writeToFile;
  }

  builtInCommands[command](args);

  // Restore the original console methods
  console.log = originalLog;
  console.error = originalError;
}

/**
 * Runs a built-in command and captures its stdout into a Buffer.
 * Used when a built-in appears inside a pipeline and its output
 * needs to be piped to the next stage instead of printed directly.
 */
function runBuiltinToBuffer(command: string, args: string[]): Buffer {
  const lines: string[] = [];

  const originalLog = console.log;
  console.log = (...data: any[]) => lines.push(data.join(" "));

  builtInCommands[command](args);

  console.log = originalLog;

  return Buffer.from(lines.join("\n") + (lines.length > 0 ? "\n" : ""));
}

/**
 * Runs an external command.
 *
 * - With redirection: uses spawnSync so output is captured and written to the
 *   file synchronously — no race condition with the next buffered command.
 * - Without redirection: uses async spawn so streaming output (e.g. tail -f)
 *   works correctly, with inherited stdout/stderr going straight to the terminal.
 */
function runExternal(
  command: string,
  args: string[],
  redirection: Redirection | null,
) {
  if (redirection) {
    // Run synchronously so the file is fully written before the next command.
    const result = spawnSync(command, args, { encoding: "buffer" });

    const outBuf = result.stdout ?? Buffer.alloc(0);
    const errBuf = result.stderr ?? Buffer.alloc(0);
    const fileFlag = redirection.append ? "a" : "w";

    if (redirection.fd === 1) {
      // stdout → file, stderr → terminal
      fs.writeFileSync(redirection.file, new Uint8Array(outBuf), {
        flag: fileFlag,
      });
      process.stderr.write(new Uint8Array(errBuf));
    } else {
      // stderr → file, stdout → terminal
      fs.writeFileSync(redirection.file, new Uint8Array(errBuf), {
        flag: fileFlag,
      });
      process.stdout.write(new Uint8Array(outBuf));
    }

    rl.prompt();
  } else {
    // No redirection — stream output directly to the terminal.
    // Use async spawn so long-running commands (tail -f, etc.) work.
    const child = spawn(command, args, {
      stdio: ["inherit", "inherit", "inherit"],
    });
    child.on("close", () => rl.prompt());
  }
}
