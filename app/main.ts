import { createInterface } from "readline";
import { exec, execSync } from "child_process";

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
    return undefined;
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

    if (answer === "pwd") {
      console.log(process.cwd());
      prompt();
      return;
    }

    const [command, ...args] = answer.split(" ");

    if (command === "type") {
      const builtInCommands = ["echo", "exit", "type", "pwd"];
      const [first] = args;

      if (!first) {
        prompt();
        return;
      }

      if (builtInCommands.includes(first)) {
        console.log(`${first} is a shell builtin`);
      } else {
        const executableInfo = findExecutable(first);

        if (executableInfo && executableInfo.location) {
          console.log(`${first} is ${executableInfo.location}`);
        } else {
          console.log(`${first}: not found`);
        }
      }
    } else if (command === "echo") {
      console.log(args.join(" "));
    } else {
      const executableInfo = findExecutable(command);

      if (executableInfo && executableInfo.isExecutable) {
        const fullCommand =
          args.length > 0 ? `${command} ${args.join(" ")}` : command;

        exec(fullCommand, (error, stdout, stderr) => {
          if (stdout) process.stdout.write(stdout);
          if (stderr) process.stderr.write(stderr);
          prompt();
        });
        return;
      } else {
        console.log(`${command}: command not found`);
      }
    }
    // Repeat the prompt
    prompt();
  });
}

prompt();
