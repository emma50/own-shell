import { createInterface } from "readline";
import { execSync } from "child_process";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function findExecutable(executable: string) {
  // On Windows, the `where` command is used to find the location of executables, while on Unix-like systems, the `which` command serves the same purpose.
  const isWindows = process.platform === "win32";

  try {
    const result = execSync(
      isWindows ? `where ${executable}` : `which ${executable}`,
      { stdio: "pipe" },
    );

    const output = result.toString().trim();

    return {
      location: output,
      isExecutable: !!getFileName(output),
      command: getFileName(output),
    };
  } catch {
    console.log(`${executable}: not found`);
  }
}

function getFileName(filePath: string) {
  // Get the last part of the path (cat.exe)
  const baseName = filePath.split("\\").pop();
  // Remove the extension (.exe)
  return (baseName as string).replace(/\.[^/.]+$/, "");
}

function prompt() {
  rl.question("$ ", (answer: string) => {
    answer = answer.trim();

    if (answer.length === 0) {
      prompt();
      return;
    }
    // // Exit the terminal on "exit" command
    if (answer === "exit") {
      rl.close();
      return;
    }

    const [command, ...args] = answer.split(" ");

    if (command === "type") {
      const builtInCommands = ["echo", "exit", "type"];
      const [first] = args;

      if (!first) {
        prompt();
        return;
      }

      if (builtInCommands.includes(first)) {
        console.log(`${first} is a shell builtin`);
      } else {
        try {
          const result = findExecutable(first);
          console.log(`${first} is here ${JSON.stringify(result?.location)}`);
        } catch {
          console.log(`${first}: not found`);
        }
      }
    } else if (command === findExecutable(command)?.command) {
      console.log(`${command} is here ${findExecutable(command)?.location}`);
    } else {
      // ✅ Default case for unknown commands
      console.log(`${command}: command not found`);
    }
    // Repeat the prompt
    prompt();
  });
}

prompt();
