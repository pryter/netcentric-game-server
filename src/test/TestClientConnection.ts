import {ClientConnection} from "@lib/ClientConnection";
import {MsgPayload, Payload} from "@lib/Payload";
import {User} from "@lib/User";
import {TestUser} from "./TestUser";

export class TestClientConnection extends ClientConnection{


  protected async _handleUpgrade(payload: Payload<{id: string, token: string, name: string}>) {
    const data = payload.getData()

    // skip authentication for now

    const user = new TestUser(data.name, data.id)
    this.setUser(user)
    this.upgradeToAuthenticated()
    this.send(new MsgPayload({group: "upgrade", name: "upgrade-success"}))
  }
}