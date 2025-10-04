import {Player} from "../player/Player";
import {GameRoom} from "../GameRoom";


export class ItemStack<I extends Item<GameRoom>> {
  private _item: I;
  private _amount: number;

  constructor(item: I, amount: number) {
    this._item = item
    this._amount = amount
  }

  public isEmpty() {
    return this._amount === 0
  }

  public addAmount(amount: number) {
    this._amount += amount
  }

  public getAmount() {
    return this._amount
  }

  public removeAmount(amount: number) {
    if (this._amount - amount < 0) {
      return
    }

    this._amount -= amount
  }

  public getItem() {
    return this._item
  }
}

export abstract class Item<R extends GameRoom> {
  protected abstract ID: string
  protected abstract Name: string;
  protected abstract Description: string;

  constructor() {
  }

  public use(user: Player, room: R) {
    return this.onUse(user, room)
  }

  public getId() {
    return this.ID
  }

  public getName() {
    return this.Name
  }
  public getDescription() {
    return this.Description
  }


  protected abstract onUse(user: Player, room: R): boolean
}