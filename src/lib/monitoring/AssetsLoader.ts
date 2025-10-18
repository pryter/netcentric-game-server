import path from "node:path";
import fs from "node:fs";
import AdmZip from "adm-zip";

export class AssetsLoader {

  public static async loadMonitoringUI() {
    const cwd = process.cwd()
    const monPath = path.join(cwd, "public_mon")

    if (!fs.existsSync(monPath)) {
      fs.mkdirSync(monPath)
      const zipPath = path.join(monPath, "out.zip");
      const artifactUrl = "https://github.com/pryter/netcentric-monitoring-client/blob/main/out/artifact.zip?raw=true"

      console.log("downloading artifact");
      const res = await fetch(artifactUrl);
      if (!res.ok) {
        fs.rmdirSync(monPath)
        throw new Error(`failed to download: ${res.statusText}`);
      }

      const buffer = await res.arrayBuffer();
      fs.writeFileSync(zipPath, Buffer.from(buffer));

      console.log("extracting artifact...");
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(monPath, true);

      console.log("extracted to:", monPath);
    }

    return monPath
  }

}