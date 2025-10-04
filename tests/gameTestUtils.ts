import {Payload} from "../src/lib/Payload";
import {MockClientConnection} from "../src/lib/MockClientConnection";
import {User} from "../src/lib/User";

export class MsgBus {
  listener: ((msg: Payload) => void) = () => {}
  public streamer: ((msg: Payload) => void) = () => {}

  public subscribe(cb: (msg: Payload) => void )  {
    this.listener = cb
  }

  public awaitFor(matchFn: (p: Payload) => boolean, timeout: number = 5 * 1000):Promise<Payload> {
    return new Promise((resolve, reject) => {
      const et = setTimeout(() => {
        console.log("await timeout reached. exiting")
        reject("await timeout reached")
      },timeout)
      this.subscribe((msg) => {
        if (!matchFn(msg)) return
        clearTimeout(et)
        resolve(msg)
      })
    })
  }

  public startStream() {
    this.streamer = (msg) => {
      console.log("\x1b[36m%s\x1b[0m","Stream", msg)
    }
  }

  public publish(msg: Payload)  {
    this.listener(msg)
    this.streamer(msg)
  }
}

/**
 * create a player with a mock connection and a msg bus
 */
export const createPlayer = (id: string, name: string): [MockClientConnection, MsgBus] => {
  const c = new MockClientConnection(id, new User(id, name))
  const bus = new MsgBus()
  c.onClientReceive((msg) => {
    bus.publish(msg)
  })
  return [c, bus]
}

/**
 * wait for a certain amount of time
 * @param ms
 */
export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
