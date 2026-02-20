import { createInterface } from "readline";
import { execSync, execFile } from "child_process";
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
  const command = isWindows ? `where ${executable}` : `which ${executable}`;

  try {
    const result = execSync(command, { stdio: "pipe" }).toString().trim();
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

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === "'" && !inSingleQuote) {
      // Enter single-quote mode
      inSingleQuote = true;
      continue;
    }

    if (char === "'" && inSingleQuote) {
      // Exit single-quote mode
      inSingleQuote = false;
      continue; // don't push yet, allow concatenation
    }

    if (!inSingleQuote && /\s/.test(char)) {
      // Whitespace ends a token (only outside quotes)
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += char;
    }
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
  const [command, ...args] = parseInput(input.trim());

  if (!command) return;

  if (builtInCommands[command]) {
    builtInCommands[command](args);
    if (command !== "exit") prompt(); // show prompt again unless exiting
  } else {
    const executableInfo = findExecutable(command);
    if (executableInfo?.isExecutable) {
      // Use execFile instead of exec
      execFile(command, args, (error, stdout, stderr) => {
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);
        prompt();
      });
      return;
    } else {
      console.error(`${command}: command not found`);
      prompt();
    }
  }
}

function prompt() {
  rl.question("$ ", (answer) => {
    runCommand(answer);
  });
}

prompt();
