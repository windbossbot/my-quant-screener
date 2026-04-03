import { CONDITIONS, DAILY_CONDITION_IDS, FOUR_HOUR_CONDITION_IDS, SCREENER_BOOTSTRAP } from "../src/config/screenerBootstrap.js";

const lines = [
  `# ${SCREENER_BOOTSTRAP.title}`,
  "",
  `entry: ${SCREENER_BOOTSTRAP.entryFile}`,
  `entry-bootstrap: ${SCREENER_BOOTSTRAP.entryBootstrapFile}`,
  `reference: ${SCREENER_BOOTSTRAP.referenceDoc}`,
  "",
  `print-entry: ${SCREENER_BOOTSTRAP.printEntryCommand}`,
  "",
  `[group] fourHour = ${FOUR_HOUR_CONDITION_IDS.join(", ")}`,
  `[group] daily = ${DAILY_CONDITION_IDS.join(", ")}`,
  "",
  ...CONDITIONS.flatMap((condition) => [
    `${condition.id}. ${condition.title}`,
    `   - timeframe: ${condition.timeframe}`,
    `   - description: ${condition.description}`,
    "",
  ]),
];

console.log(lines.join("\n"));
