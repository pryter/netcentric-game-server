
export class IDPool {

  private static _instance:IDPool = new IDPool();
  private _pool: Record<string, string> = {}

  constructor() {
    if(IDPool._instance){
      throw new Error("Error: Instantiation failed: Use IDPool.getInstance() instead of new.");
    }
    IDPool._instance = this;
  }

  public static getInstance(): IDPool
  {
    return IDPool._instance;
  }

  private _randomID() {
    const charList = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    let eligibleList = charList
    let result = '';
    for (let i = 4; i > 0; --i) {
      const char = eligibleList[Math.floor(Math.random() * eligibleList.length)]
      result += char
    }
    return result;
  }

  public getCode(uuid: string): string {
    const id = this._randomID()

    this._pool[id] = uuid

    return id;
  }

  public findActualID(code: string): string | undefined {
    return this._pool[code]
  }

  public free(uuid: string) {
    Object.entries(this._pool).forEach(([key, value]) => {
      if (value === uuid) {
        delete this._pool[key];
        return
      }
    })
  }




}