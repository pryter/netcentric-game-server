import {ClientConnection} from "@lib/ClientConnection";
import {MsgPayload, Payload} from "@lib/Payload";
import {User} from "@lib/User";

export class TestClientConnection extends ClientConnection{


  protected _handleUpgrade(payload: Payload<{id: string, token: string, name: string}>) {
    const data = payload.getData()

    // skip authentication for now

    const user = new User(data.id, data.name)
    this.setUser(user)
    this.upgradeToAuthenticated()
    this.send(new MsgPayload({group: "upgrade", name: "upgrade-success"}))
  }
}