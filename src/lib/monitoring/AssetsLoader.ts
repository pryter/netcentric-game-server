import path from "node:path";
import fs from "node:fs";
import AdmZip from "adm-zip";
import chalk from "chalk";

export class AssetsLoader {

  public static async loadMonitoringUI() {
    const cwd = process.cwd()
    const monPath = path.join(cwd, "public_mon")

    if (!fs.existsSync(monPath)) {
      console.log(chalk.gray("\nDownloading monitoring ui"));
      fs.mkdirSync(monPath)
      const zipPath = path.join(monPath, "out.zip");
      const artifactUrl = "https://github.com/pryter/netcentric-monitoring-client/blob/main/out/artifact.zip?raw=true"

      console.log(chalk.gray("downloading artifact..."));
      const res = await fetch(artifactUrl);
      if (!res.ok) {
        fs.rmdirSync(monPath)
        throw new Error(`failed to download: ${res.statusText}`);
      }

      const buffer = await res.arrayBuffer();
      fs.writeFileSync(zipPath, Buffer.from(buffer));

      console.log(chalk.gray("extracting the artifact..."));
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(monPath, true);

      console.log(chalk.gray("extracted to:", monPath, "\n"));
    }

    return monPath
  }

}