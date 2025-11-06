import type {ClientConnection} from "../ClientConnection";
import {User} from "../User";
import {FramePayload, MsgPayload} from "../Payload";
import {PlayerActionType} from "./PlayerActionType";
import {Item} from "../item/Item";
import {Inventory} from "../item/Inventory";
import {SampleItem} from "../item/SampleItem";
import {GameRoom} from "../GameRoom";

export class Player extends User {

  private _connection: ClientConnection;
  private _isReady: boolean = false
  private _playerActionListener: (type: PlayerActionType, data: any) => boolean = () => false
  private _inventory: Inventory<Item<GameRoom>>


  constructor(connection: ClientConnection) {
    if (!connection.isAuthenticated() || !connection.getUser()) {
      // not authenticated should not be able to be player
      throw new Error("not authenticated connection cant be cast to player")
    }
    
    super(connection.getUser()?.getUid() as string)
    this._connection = connection

    this._inventory = new Inventory()

    this._connection.listenForMessages((cb) => {
      // listen for player actions
      if (cb.getGroup() !== "client-action") {
        return
      }

      switch (cb.getName()) {
        case "ready":
          this._setReady(cb)
          break
        case "submit":
          this._submitAnswer(cb)
          break
        case "play-again":
          this._playerActionListener(PlayerActionType.PLAY_AGAIN , true)
        case "use-item":
          // TODO: implement use item
          break
      }
    })
  }

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

  public bindPlayerActionListener(cb: (type: PlayerActionType, data: any) => boolean) {
    this._playerActionListener = cb
  }

  // Implementations
  private _submitAnswer(payload: MsgPayload): boolean {
    const actionResult = this._playerActionListener(PlayerActionType.SUBMIT, payload.getMsgData())

    if (actionResult) {
      this._connection.send(payload.createResponse(0))
    }else{
      this._connection.send(payload.createResponse(1))
    }
    return actionResult
  }

  private _setReady(payload: MsgPayload): boolean {
    const actionResult = this._playerActionListener(PlayerActionType.READY, payload.getMsgData())
    if (actionResult) {
      this._connection.send(payload.createResponse(0))
    }else{
      this._connection.send(payload.createResponse(1))
    }
    return actionResult
  }

  // basically pass item to room for execution
  private _useItem(itemId: string, amount: number): boolean {
    // TODO: Check if the item is in the inventory and its enough



    // please change this
    const item = new SampleItem()
    // this._playerActionListener(PlayerActionType.USE_ITEM, {item: item, amount: amount})
    return true
  }

  private _loadUserInventory() {
    // do something with user id from db
    // get user inventory
    // add items to inventory

    this._inventory.add(new SampleItem(), 1)
  }


}