import { createInterface } from "readline";
import { execSync } from "child_process";

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
        try {
          const result = findExecutables(first);
          console.log(`${first} is ${JSON.stringify(result?.location)}`);
        } catch {
          console.log(`${first}: not found`);
        }
      }
    } else if (command === findExecutables(command)?.command) {
      // If the command is found in the system's PATH, it executes the command with the provided arguments.
      try {
        const result = execSync(`${command} ${args.join(" ")}`, {
          stdio: "inherit",
        });
        console.log(
          `Program was passed ${args.length + 1} args including (including program name)`,
        );
      } catch (error) {
        console.error(`Error executing command: ${error}`);
      }
    } else {
      // ✅ Default case for unknown commands
      console.log(`${command}: command not found`);
    }
    // Repeat the prompt
    prompt();
  });
}

const findExecutables = (executable: string) => {
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
};

function getFileName(filePath: string) {
  // Get the last part of the path (cat.exe)
  const baseName = filePath.split("\\").pop();
  // Remove the extension (.exe)
  return (baseName as string).replace(/\.[^/.]+$/, "");
}

prompt();
