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
      case "start-sp":
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
        forwarder.send(new MsgPayload({group: "server-response", name: "start-sp", status: 0}))
        room.runMatch()
        break
    }
  }
}