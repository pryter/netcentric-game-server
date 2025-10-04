import {MsgPayload, Payload, PayloadMsgData} from "@lib/Payload";
import {ClientConnection} from "@lib/ClientConnection";
import {Player} from "@lib/player/Player";
import {CoreGame} from "@lib/CoreGame";
import {OriginalGameRoom} from "../OriginalGameRoom";

export class TestCoreGame extends CoreGame {

  protected _handleMessage(payload: MsgPayload, forwarder: ClientConnection) {

    if (!payload.isClientAction()) {
      return
    }

    switch (payload.getName()) {
      // Start test room
      case "start-test-suite":
        // do some single player stuff
        const room = new OriginalGameRoom()
        this._roomRegistry[room.getId()] = room
        // forwarder became player
        const player = new Player(forwarder)
        // add player to the room
        room.addPlayer(player)

        // pause match after player disconnects?
        player.onDisconnect(() => {
          room.pauseMatch({type: "p-dis", text: "player disconnected"}, player)
        })

        // ready to confirm to user
        forwarder.send(new MsgPayload({group: "server-response", name: "start-test-suite",data:{roomId: room.getId()}, status: 0}))
        break
      // Join test room
      case "join-test-suite":
        const id = payload.getMsgData().roomId
        const groom = this._roomRegistry[id]
        if (!groom) {
          break
        }

        const p = new Player(forwarder)
        p.onDisconnect(() => {
          groom.pauseMatch({type: "p-dis", text: "player disconnected"}, p)
        })

        groom.addPlayer(p)
        forwarder.send(new MsgPayload({group: "server-response", name: "join-test-suite", status: 0}))
    }
  }
}