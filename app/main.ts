import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

// TODO: Uncomment the code below to pass the first stage
function prompt() {
  rl.question("$ ", (answer: string) => {
    // Exit the terminal on "exit" command
    if (answer === "exit") {
      rl.close();
      return;
    }

    console.log(`${answer}: command not found`)

    // Repeat the prompt
    prompt()
  })
}

prompt()
