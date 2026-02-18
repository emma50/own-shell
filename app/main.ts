import { createInterface } from "readline";
import { exec, execSync } from "child_process";
import fs from "fs";

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

function cd(path: string) {
  // Check if the path exists and is a directory
  if (fs.existsSync(path) && fs.statSync(path).isDirectory()) {
    try {
      process.chdir(path); // Change current working directory
      console.log(`Changed directory to: ${process.cwd()}`);
    } catch (err) {
      console.error(`cd: ${path}: ${(err as Error).message}`);
    }
  } else {
    console.error(`cd: ${path}: No such file or directory`);
  }
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
      const builtInCommands = ["echo", "exit", "type", "pwd", "cd"];
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
    } else if (command === "cd") {
      if (args.length === 0) {
        console.log("cd: missing operand");
      } else {
        cd(args[0]);
      }
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
