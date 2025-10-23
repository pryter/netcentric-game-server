import {User} from "@lib/User";
import {UserData} from "@lib/Database";
import {v4} from "uuid";

export class TestUser extends User{

  private nickname: string

  constructor(name: string, id: string) {
    super(id);
    this.nickname = name
  }

  public getNickname() {
    return this.nickname
  }

  public getAvatar() {
    return "https://test-avataruri.com"
  }

  public getUserData(): UserData {
    return {
      uid: this.getUid(),
      nickname: this.getNickname(),
      level: 0,
      score: 0,
      avatar: this.getAvatar()
    }
  }

  public getCachedData(): UserData {
    return this.getUserData()
  }

  public updateNickname(nickname: string) {
    this.nickname = nickname
  }
}