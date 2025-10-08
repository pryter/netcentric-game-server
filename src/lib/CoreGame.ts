import {MsgPayload, Payload, PayloadMsgData} from "./Payload";
import {ConnectionPool} from "./ConnectionPool";
import {TestGameRoom} from "./TestGameRoom";
import {ClientConnection} from "./ClientConnection";
import {Player} from "./player/Player";
import {GameRoom} from "./GameRoom";

export type GlobalEventListener = (payload: Payload, forwarder: ClientConnection) => void
export class CoreGame {

  protected _roomRegistry: Record<string, GameRoom> = {}

  constructor() {

  }

  public globalListener = (payload: Payload, forwarder: ClientConnection)=>  {
    console.log("global listener", payload)
    switch (payload.getType()) {
    case "message":
      this._handleMessage(new MsgPayload(payload.getData()), forwarder)
      break
    }
  }

  protected _handleMessage(payload: MsgPayload, forwarder: ClientConnection) {

    if (!payload.isClientAction()) {
      return
    }

    switch (payload.getName()) {
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
    }
  }
}