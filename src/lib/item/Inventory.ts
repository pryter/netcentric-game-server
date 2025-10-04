import {Item, ItemStack} from "./Item";

export class Inventory<I extends Item<any>> {
  private _items: Record<string, ItemStack<I>> = {}


  constructor() {
  }

  public add(itemStack: ItemStack<I>): void;
  public add(item: I, amount: number): void;

  public add(itemOrStack: I | ItemStack<I>, amount?: number): void {
    let sel: ItemStack<I>
    let am: number = 0
    if (itemOrStack instanceof Item && typeof amount === 'number') {
      let f = this._items[itemOrStack.getId()]
      if (f) {
        sel = f
      }else{
        sel = new ItemStack(itemOrStack, 0)
        this._items[itemOrStack.getId()] = sel
      }
      am = amount
    } else if (itemOrStack instanceof ItemStack) {
      let f = this._items[itemOrStack.getItem().getId()]
      if (f) {
        sel = f
      }else{
        sel = itemOrStack
        this._items[itemOrStack.getItem().getId()] = sel
      }
      am = itemOrStack.getAmount()
    } else{
      return
    }

    sel.addAmount(am)
  }

  // TODO: Implement this
  public remove(item: I, amount: number) {

  }

  public getStackById(id: string) {
    return this._items[id]
  }

  public getStackByItem(item: I) {
    return this.getStackById(item.getId())
  }
}