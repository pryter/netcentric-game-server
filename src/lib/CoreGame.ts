import {FramePayload, MsgPayload, Payload, PayloadMsgData} from "./Payload";
import {ConnectionPool} from "./ConnectionPool";
import {ClientConnection} from "./ClientConnection";
import {Player} from "./player/Player";
import {GameRoom} from "./GameRoom";
import {MonitorClientConnection} from "@lib/monitoring/MonitorClientConnection";
import serveStatic from "serve-static";
import http from "node:http";
import finalhandler from "finalhandler";
import {IDPool} from "@lib/IDPool";
import {AssetsLoader} from "@lib/monitoring/AssetsLoader";
import {CompetitiveGameRoom} from "@lib/room/CompetitiveGameRoom";
import {Database} from "@lib/Database";
import {ClassicGameRoom} from "@lib/room/ClassicGameRoom";

export type GlobalEventListener = (payload: Payload, forwarder: ClientConnection) => void
export class CoreGame {

  protected _roomRegistry: Record<string, GameRoom> = {}
  private _monitoringSubscriber: Record<string, MonitorClientConnection> = {}
  private _pool: ConnectionPool

  constructor() {
    const pool = new ConnectionPool()
    pool.setGlobalListener(this.globalListener)
    this._pool = pool
  }

  public globalListener = (payload: Payload, forwarder: ClientConnection)=>  {
    switch (payload.getType()) {
    case "message":
      this._handleMessage(payload as MsgPayload, forwarder)
      break
    }
  }

  private getCurrentRoomReg() {
   return Object.values(this._roomRegistry).map((v) => ({id: v.getId(), ...v.getRoomData()}))
  }

  public broadcast = () => {
    for (const subscriber of Object.values(this._monitoringSubscriber)) {
      subscriber.send(new MsgPayload({group: "monitoring-event", name: "event", data: {
          roomReg: this.getCurrentRoomReg(),
          connectionPool: this._pool.tableToObject(),
        }}))
    }
  }

  public async startMonitoringStream(sample: number= 1) {
    setInterval(() => {
      this.broadcast()
    }, sample * 1000)

    const path = await AssetsLoader.loadMonitoringUI()

    const serve = serveStatic(path);

    const server = http.createServer(function(req, res) {
      const done = finalhandler(req, res);
      serve(req, res, done);
    });

    console.log("Monitoring ui listening on port 8002 \nPlease open http://localhost:8002/")
    server.listen(8002);

  }

  public startGameServer(port: number) {
    this._pool.startListening(port)
  }

  protected _handleMessage(payload: MsgPayload, forwarder: ClientConnection | MonitorClientConnection) {

    if (!payload.isClientAction()) {
      return
    }

    switch (payload.getName()) {
      case "get-leaderboard":
        const response = payload.createResponse(0, {
          leaderboard: Database.fetchLeaderBoard()
        })
        forwarder.send(response)
        break
      case "sub-mon-stream":
        if (forwarder instanceof MonitorClientConnection){
          this._monitoringSubscriber[forwarder.getId()] = forwarder
          forwarder.send(payload.createResponse(0))
        }else{
          // not allow normal connection to subscribe to monitoring stream
          forwarder.send(payload.createResponse(1))
        }
        break
      case "set-nickname": {
        const sendError = () => {
          forwarder.send(payload.createResponse(1))
        }
        const n = payload.getMsgData().nickname
        if (!n) {
          sendError()
          break
        }

        const user = forwarder.getUser()

        if (!user) {
          sendError()
          break
        }

        user.updateNickname(n)
        forwarder.send(new MsgPayload(payload.createResponse(0)))
        forwarder.send(new MsgPayload({group: "credential", name: "server-user", data: user.getUserData(), status: 1}))
        break
      }
      case "get-user": {
        const user = forwarder.getUser()
        if (!user) {
          // specially for credential
          forwarder.send(new MsgPayload(payload.createResponse(1)))
          break
        }

        forwarder.send(new MsgPayload(payload.createResponse(0)))
        forwarder.send(new MsgPayload({group: "credential", name: "server-user", data: user.getUserData(), status: 0}))
      }
      case "create-og-game": {// do some single player stuff
        const room = new CompetitiveGameRoom()
        this._roomRegistry[room.getId()] = room

        room.setDestroyListener(() => {
          // free up code space and clear room registry
          IDPool.getInstance().free(room.getId())
          delete this._roomRegistry[room.getId()]
        })
        // forwarder became player
        const player = new Player(forwarder)
        // add player to the room
        room.addPlayer(player)

        const joinCode = IDPool.getInstance().getCode(room.getId())

        // ready to confirm to user
        forwarder.send(payload.createResponse(0, {joinCode: joinCode}))
        break
      }
      case "create-classic-game": {// do some single player stuff
        const room = new ClassicGameRoom()
        this._roomRegistry[room.getId()] = room

        room.setDestroyListener(() => {
          // free up code space and clear room registry
          IDPool.getInstance().free(room.getId())
          delete this._roomRegistry[room.getId()]
        })
        // forwarder became player
        const player = new Player(forwarder)
        // add player to the room
        room.addPlayer(player)

        const joinCode = IDPool.getInstance().getCode(room.getId())

        // ready to confirm to user
        forwarder.send(payload.createResponse(0, {joinCode: joinCode}))
        break
      }
      case "join-og-game":
        const code = payload.getMsgData().code
        const id = IDPool.getInstance().findActualID(code)
        if (!id) {
          forwarder.send(payload.createResponse(1))
          break
        }

        const groom = this._roomRegistry[id]
        if (!groom) {
          forwarder.send(payload.createResponse(1))
          break
        }

        const p = new Player(forwarder)

        const result = groom.addPlayer(p)

        if (!result) {
          forwarder.send(payload.createResponse(1, "join-mid-game-error"))
          return;
        }

        forwarder.send(payload.createResponse(0))
    }
  }
}