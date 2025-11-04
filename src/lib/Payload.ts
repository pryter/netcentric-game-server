export type PayloadType = "message" | "handshake" | "ping" | "upgrade" | "frame"

export type FrameData = Record<string, any>

// Status: 0 = success, 1 = error, 2 = unknown
export type PayloadMsgData = {
  group: "client-action" | "server-response" | "upgrade" | "credential" | "monitoring-event",
  name: string,
  status?: number,
  data?: any
}

export class Payload<T extends any = any> {
  protected _data: T;
  private _type: string;
  private _msgId: string;

  constructor(type: PayloadType, data: T, msgId?: string)
  constructor(raw_message: string)

  constructor(...args: any[]) {
    this._msgId = `m-${new Date().getTime()}`
    if (args.length === 1) {
      const raw_message = args[0]
      const r = JSON.parse(raw_message)
      if (!r.type) {
        throw new Error("invalid payload")
      }
      this._data = r.data
      this._type = r.type
      this._msgId = r.mid
    } else {
      this._data = args[1]
      this._type = args[0]

      if (args[2]) {
        this._msgId = args[2]
      }
    }
  }

  public getData(): T {
    return this._data;
  }

  public isMessage() {
    return this._type === "message"
  }

  public getType() {
    return this._type;
  }

  public setMsgId(msgId: string) {
    this._msgId = msgId
  }

  public getMsgId() {
    return this._msgId
  }

  public serialize() {
    return JSON.stringify({type: this._type, data: this._data, mid: this._msgId})
  }
}

export class MsgPayload extends Payload<PayloadMsgData> {
  constructor(payload: Payload)
  constructor(data: PayloadMsgData)

  constructor(...args: any[]) {
    const p = args[0]
    if (p instanceof Payload) {
      super("message", p.getData(), p.getMsgId())
    } else {
      super("message", args[0])
    }
  }

  public createResponse(status: number, data?: any) {
    const copy = new MsgPayload({
      group: "server-response",
      name: this._data.name,
      status,
      data
    })

    copy.setMsgId(this.getMsgId())
    return copy
  }

  public isClientAction() {
    return this._data.group === "client-action"
  }

  public isServerResponse() {
    return this._data.group === "server-response"
  }

  public getGroup() {
    return this._data.group
  }

  public getName() {
    return this._data.name
  }

  public getStatus() {
    return this._data.status
  }

  public isError() {
    return this._data.status !== undefined ? this._data.status > 0 : true
  }

  // override
  public getMsgData() {
    return this._data.data
  }
}

export class FramePayload extends Payload<FrameData | "EOF" | "SOF"> {
  constructor(frame: FrameData | "EOF" | "SOF") {
    super("frame", frame);
  }

  public getFrame() {
    return this._data
  }

  public isEOFrame() {
    return this._data === "EOF"
  }

  public isSOFrame() {
    return this._data === "SOF"
  }
}