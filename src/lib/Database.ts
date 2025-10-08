import {JSONFilePreset, JSONFileSync} from "lowdb/node";
import {LowSync} from "lowdb";
import {User} from "@lib/User";

export type UserData = {
  uid: string,
  nickname?: string,
  level: number,
  score: number,
  avatar?: string | undefined,
}

export class Database {

  public static loadUserDatabase() {
    return new LowSync<{users: UserData[]}>(new JSONFileSync("db/users.json"), { users: [] })
  }

  public static findUser(uid: string) {
    const db = Database.loadUserDatabase()
    db.read()
    return db.data.users.find(u => u.uid === uid)
  }

  public static createUser(userData: UserData): string {
    Database.loadUserDatabase().update(db => {
      db.users.push({
        ...userData
      })
    })

    return userData.uid
  }
}
