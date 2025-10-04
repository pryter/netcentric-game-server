import * as websocket from "ws";
import {MsgPayload, Payload, type PayloadMsgData} from "./Payload";
import type {CoreGame, GlobalEventListener} from "./CoreGame";
import {User} from "./User";
export type ClientConnectionState = "guest" | "authenticated"

export type PayloadListener = (payload: MsgPayload, forwarder: ClientConnection) => void
export class ClientConnection {

  private _id: string;
  private _ws: websocket.WebSocket;
  private _state: ClientConnectionState;
  protected _msgListeners: PayloadListener = () => {}
  protected _globalMsgListeners: (payload: Payload, forwarder: ClientConnection) => void = () => {}
  protected _closeListener: () => void = () => {}
  private _user: User | undefined

  private _lastActive: number = new Date().getTime()

  constructor(id: string, ws: websocket.WebSocket) {
    this._id = id;
    this._ws = ws;
    // always start as guest
    this._state = "guest";
  }

  public upgradeToAuthenticated() {
    this._state = "authenticated";
  }

  public isAuthenticated() {
    return this._state === "authenticated"
  }

  public getUser() {
    return this._user
  }

  protected setUser(user: User) {
    this._user = user
  }

  public listenForMessages(cb: (payload: MsgPayload) => void) {
    this._msgListeners = cb
  }

  public bindToGlobalListener(listener: GlobalEventListener) {
    this._globalMsgListeners = listener
  }

  public close() {
    this._ws.close()
  }

  public updateLastActive() {
    this._lastActive = new Date().getTime()
  }

  public getId() {
    return this._id
  }

  public isInactive() {
    return (new Date().getTime() - this._lastActive) > 1000 * 60 * 5
  }

  public send(msg: Payload) {
    this._ws.send(msg.serialize())
  }

  public listenForClose(cb: () => void) {
    this._closeListener = cb
  }

  public onClose(cb: () => void) {
    this._ws.removeAllListeners("close")

    this._ws.on("close", () => {
      cb()
      this._closeListener()
    })
  }

  public startForwarding() {
    // clear all msg listeners to avoid duped messages
    this._ws.removeAllListeners("message")

    this._ws.on("message", (data) => {
      this._forwardMessage(data)
    })
  }


  protected _handleUpgrade(payload: Payload<{token: string}>) {
    const data = payload.getData()

    if (data.token !== "12345") {
      this.send(new MsgPayload({group: "upgrade", name: "upgrade-failed"}))
      return
    }
    // some firebase action here
    // get user from firebase
    // set user to this connection
    // upgrade to authenticated

    const user = new User("1234567890", "test", "test")
    this._user = user
    this.upgradeToAuthenticated()
    this.send(new MsgPayload({group: "upgrade", name: "upgrade-success"}))
  }

  private _forwardMessage(data: websocket.RawData) {
    const messagePayload = new Payload(data.toString())

    if (messagePayload.getType() === "upgrade" && this._state === "authenticated") {
      console.log("dropping payload; payload type upgrade should not be sent after authentication")
      return;
    }
    if (messagePayload.getType() === "upgrade") {
      this._handleUpgrade(messagePayload)
      return
    }

    if (messagePayload.getType() === "frame" || messagePayload.getType() === "ping") {
      console.log("dropping payload; payload type frame and ping should not be sent to the server")
      return
    }

    // forward to listener
    if (messagePayload.isMessage()) {
      this._msgListeners(new MsgPayload(messagePayload.getData()), this)
    }
    // forward to global listener
    this._globalMsgListeners(messagePayload, this)
  }

}