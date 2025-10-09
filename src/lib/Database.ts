import {JSONFilePreset, JSONFileSync} from "lowdb/node";
import {LowSync} from "lowdb";
import {User} from "@lib/User";
import * as path from "node:path";

export type UserData = {
  uid: string,
  nickname?: string,
  level: number,
  score: number,
  avatar?: string | undefined,
}

export class Database {

  public static loadUserDatabase() {
    const cwd = process.cwd()
    return new LowSync<{users: UserData[]}>(new JSONFileSync(path.join(cwd, "db/users.json")), { users: [] })
  }

  public static findUser(uid: string) {
    const db = Database.loadUserDatabase()
    db.read()
    return db.data.users.find(u => u.uid === uid)
  }

  public static createUser(userData: UserData): string {
    const db = Database.loadUserDatabase()
    db.read()
    db.update(db => {
      db.users.push({
        ...userData
      })
    })

    return userData.uid
  }
}
