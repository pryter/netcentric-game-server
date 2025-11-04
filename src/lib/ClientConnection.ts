import * as websocket from "ws";
import {MsgPayload, Payload, type PayloadMsgData} from "./Payload";
import type {CoreGame, GlobalEventListener} from "./CoreGame";
import {User} from "./User";
export type ClientConnectionState = "guest" | "authenticated"
import {getFirebaseApp} from "@lib/firebaseUtil";
import {Database} from "@lib/Database";
import {Logger} from "@lib/logger/Logger";

export type PayloadListener = (payload: MsgPayload, forwarder: ClientConnection) => void
export class ClientConnection {

  private _id: string;
  private _ws: websocket.WebSocket;
  private _state: ClientConnectionState;
  protected _msgListeners: PayloadListener = () => {}
  protected _globalMsgListeners: (payload: Payload, forwarder: ClientConnection) => void = () => {}
  protected _closeListener: () => void = () => {}
  protected _upgradeListener: (client: ClientConnection) => void = () => {}
  private _user: User | undefined
  protected TYPE = "default"

  private _lastActive: number = new Date().getTime()

  constructor(id: string, ws: websocket.WebSocket) {
    this._id = id;
    this._ws = ws;
    // always start as guest
    this._state = "guest";
  }

  public upgradeToAuthenticated() {
    this._upgradeListener(this)
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

  public onConnectionUpgraded(listener: (client: ClientConnection) => void ) {
    this._upgradeListener = listener
  }

  public bindToGlobalListener(listener: GlobalEventListener) {
    this._globalMsgListeners = listener
  }

  public close(reason?: string) {
    if (reason) {
      this.send(new MsgPayload({group: "server-response", name: "close-connection", data: reason}))
    }
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
    // flush previous close listent
    this._closeListener()
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

  public toObject() {
    return {
      id: this._id,
      state: this._state,
      user: this._user?.getCachedData(),
      lastActive: this._lastActive,
      type: this.TYPE
    }
  }

  protected async _handleUpgrade(payload: Payload<{token: string}>) {
    const data = payload.getData()

    if (!data.token) {
      this.send(new Payload("upgrade", {status: 1}))
      return
    }

    const app = getFirebaseApp()
    const t = await app.auth().verifyIdToken(data.token)

    if (!t.uid) {
      this.send(new Payload("upgrade", {status: 1}))
      return
    }

    let userd = Database.findUser(t.uid)

    if (!userd) {
      const nu = {
        uid: t.uid,
        avatar: t.picture,
        score: 0,
        level: 0
      }

      Database.createUser(nu)
      userd = nu
    }

    this._user = new User(userd.uid)
    this.upgradeToAuthenticated()
    this.send(new Payload("upgrade", {status: 0, userData: userd}))
  }

  private _forwardMessage(data: websocket.RawData) {
    const messagePayload = new Payload(data.toString())

    if (messagePayload.getType() === "upgrade" && this._state === "authenticated") {
      Logger.warn("dropping payload; payload type upgrade should not be sent after authentication")
      return;
    }
    if (messagePayload.getType() === "upgrade") {
      // prevent duplicate upgrade
      if (this._state === "authenticated") {
        return;
      }
      this._handleUpgrade(messagePayload)
      return
    }

    if (messagePayload.getType() === "frame" || messagePayload.getType() === "ping") {
      Logger.warn("dropping payload; payload type frame and ping should not be sent to the server")
      return
    }

    console.log(messagePayload)
    // forward to listener
    if (messagePayload.isMessage()) {
      this._msgListeners(new MsgPayload(messagePayload), this)
    }
    // forward to global listener
    console.log(new MsgPayload(messagePayload), "here")
    this._globalMsgListeners(new MsgPayload(messagePayload), this)
  }
}