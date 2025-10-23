import {Player} from "@lib/player/Player";
import type {ClientConnection} from "@lib/ClientConnection";
import {TestUser} from "./TestUser";
import { GameRoom } from "@lib/GameRoom";
import { Inventory } from "@lib/item/Inventory";
import { Item } from "@lib/item/Item";
import { MsgPayload, FramePayload } from "@lib/Payload";
import { PlayerActionType } from "@lib/player/PlayerActionType";
import {SampleItem} from "@lib/item/SampleItem";

export class TestPlayer extends TestUser {
  constructor(connection: ClientConnection) {

    super("test-client", connection.getUser()?.getUid() as string)
    if (!connection.isAuthenticated() || !connection.getUser()) {
      // not authenticated should not be able to be player
      throw new Error("not authenticated connection cant be cast to player")
    }

    this._connection = connection

    this._inventory = new Inventory()

    this._connection.listenForMessages((cb) => {
      // listen for player actions
      if (cb.getGroup() !== "client-action") {
        return
      }

      switch (cb.getName()) {
        case "ready":
          this._setReady(cb.getMsgData())
          break
        case "submit":
          this._submitAnswer(cb.getMsgData())
          break
        case "use-item":
          // TODO: implement use item
          break
      }
    })
  }

  private _connection: ClientConnection;
  private _isReady: boolean = false
  private _playerActionListener: (type: PlayerActionType, data: any) => void = () => {}
  private _inventory: Inventory<Item<GameRoom>>

  public isSamePlayer(player: Player) {
    return this.getUid() === player.getUid()
  }


  public getInventory() {
    return this._inventory
  }
  // as a player it should only send msg payloads only
  public sendPayload(payload: MsgPayload | FramePayload) {
    this._connection.send(payload)
  }

  public onDisconnect(cb: () => void) {
    this._connection.listenForClose(cb)
  }

  public bindPlayerActionListener(cb: (type: PlayerActionType, data: any) => void) {
    this._playerActionListener = cb
  }

  // Implementations
  private _submitAnswer(answer: string): boolean {
    this._playerActionListener(PlayerActionType.SUBMIT, answer)
    return true
  }

  private _setReady(status: boolean): boolean {
    this._playerActionListener(PlayerActionType.READY, status)
    return true
  }

  // basically pass item to room for execution
  private _useItem(itemId: string, amount: number): boolean {
    // TODO: Check if the item is in the inventory and its enough



    // please change this
    const item = new SampleItem()
    this._playerActionListener(PlayerActionType.USE_ITEM, {item: item, amount: amount})
    return true
  }

  private _loadUserInventory() {
    // do something with user id from db
    // get user inventory
    // add items to inventory

    this._inventory.add(new SampleItem(), 1)
  }
}