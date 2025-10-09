import type {Player} from "./player/Player";
import {GameRoom} from "./GameRoom";
import {FramePayload, MsgPayload, Payload} from "./Payload";
import {PlayerActionType} from "./player/PlayerActionType";

// Modify this to your needs
// the frame should describe the current state of the game what user sees
// * state helps the client know what it should do
// eg. running: clients should show the question, timer, input box etc, resolved: clients should show the score

export type TestRoomFrame = {
  score: number,
  question: string,
  tick: number,
  timer: number
  state: string
}

// Predefined payload signal types
// room-created: notifies user the room is created
// answer-confirm: notifies user that the answer is correct or incorrect


export class TestGameRoom extends GameRoom {
  public getRoomData(): Record<string, any> {
      throw new Error("Method not implemented.");
  }
  protected onRoomCreated(): void {
      return
  }

  // you could implement yourself a properties lvl etc..
  private _p1: Player | undefined
  private currentQuestion: any[] = []
  private _frame: TestRoomFrame = {
    score: 0,
    question: "",
    tick: 0,
    timer: 0,
    state: "waiting"
  }

  protected onPlayerJoin(player: Player): boolean {
    this._p1 = player
    return true
  }



  protected onGameStart() {
    // do something
    const first = this.genQuestion()
    this.currentQuestion = first
    this._frame.question = first[0]
    this._frame.state = "running"
  }

  protected onMatchResolve() {
    // resolve the match count score anything
    // this room should be destroyed
    this._frame.state = "resolved"
    this.destroyRoom()
  }

  // tick will always tick no matter game logic is doing
  protected onServerTick() {
    // do something on tick your timer action should be here for consistency
    // increase timer every tick
    this._frame.tick++

    this._frame.timer = Math.floor(this._frame.tick / this.TICK_PER_SECOND)
    if (this._frame.timer >= 20) {
      this.onMatchResolve()
    }


    // player should receive frame every tick
    this._p1?.sendPayload(new FramePayload(this._frame))
  }

  protected onMatchPause(reason: { type: string; text: string }) {


    // if player disconnects
    if (reason.type === "p-dis") {
      this.destroyRoom()
    }
  }

  protected onPlayerAction(player: Player, type: PlayerActionType, data: any): void {
    // when player do something
    if (type === PlayerActionType.SUBMIT) {
      const d = parseInt(data as string)
      const isCorrect = d === this.currentQuestion[1]
      player.sendPayload(new MsgPayload({group: "server-response", name: "submit", status: 0, data: {isCorrect: isCorrect}}))

      if (isCorrect) {
        this._frame.score++

        // update room state for the next question
        const q = this.genQuestion()
        this.currentQuestion = q
        this._frame.question = q[0]
      }
    }
  }

  // helper functions
  private randomNumber(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private genQuestion() {
    const n1 = this.randomNumber(1, 10)
    const n2 = this.randomNumber(1, 10)
    const opList = ["+", "-"]
    const op = this.randomNumber(0, 1)

    const question = `${n1} ${opList[op]} ${n2}`
    const expected = eval(question)
    return [question, expected]
  }

  public getCurrentAnswer() {
    return this.currentQuestion
  }

}