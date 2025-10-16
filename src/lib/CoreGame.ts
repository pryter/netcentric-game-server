import {FramePayload, MsgPayload, Payload, PayloadMsgData} from "./Payload";
import {ConnectionPool} from "./ConnectionPool";
import {TestGameRoom} from "./TestGameRoom";
import {ClientConnection} from "./ClientConnection";
import {Player} from "./player/Player";
import {GameRoom} from "./GameRoom";
import {OriginalGameRoom} from "../OriginalGameRoom";
import {MonitorClientConnection} from "@lib/MonitorClientConnection";
import serveStatic from "serve-static";
import http from "node:http";
import finalhandler from "finalhandler";
import * as path from "node:path";
import AdmZip from "adm-zip";
import * as fs from "node:fs";
import {IDPool} from "@lib/IDPool";

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
      this._handleMessage(new MsgPayload(payload.getData()), forwarder)
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

    const cwd = process.cwd()
    const monPath = path.join(cwd, "public_mon")
    if (!fs.existsSync(monPath)) {
      fs.mkdirSync(monPath)
      const zipPath = path.join(monPath, "out.zip");
      const artifactUrl = "https://github.com/pryter/netcentric-monitoring-client/blob/main/out/artifact.zip?raw=true"
      console.log("downloading artifact");
      const res = await fetch(artifactUrl);
      if (!res.ok) {
        fs.rmdirSync(monPath)
        throw new Error(`failed to download: ${res.statusText}`);
      }
      const buffer = await res.arrayBuffer();
      fs.writeFileSync(zipPath, Buffer.from(buffer));
      console.log("extracting artifact...");
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(monPath, true);
      console.log("extracted to:", monPath);
    }

    const serve = serveStatic(monPath);

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
      case "sub-mon-stream":
        if (forwarder instanceof MonitorClientConnection){
          this._monitoringSubscriber[forwarder.getId()] = forwarder
          forwarder.send(new MsgPayload({group: "server-response", name: "sub-mon-stream", status: 0}))
        }else{
          // not allow normal connection to subscribe to monitoring stream
          forwarder.send(new MsgPayload({group: "server-response", name: "sub-mon-stream", status: 1}))
        }
        break
      case "set-nickname": {
        const sendError = () => {
          forwarder.send(new MsgPayload({group: "server-response", name: "set-nickname", status: 1}))
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
        forwarder.send(new MsgPayload({group: "server-response", name: "set-nickname", status: 0}))
        forwarder.send(new MsgPayload({group: "credential", name: "server-user", data: user.getUserData(), status: 1}))
        break
      }
      case "get-user": {
        const user = forwarder.getUser()
        if (!user) {
          // specially for credential
          forwarder.send(new MsgPayload({group: "server-response", name: "get-user", status: 1}))
          break
        }

        forwarder.send(new MsgPayload({group: "server-response", name: "get-user", status: 0}))
        forwarder.send(new MsgPayload({group: "credential", name: "server-user", data: user.getUserData(), status: 0}))
      }
      case "start-example":
        try {
          // do some single player stuff
          const room = new TestGameRoom()
          // forwarder became player
          const player = new Player(forwarder)
          // add player to the room
          room.addPlayer(player)

          // pause match after player disconnects?
          player.onDisconnect(() => {
            room.pauseMatch({type: "p-dis", text: "player disconnected"}, player)
          })

          // ready to confirm to user
          forwarder.send(new MsgPayload({group: "server-response", name: "start-example", status: 0}))
          room.runMatch()
        } catch (e) {
          forwarder.send(new MsgPayload({group: "server-response", name: "start-example", status: 1}))
        }
        break
      case "create-og-game":
        // do some single player stuff
        const room = new OriginalGameRoom()
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
        forwarder.send(new MsgPayload({group: "server-response", name: "create-og-game",data:{joinCode: joinCode}, status: 0}))
        break
      case "join-og-game":
        const code = payload.getMsgData().code
        console.log(code)
        const id = IDPool.getInstance().findActualID(code)
        if (!id) {
          forwarder.send(new MsgPayload({group: "server-response", name: "join-og-game", status: 1}))
          break
        }

        const groom = this._roomRegistry[id]
        if (!groom) {
          forwarder.send(new MsgPayload({group: "server-response", name: "join-og-game", status: 1}))
          break
        }

        const p = new Player(forwarder)

        const result = groom.addPlayer(p)

        if (!result) {
          forwarder.send(new MsgPayload({group: "server-response", name: "join-og-game", status: 1, data: "join-mid-game-error"}))
          return;
        }

        forwarder.send(new MsgPayload({group: "server-response", name: "join-og-game", status: 0}))
    }
  }
}