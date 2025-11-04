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

  public static updateUser(uid: string, userData: Partial<UserData>) {
    const db = Database.loadUserDatabase()
    db.read()
    db.update(db => {
      db.users.forEach((u) => {
        if (u.uid === uid) {
          u = {
            ...u,
            ...userData
          }
        }
      })
    })
  }

  public static fetchLeaderBoard() {
    const db = Database.loadUserDatabase()
    db.read()
    let rank = 1
    return db.data.users.sort((a, b) => b.score - a.score).map((u,i, o) => {
      if (i > 0) {
        if (u.score === o[i - 1]?.score) {
          return ({...u, ranking: `=${rank}` })
        }
        rank++
      }
      return ({...u, ranking: `${rank}` })
    })
  }

  public static updateScore(uid: string, score: number, mode: "add" | "remove" | "set") {
    const db = Database.loadUserDatabase()
    db.read()
    db.update(db => {
      db.users.forEach((u) => {
        if (u.uid === uid) {
         switch (mode) {
           case "add":
             u.score += score
             break
           case "remove":
             u.score -= score
             break
           case "set":
             u.score = score
             break
         }
        }
      })
    })
  }
}
