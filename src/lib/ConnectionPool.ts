import * as websocket from "ws";
import {v4} from "uuid"
import {ClientConnection} from "./ClientConnection";
import {Payload} from "./Payload";

import type {CoreGame, GlobalEventListener} from "./CoreGame";
import {MonitorClientConnection} from "@lib/monitoring/MonitorClientConnection";
import chalk from "chalk";
import {Logger} from "@lib/logger/Logger";

type ConnectionRecord = Record<string, ClientConnection>


export class ConnectionPool {
  protected _table: ConnectionRecord
  protected _globalListener: GlobalEventListener = () => {}
  protected static PING_INTERVAL: number = 5 * 1000

  constructor() {
    this._table = {}
  }

  public setGlobalListener(listener: GlobalEventListener): ConnectionPool {
    this._globalListener = listener
    return this;
  }
  // every time the new connection is established
  protected onConnection(ws: websocket.WebSocket, path: string) {
    const id = v4()

    let cc: ClientConnection
    if (path === "/monitoring") {
      cc = new MonitorClientConnection(id, ws)
    }else{
      cc = new ClientConnection(id, ws)
    }

    this._table[id] = cc

    cc.onConnectionUpgraded((c) => {
      this.clearDuplicated(c)
    })

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
    }, ConnectionPool.PING_INTERVAL)

    cc.send(new Payload("handshake", id))

    cc.onClose(() => {
      delete this._table[id]
      clearInterval(ping_t)
      Logger.info(`closed #${id}`)
    })
  }

  public destroyConnection(sid: string | ClientConnection) {
    let id: string

    if (typeof sid === "string") {
      id = sid
    }else{
      id = sid.getId()
    }

    if (this._table[id]) {
      this._table[id]?.close()
      delete this._table[id]
    }

  }

  public findConnection(id: string) {
    return this._table[id]
  }

  public startListening(port: number)  {
    try {
      const wss = new websocket.WebSocketServer({port: port, host: "0.0.0.0"})
      wss.on("connection", (ws, req) => {
        this.onConnection(ws, req.url ?? "")
      })
      console.log(chalk.bold("\nserver started on", `0.0.0.0:${port}`))
      console.log(chalk.gray.italic("note: monitoring client started on path /monitoring"))
    } catch (e) {
      throw new Error("could not start listening")
    }
  }

  public clearDuplicated(c: ClientConnection) {
    const uid = c.getUser()?.getUid()
    const exSid = c.getId()
    Object.values(this._table).forEach((cc) => {
      const id = cc.getUser()?.getUid()
      if (!id) return
      if (id == uid && cc.getId() !== exSid) {
        cc.close("duplicated-connection")
      }
    })
  }

  public tableToObject() {
    return Object.values(this._table).map((c) => {return c.toObject()})
  }
}