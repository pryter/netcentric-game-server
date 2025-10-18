import {ClientConnection} from "@lib/ClientConnection";
import * as websocket from "ws";
import {MsgPayload, Payload} from "@lib/Payload";
import type {GlobalEventListener} from "@lib/CoreGame";
import {User} from "@lib/User";

export class MockClientConnection extends ClientConnection {

  private msgRelayFn: (msg: Payload) => void = () => {}

  constructor(id: string, mockUser: User) {
    super(id, null as any)
    this.setUser(mockUser)
  }

  public isAuthenticated() {
    return true
  }

  public close() {
    this._closeListener()
    return
  }

  public send(msg: Payload) {
    this.msgRelayFn(msg)
  }

  public clientSend(msg: Payload) {
    this.mockforward(msg)
  }

  public onClientReceive(cb: (msg: Payload) => void) {
    this.msgRelayFn = cb
  }


  public onClose(cb: () => void) {
    this._closeListener = () => {
      this._closeListener()
      cb()
    }
  }

  public startForwarding() {
    return
  }


  private mockforward(data: Payload) {
    const messagePayload = data

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