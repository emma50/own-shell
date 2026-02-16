import { createInterface } from "readline";
import fs from "fs";
import path from "path";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

// TODO: Uncomment the code below to pass the first stage
function prompt() {
  const builtInCommands = ["echo", "exit", "type"];
  rl.question("$ ", (answer: string) => {
    answer = answer.trim();
    // // Exit the terminal on "exit" command
    if (answer === "exit") {
      rl.close();
      return;
    }

    if (answer.length === 0) {
      prompt();
      return;
    }

    const [command, ...args] = answer.split(" ");

    if (command === "type") {
      const [first] = args;

      if (!first) {
        prompt();
        return;
      }

      if (builtInCommands.includes(first)) {
        console.log(`${first} is a shell builtin`);
      } else {
        // - Gets system PATH directories.
        // - On Windows, also gets PATHEXT extensions and - considers executable extensions (.EXE, .CMD, etc.).
        const envPath = process.env.PATH || "";
        const pathDirs = envPath.split(path.delimiter).filter(Boolean);
        const isWindows = process.platform === "win32";
        const pathexts = isWindows
          ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
          : [];

        let found = false;

        // Iterates through PATH directories and checks for the command's existence and executability.
        for (const dir of pathDirs) {
          const base = path.join(dir, command);
          const candidates = isWindows
            ? pathexts.map((ext: any) => base + ext)
            : [base];

          // Checks if any candidate file exists and is executable.
          // - If found, prints the full path.
          for (const candidate of candidates) {
            try {
              const stats = fs.statSync(candidate);
              if (!stats.isFile()) continue;
              try {
                fs.accessSync(candidate, fs.constants.X_OK);
                console.log(`${command} is ${candidate}`);
                found = true;
                break;
              } catch {
                // Not executable, skip to next candidate
                continue;
              }
            } catch {
              // File doesn't exist, continue
              continue;
            }
          }
          if (found) break;
        }

        if (!found) {
          console.log(`${command}: not found`);
        }
      }
    } else if (command === "echo") {
      // Prints the arguments joined by spaces. If no arguments are provided, it prints an empty line.
      if (args.length === 0) {
        console.log();
      } else {
        console.log(args.join(" "));
      }
    }

    // Repeat the prompt
    prompt();
  });
}

prompt();
