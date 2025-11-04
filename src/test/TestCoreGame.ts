import {MsgPayload, Payload, PayloadMsgData} from "@lib/Payload";
import {ClientConnection} from "@lib/ClientConnection";
import {Player} from "@lib/player/Player";
import {CoreGame} from "@lib/CoreGame";
import {CompetitiveGameRoom} from "@lib/room/CompetitiveGameRoom";
import {TestPlayer} from "./TestPlayer";
import {IDPool} from "@lib/IDPool";

export class TestCoreGame extends CoreGame {

  protected _handleMessage(payload: MsgPayload, forwarder: ClientConnection) {

    if (!payload.isClientAction()) {
      return
    }

    switch (payload.getName()) {
      // Start test room
      case "start-test-suite":
        // do some single player stuff
        const room = new CompetitiveGameRoom()
        this._roomRegistry[room.getId()] = room

        room.setDestroyListener(() => {
          // free up code space and clear room registry
          IDPool.getInstance().free(room.getId())
          delete this._roomRegistry[room.getId()]
        })
        // forwarder became player
        const player = new TestPlayer(forwarder) as unknown as Player
        // add player to the room
        room.addPlayer(player)

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

        const p = new TestPlayer(forwarder) as unknown as Player
        p.onDisconnect(() => {
          groom.pauseMatch({type: "p-dis", text: "player disconnected"}, p)
        })

        groom.addPlayer(p)
        forwarder.send(new MsgPayload({group: "server-response", name: "join-test-suite", status: 0}))
    }
  }
}