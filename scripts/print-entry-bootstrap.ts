import { ENTRY_BOOTSTRAP } from "../src/config/entryBootstrap.js";

const profile = ENTRY_BOOTSTRAP.activeProfile;
const lines = [
  `# ${ENTRY_BOOTSTRAP.title}`,
  "",
  `entry: ${ENTRY_BOOTSTRAP.entryFile}`,
  `print: ${ENTRY_BOOTSTRAP.printScriptCommand}`,
  "",
  `[active] ${profile.id}`,
  `title: ${profile.title}`,
  `sourceProject: ${profile.sourceProject}`,
  `sourceConfig: ${profile.sourceConfigPath}`,
  `sourceStatus: ${profile.sourceStatusPath}`,
  `sourceState: ${profile.sourceStatePath}`,
  "",
  "[transferred]",
  ...profile.transferredSignals.map((item) => `- ${item}`),
  "",
  "[omitted]",
  ...profile.omittedSignals.map((item) => `- ${item}`),
  "",
  "[thresholds]",
  `- minPriceChangePct: ${profile.minPriceChangePct}`,
  `- min24hNotionalVolumeKrw: ${profile.min24hNotionalVolumeKrw}`,
  `- minAverage4hNotionalVolumeKrw: ${profile.minAverage4hNotionalVolumeKrw}`,
  `- average4hNotionalVolumeLookbackBars: ${profile.average4hNotionalVolumeLookbackBars}`,
  `- currentTouchDailyMaPeriod: ${profile.currentTouchDailyMaPeriod}`,
  `- dailyMaEntryTolerancePct: ${profile.dailyMaEntryTolerancePct}`,
  `- ma20UpperMultiplier: ${profile.ma20UpperMultiplier}`,
  `- longMaUpperMultiplier: ${profile.longMaUpperMultiplier}`,
  `- recentVolumeInflowLookbackDays: ${profile.recentVolumeInflowLookbackDays}`,
  `- recentVolumeInflowMinVolumeRatio: ${profile.recentVolumeInflowMinVolumeRatio}`,
  `- recentVolumeInflowBaselineDays: ${profile.recentVolumeInflowBaselineDays}`,
  `- excludedSymbols: ${profile.excludedSymbols.join(", ")}`,
];

console.log(lines.join("\n"));
