import net from "node:net";

const port = Number(process.env.PORT || 3000);

function suggestKillCommands(activePort) {
  return {
    windows: `Get-NetTCPConnection -LocalPort ${activePort} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }`,
    unix: `lsof -ti tcp:${activePort} | xargs kill -9`,
  };
}

function checkPort(activePort) {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();

    tester.once("error", (error) => {
      if (error && error.code === "EADDRINUSE") {
        const commands = suggestKillCommands(activePort);
        console.error(`[preflight] Port ${activePort} is already in use.`);
        console.error(`[preflight] Windows cleanup: ${commands.windows}`);
        console.error(`[preflight] Unix cleanup: ${commands.unix}`);
        reject(new Error(`Port ${activePort} is already in use.`));
        return;
      }

      reject(error);
    });

    tester.once("listening", () => {
      tester.close(() => resolve());
    });

    tester.listen(activePort, "0.0.0.0");
  });
}

await checkPort(port);
console.log(`[preflight] Port ${port} is available.`);
