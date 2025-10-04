import * as websocket from "ws";
import {v4} from "uuid"
import {Payload} from "@lib/Payload";
import {ConnectionPool} from "@lib/ConnectionPool";
import {TestClientConnection} from "./TestClientConnection";

export class TestConnectionPool extends ConnectionPool{
  constructor() {
    super()
  }

  protected onConnection(ws: websocket.WebSocket) {
    const id = v4()

    // create connection using client connection
    const cc = new TestClientConnection(id, ws)

    this._table[id] = cc

    cc.bindToGlobalListener(this._globalListener)
    cc.startForwarding()

    const ping_t = setInterval(() => {
      const pingPayload = new Payload("ping", new Date().getTime())
      ws.send(pingPayload.serialize(), (err) => {
        if (err) {
          if (cc.isInactive()) {
            this.destroyConnection(id)
          }
          return
        }

        cc.updateLastActive()
      })
    }, TestConnectionPool.PING_INTERVAL)

    cc.send(new Payload("handshake", id))

    cc.onClose(() => {
      delete this._table[id]
      clearInterval(ping_t)
      console.log(`closed ${id}`)
    })
  }

}