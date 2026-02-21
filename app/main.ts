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

// ---------- Shell Loop ----------

function runCommand(input: string) {
  const tokens = parseInput(input.trim());

  if (tokens.length === 0) return;

  // --- Detect ">" ---
  const redirectOperatorIndex = tokens.indexOf(">");

  let outputFile: string | null = null;

  if (redirectOperatorIndex !== -1) {
    if (redirectOperatorIndex === tokens.length - 1) {
      console.error("syntax error: no file specified");
      prompt();
      return;
    }

    outputFile = tokens[redirectOperatorIndex + 1];

    // Remove ">" and filename from tokens
    tokens.splice(redirectOperatorIndex, 2);
  }

  const [command, ...args] = tokens;

  if (!command) {
    prompt();
    return;
  }

  // BUILT-IN COMMANDS
  if (builtInCommands[command]) {
    if (outputFile) {
      // Capture output manually
      const originalLog = console.log;
      const writeStream = fs.createWriteStream(outputFile, { flags: "w" });

      console.log = (...data: any[]) => {
        writeStream.write(data.join(" ") + "\n");
      };

      builtInCommands[command](args);

      console.log = originalLog;
      writeStream.end();
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

  if (outputFile) {
    const writeStream = fs.createWriteStream(outputFile, { flags: "w" });

    child.stdout?.pipe(writeStream);
    child.stderr?.pipe(process.stderr);
  } else {
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
  }
}

function prompt() {
  rl.question("$ ", (answer) => {
    runCommand(answer);
  });
}

prompt();
