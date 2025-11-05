import {ClientConnection} from "@lib/ClientConnection";
import {MsgPayload, Payload} from "@lib/Payload";
import {User} from "@lib/User";

export class MonitorClientConnection extends ClientConnection {
  protected TYPE = "monitoring"

  protected async _handleUpgrade(payload: Payload<{token: string}>) {
    // skip authentication for now

    const t = process.env.MONITORING_TOKEN ?? "12345"
    if (payload.getData().token !== t) {
      return;
    }

    this.upgradeToAuthenticated()
    this.send(new MsgPayload({group: "upgrade", name: "upgrade-success"}))
  }
}