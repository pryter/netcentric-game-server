import {ConnectionPool} from "@lib/ConnectionPool";
import {CoreGame} from "@lib/CoreGame";
import {createInterface} from "readline"
import {EmbeddedKeyManager} from "@lib/EmbeddedKeyManager";
import * as admin from "firebase-admin";
import * as fs from "node:fs";
import * as path from "node:path";

const readline = createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('Embedded key password:', pass => {
  EmbeddedKeyManager.loadKey(pass).then((v) => {
    if (!v) {
      console.error("unable to load key with the provided password");
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

readline.on('close', () => {
  const cwd = process.cwd()
  const dbExists = fs.existsSync(path.join(cwd, "db/"))
  if (!dbExists) {
    fs.mkdirSync(path.join(cwd, "db"))
  }
  const recheck = fs.existsSync(path.join(cwd, "db/"))
  if (!recheck) {
    throw "unable to create db folder"
  }

  const cg = new CoreGame()
  cg.startGameServer(8080)
  cg.startMonitoringStream()
})