import {CoreGame} from "@lib/CoreGame";
import {createInterface} from "readline"
import {EmbeddedKeyManager} from "@lib/EmbeddedKeyManager";
import * as admin from "firebase-admin";
import * as fs from "node:fs";
import * as path from "node:path";
import {Logger} from "@lib/logger/Logger";
import chalk from "chalk";
import {configDotenv} from "dotenv";

const VERSION = "0.0.5a"
const readline = createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log(chalk.gray("==================================================="))
console.log(chalk.gray.bold(`IQ180 game server (${VERSION})`))
console.log(chalk.gray(`provide the password to unlock embedded resources.`))
console.log(chalk.gray.bold("==================================================="))
const cwd = process.cwd()
const dbExists = fs.existsSync(path.join(cwd, "db/"))
if (!dbExists) {
  fs.mkdirSync(path.join(cwd, "db"))
}

configDotenv()

const key = process.env.EMBEDDED_KEY
if (key) {
  EmbeddedKeyManager.loadKey(key).then((v) => {
    if (!v) {
      console.error(chalk.red("unable to load key with the provided password"));
      process.exit(0);
    }else{
      try {
        admin.initializeApp({
          credential: admin.credential.cert(v as admin.ServiceAccount)
        })
        readline.close();
      } catch (error) {
        throw error;
      }
    }
  })
}else{
  readline.question('🔑 Embedded key password:', pass => {
    EmbeddedKeyManager.loadKey(pass).then((v) => {
      if (!v) {
        console.error(chalk.red("unable to load key with the provided password"));
        process.exit(0);
      }else{
        try {
          admin.initializeApp({
            credential: admin.credential.cert(v as admin.ServiceAccount)
          })
          readline.close();
        } catch (error) {
          throw error;
        }
      }
    })
  });
}

if (!process.env.MONITORING_TOKEN) {
  Logger.warn("monitoring token not provided, monitoring will use default token")
}
readline.on("SIGINT",() => {
  process.exit(0);
})

readline.on('close', () => {
  const recheck = fs.existsSync(path.join(cwd, "db/"))
  if (!recheck) {
    throw "unable to create db folder"
  }

  const cg = new CoreGame()
  const port = process.env.PORT
  cg.startGameServer(port ? parseInt(port) : 8080)
  cg.startMonitoringStream()
})