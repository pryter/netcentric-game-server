import {LowSync} from "lowdb";
import {JSONFileSync} from "lowdb/node";
import {Database, UserData} from "@lib/Database";

export class User {
  private _uid: string;
  private _cachedData: UserData | null

  constructor(uid: string)

  constructor(...args: any[]) {
    this._uid = args[0]
    this._cachedData = null
  }

  public getUid() {
    return this._uid
  }

  public getNickname() {
    const data = this._fetchUserDatabase()
    return data.nickname
  }

  public getAvatar() {
    return this._fetchUserDatabase().avatar
  }

  public getUserData() {
    return this._fetchUserDatabase()
  }

  public getCachedData(): UserData | null {
    if (!this._cachedData) {
      return this.getUserData()
    }
    return this._cachedData
  }

  public updateNickname(nickname: string) {
    this._updateField("nickname", nickname)
  }

  private _updateField(name: keyof UserData, value: UserData[keyof UserData]) {
    // @ts-ignore
    const db = Database.loadUserDatabase()
    db.read()
    const data = db.data.users.find(u => u.uid === this._uid)
    // @ts-ignore
    data[name] = value

    db.write()
  }

  private _fetchUserDatabase() {
    const db = Database.loadUserDatabase()
    db.read()
    const data = db.data.users.find(u => u.uid === this._uid)
    if (data) {
      this._cachedData = data
      return data
    }

    throw new Error("user not found")
  }
}