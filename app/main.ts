import { createInterface } from "readline";
import { execFile, execFileSync, spawn } from "child_process";
import fs from "fs";
import path from "path";

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

  exit: () => rl.close(),
};

// ============================================================
// TAB COMPLETION
// ============================================================

// Track state between tab presses
let lastPrefix = "";
let tabCount = 0;

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

rl.on("line", (line) => runCommand(line));

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

    // Unquoted pipe → flush current token, emit "|" as its own token
    if (!inSingleQuote && !inDoubleQuote && char === "|") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      tokens.push("|");
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

  // Pipeline — spawn each stage and wire stdout → stdin
  runPipeline(stages);
}

/**
 * Runs a two-or-more stage pipeline, connecting stdout of each process
 * to stdin of the next. Only external commands are supported in pipelines.
 */
function runPipeline(stages: string[][]) {
  const last = stages.length - 1;

  const processes = stages.map(([command, ...args], i) => {
    // First process inherits terminal stdin (it may read from files or user).
    // Middle and last processes get a piped stdin fed by the previous stage.
    // Last process inherits terminal stdout/stderr so output goes to screen.
    const stdio: ("pipe" | "inherit")[] = [
      i === 0 ? "inherit" : "pipe", // stdin
      i === last ? "inherit" : "pipe", // stdout
      "inherit", // stderr always to terminal
    ];
    return spawn(command, args, { stdio });
  });

  // Wire stdout of stage N → stdin of stage N+1
  for (let i = 0; i < processes.length - 1; i++) {
    processes[i].stdout!.pipe(processes[i + 1].stdin!);
  }

  // Show prompt once the last process finishes
  processes[processes.length - 1].on("close", () => rl.prompt());
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
  // shell must still create the file (matching real shell behaviour).
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
 * Spawns an external process, optionally piping its stdout or stderr
 * to a file instead of the terminal.
 */
function runExternal(
  command: string,
  args: string[],
  redirection: Redirection | null,
) {
  const child = spawn(command, args, { stdio: "pipe" });

  if (redirection) {
    const stream = fs.createWriteStream(redirection.file, {
      flags: redirection.append ? "a" : "w",
    });

    if (redirection.fd === 1) {
      child.stdout?.pipe(stream);
      child.stderr?.pipe(process.stderr);
    } else {
      child.stderr?.pipe(stream);
      child.stdout?.pipe(process.stdout);
    }

    child.on("close", () => {
      stream.end();
      rl.prompt();
    });
  } else {
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
    child.on("close", () => rl.prompt());
  }
}
