import { createInterface } from "readline";
import { execFile, execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

// ---------- Utility Functions ----------

function getFileName(filePath: string): string {
  const baseName = path.basename(filePath);
  return baseName.replace(/\.[^/.]+$/, "");
}

function findExecutable(executable: string) {
  const isWindows = process.platform === "win32";
  const command = isWindows ? "where" : "which";

  try {
    const result = execFileSync(command, [executable], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();

    return {
      location: result,
      isExecutable: Boolean(getFileName(result)),
      command: getFileName(result),
    };
  } catch {
    return undefined;
  }
}

function changeDirectory(targetPath: string) {
  const homeDir = process.env.HOME || process.env.USERPROFILE;

  const resolvedPath = targetPath === "~" ? homeDir : targetPath;

  if (!resolvedPath) {
    console.error("cd: HOME directory not set");
    return;
  }

  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
    process.chdir(resolvedPath);
  } else {
    console.error(`cd: ${resolvedPath}: No such file or directory`);
  }
}

function parseInput(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    // --- Single quotes --- Toggle single quotes (only if not inside double quotes)
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    // --- Double quotes --- Toggle double quotes (only if not inside single quotes)
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    // ---- BACKSLASH ----
    if (char === "\\") {
      // Inside single quotes → literal
      if (inSingleQuote) {
        current += char;
        continue;
      }

      // Inside double quotes → only escape specific chars
      if (inDoubleQuote) {
        const next = input[i + 1];
        if (next && ['"', "\\", "$", "`"].includes(next)) {
          current += next;
          i++;
        } else {
          current += char;
        }
        continue;
      }

      // Outside quotes → escape next char
      const next = input[i + 1];
      if (next) {
        current += next;
        i++;
      }
      continue;
    }

    // If whitespace and NOT inside quotes → split token
    if (!inSingleQuote && !inDoubleQuote && /\s/.test(char)) {
      // Whitespace ends a token (only outside quotes)
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    // Otherwise add character to current token
    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

// ---------- Command Handlers ----------

const builtInCommands: Record<string, (args: string[]) => void> = {
  echo: (args) => console.log(args.join(" ")),
  pwd: () => console.log(process.cwd()),
  cd: (args) => {
    if (args.length === 0) {
      console.error("cd: missing operand");
    } else {
      changeDirectory(args[0]);
    }
  },
  type: (args) => {
    const [first] = args;
    if (!first) return;

    if (Object.keys(builtInCommands).includes(first)) {
      console.log(`${first} is a shell builtin`);
    } else {
      const executableInfo = findExecutable(first);
      if (executableInfo?.location) {
        console.log(`${first} is ${executableInfo.location}`);
      } else {
        console.log(`${first}: not found`);
      }
    }
  },
  exit: () => rl.close(),
};

// Redirection handling: supports ">", "1>", ">>", and "2>"
type Redirection = {
  fd: 1 | 2;
  file: string;
  append: boolean;
};

// Redirection Detection Logic:
// Extracts redirection operators and their targets from the token list
function extractRedirection(tokens: string[]): {
  tokens: string[];
  redirection: Redirection | null;
} {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    const match = token.match(/^([12]?)(>>|>)$/);
    if (!match) continue;

    if (i === tokens.length - 1) {
      throw new Error("syntax error: no file specified");
    }

    const fd = match[1] === "2" ? 2 : 1; // default stdout
    const append = match[2] === ">>";
    const file = tokens[i + 1];

    const newTokens = [...tokens];
    newTokens.splice(i, 2);

    return {
      tokens: newTokens,
      redirection: { fd, file, append },
    };
  }

  return { tokens, redirection: null };
}

// ---------- Shell Loop ----------

function runCommand(input: string) {
  let tokens = parseInput(input.trim());

  if (tokens.length === 0) return;

  let redirection: Redirection | null = null;

  try {
    const result = extractRedirection(tokens);
    tokens = result.tokens;
    redirection = result.redirection;
  } catch (err: any) {
    console.error(err.message);
    prompt();
    return;
  }

  const [command, ...args] = tokens;

  if (!command) {
    prompt();
    return;
  }

  // BUILT-IN COMMANDS
  if (builtInCommands[command]) {
    if (redirection) {
      const stream = fs.createWriteStream(redirection.file, {
        flags: redirection.append ? "a" : "w",
      });

      const originalLog = console.log;
      const originalError = console.error;

      if (redirection.fd === 1) {
        console.log = (...data: any[]) => stream.write(data.join(" ") + "\n");
      } else {
        console.error = (...data: any[]) => stream.write(data.join(" ") + "\n");
      }

      builtInCommands[command](args);

      console.log = originalLog;
      console.error = originalError;
      stream.end();
    } else {
      builtInCommands[command](args);
    }

    if (command !== "exit") prompt();
    return;
  }

  // ---- EXTERNAL COMMAND ----
  const executableInfo = findExecutable(command);

  if (!executableInfo) {
    console.error(`${command}: command not found`);
    prompt();
    return;
  }

  const child = execFile(command, args, (error) => {
    if (error && error.code !== 0) {
      // Let stderr handle it
    }
    prompt();
  });

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
      prompt();
    });
  } else {
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
    child.on("close", () => prompt());
  }
}

function prompt() {
  rl.question("$ ", (answer) => {
    runCommand(answer);
  });
}

prompt();
