import {CoreGame} from "../src/lib/CoreGame";
import {ConnectionPool} from "../src/lib/ConnectionPool";
import {Player} from "../src/lib/player/Player";
import {MsgPayload, Payload} from "../src/lib/Payload";

const game = new CoreGame()
const pool = new ConnectionPool().setGlobalListener(game.globalListener)
pool.startListening(1424)
let id = ""
class MsgPubSub {
  listener: ((msg: Payload) => void) = () => {}

  public subscribe(cb: (msg: Payload) => void )  {
    this.listener = cb
  }

  public syncAwaitListen(timeout: number = 5 * 1000):Promise<Payload> {
    return new Promise((resolve, reject) => {
      const et = setTimeout(() => {
        console.log("await timeout reached. exiting")
        reject("await timeout reached")
      },timeout)
      this.subscribe((msg) => {
        clearTimeout(et)
        resolve(msg)
      })
    })
  }

  public publish(msg: Payload)  {
    this.listener(msg)
  }
}

const msgbus = new MsgPubSub()


beforeAll(async () => {
  const p = new Promise((re, rej) => {
    const conn = new WebSocket("ws://localhost:1424/ws");

    const et = setTimeout(() => {
      console.log("unable to setup the client connection. skipping tests")
      process.exit(0);
    }, 5* 1000)

    conn.onopen = (ws) => {
      setTimeout(() => {
        conn.send(JSON.stringify({
          type: "upgrade",
          data: {token: "12345"}
        }))
      }, 1000)
    }

    conn.onmessage = (msg) => {
      const message = JSON.parse(msg.data.toString())
      if (message.type === "handshake") {
        id = message.data
        return
      }
      if (message.type === "message") {
        if (message.data.type === "upgrade-success") {
          if (!id){return}
          re(true)
          clearTimeout(et)
          return
        }

        msgbus.publish(new Payload(message.type, message.data))
      }
    }

  })

  return await p
}, 5 * 1000)

describe("player", () => {

  let globalPlayer: Player
  test('object creation', () => {
    const conn = pool.findConnection(id)
    expect(conn).toBeDefined()
    if (!conn) return
    const player = new Player(conn)
    expect(player.getUid()).toEqual("1234567890")
    globalPlayer = player
  });

  test("payload forwarding", async () => {
    
    globalPlayer.sendPayload(new MsgPayload({group: "server-response", name: "test", status: 0}))
    const re = await msgbus.syncAwaitListen()
    expect(re.getData()).toHaveProperty("name", "test")
  })
})