export class User {
  private _uid: string;
  private _name: string;
  private _avatar: string;

  constructor(user: User)
  constructor(uid: string, name: string, avatar?: string)

  constructor(...args: any[]) {
    if (args.length === 1) {
      const user = args[0] as User
      this._uid = user.getUid()
      this._name = user.getName()
      this._avatar = user.getAvatar()
    } else {
      this._uid = args[0]
      this._name = args[1]
      this._avatar = args[2] ?? "https://cdn.discordapp.com/embed/avatars/0.png"
    }
  }

  public getUid() {
    return this._uid
  }

  public getName() {
    return this._name
  }

  public getAvatar() {
    return this._avatar
  }
}