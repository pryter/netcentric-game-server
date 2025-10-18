import {ClientConnection} from "@lib/ClientConnection";
import {MsgPayload, Payload} from "@lib/Payload";
import {User} from "@lib/User";

export class MonitorClientConnection extends ClientConnection {
  protected TYPE = "monitoring"

  protected async _handleUpgrade(payload: Payload<{token: string}>) {
    // skip authentication for now
    if (payload.getData().token !== "12345") {
      return;
    }

    this.upgradeToAuthenticated()
    this.send(new MsgPayload({group: "upgrade", name: "upgrade-success"}))
  }
}