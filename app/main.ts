import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

// TODO: Uncomment the code below to pass the first stage
function prompt() {
  rl.question("$ ", (answer: string) => {
    // // Exit the terminal on "exit" command
    // if (answer === "exit") {
    //   rl.close();
    //   return;
    // }

    // console.log(`${answer}: command not found`)

    const trimmed = answer.trim();

    if (trimmed.length === 0) {
      return prompt();
    }

    const [command, ...args] = trimmed.split(" ");

    if (command === "echo") {
      console.log(args.join(" "))
    }
    else {
      console.log(`${command}: command not found`)
    }

    // Repeat the prompt
    prompt()
  })
}

prompt()
