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
        // On Windows, the `where` command is used to find the location of executables, while on Unix-like systems, the `which` command serves the same purpose.
        const isWindows = process.platform === "win32";

        try {
          const result = execSync(
            isWindows ? `where ${first}` : `which ${first}`,
            { stdio: "pipe" },
          );
          console.log(`${first} is ${result.toString().trim()}`);
        } catch {
          console.log(`${first}: not found`);
        }
      }
    } else if (command === "echo") {
      // Prints the arguments joined by spaces. If no arguments are provided, it prints an empty line.
      if (args.length === 0) {
        console.log();
      } else {
        console.log(args.join(" "));
      }
    } else {
      // ✅ Default case for unknown commands
      console.log(`${command}: command not found`);
    }

    // Repeat the prompt
    prompt();
  });
}

prompt();
