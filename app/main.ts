import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

// TODO: Uncomment the code below to pass the first stage
function prompt() {
  const builtInCommands = ["echo", "exit", "type"];
  rl.question("$ ", (answer: string) => {
    // // Exit the terminal on "exit" command
    if (answer === "exit") {
      rl.close();
      return;
    }

    const trimmed = answer.trim();

    if (trimmed.length === 0) {
      prompt();
    }

    const [command, ...args] = trimmed.split(" ");

    if (command === "type") {
      const [first] = args

      if (builtInCommands.includes(first)) {
        console.log(`${first} is a shell builtin`)
      }
      else {
        console.log(`${first}: not found`)
      }
    } else if (command === "echo") {
      if (args.length === 0) {
        console.log()
      }
      console.log(args.join(" "))
    } else {
      console.log(`${command}: command not found`)
    }

    // Repeat the prompt
    prompt()
  })
}

prompt()
