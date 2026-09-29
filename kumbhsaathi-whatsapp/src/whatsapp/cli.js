require("dotenv").config();

const readline = require("readline/promises");
const { stdin: input, stdout: output } = require("process");
const { handleMessage } = require("./service");
const { closePool } = require("./db");

async function main() {
  const args = process.argv.slice(2);
  const locationIndex = args.indexOf("--location");
  if (locationIndex >= 0) {
    const latitude = args[locationIndex + 1];
    const longitude = args[locationIndex + 2];
    await runMessage("", { latitude, longitude });
    return;
  }
  const initialMessage = args.join(" ").trim();
  if (initialMessage) {
    await runMessage(initialMessage);
    return;
  }

  if (!process.stdin.isTTY) {
    const piped = await readAllStdin();
    for (const line of piped.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
      if (["exit", "quit", ":q"].includes(line.toLowerCase())) break;
      console.log(`WhatsApp message> ${line}`);
      await runMessage(line);
      console.log("");
    }
    return;
  }

  console.log("Kumbh Saathi CLI chat");
  console.log("Type a WhatsApp-style message. Type exit to quit.\n");

  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      const message = (await rl.question("WhatsApp message> ")).trim();
      if (!message) continue;
      if (["exit", "quit", ":q"].includes(message.toLowerCase())) break;
      await runMessage(message);
      console.log("");
    }
  } finally {
    rl.close();
  }
}

async function readAllStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function runMessage(message, extra = {}) {
  const result = await handleMessage({
    from: process.env.CLI_FROM || "whatsapp:+919876543210",
    body: message,
    ...extra,
  });

  console.log("\n--- Bot Reply ---");
  console.log(result.reply);
  console.log("\n--- Debug ---");
  console.log(
    JSON.stringify(
      {
        kind: result.kind,
        live_case_id: result.liveCase?.id,
        trust_check_id: result.saved?.id,
        priority: result.liveCase?.priority,
        risk_level: result.saved?.risk_level,
        match_count: result.matches?.length || 0,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
