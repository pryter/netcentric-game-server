import {Inventory} from "../src/lib/item/Inventory";
import {SampleItem} from "../src/lib/item/SampleItem";

describe("inventory", () => {

  const inv = new Inventory()

  test("add item", () => {
    inv.add(new SampleItem(), 1)
    expect(inv.getStackById("sample-item")?.getAmount()).toEqual(1)
    inv.add(new SampleItem(), 2)
    expect(inv.getStackById("sample-item")?.getAmount()).toEqual(3)
  })
})