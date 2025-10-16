import {v4} from "uuid";
import type {Player} from "./player/Player";
import {PlayerActionType} from "./player/PlayerActionType";
import {FramePayload, MsgPayload} from "@lib/Payload";

export type MatchPauseReason = {type: string, text: string}

export abstract class GameRoom {

  private readonly _id: string;
  private _tickInterval: NodeJS.Timeout
  protected readonly TICK_PER_SECOND = 10
  private destroyListener: () => void = () => {}


  constructor() {
    this._id = v4()
    this._tickInterval = setInterval(() => {
      this.runServerTick()
    }, 1000 / this.TICK_PER_SECOND)
    this.onRoomCreated()
  }

  public getId() {
    return this._id
  }

  public runServerTick() {
    this.onServerTick()
  }

  public addPlayer(player: Player) {
    // auto bind player action listener
    player.onDisconnect(() => {
      this.onPlayerLeave(player)
      this.pauseMatch({type: "p-dis", text: "owner disconnected"}, player)
      player.sendPayload((new FramePayload("EOF")))
    })

    const r = this.onPlayerJoin(player)
    if (!r) {
      return false
    }

    player.bindPlayerActionListener((type, data) => {
      this.onPlayerAction(player, type, data)
    })

    player.sendPayload(new FramePayload("SOF"))

    return true

  }

  public setDestroyListener(l: () => void) {
    this.destroyListener = l
  }

  public destroyRoom() {
    clearInterval(this._tickInterval)
    this.broadcastPayload(new FramePayload("EOF"))
    this.destroyListener()
  }

  public runMatch() {
    this.onGameStart()
  }

  public pauseMatch(reason: MatchPauseReason, player: Player) {
    this.onMatchPause(reason, player)
  }

  public broadcastPayload(payload: MsgPayload | FramePayload) {
    for (const p of this.getAllPlayers()){
      p.sendPayload(payload)
    }
  }

  protected abstract onPlayerJoin(player: Player): boolean

  // Get triggered when player action is received except item use action which will be handled by the item itself
  protected abstract onRoomCreated(): void
  protected abstract onPlayerAction(player: Player, type: PlayerActionType, data: any): void
  protected abstract onPlayerLeave(player: Player): void
  protected abstract onGameStart(): void
  protected abstract onMatchResolve(): void
  protected abstract onServerTick(): void
  protected abstract onMatchPause(reason: MatchPauseReason, player: Player): void
  protected abstract getAllPlayers(): Player[]
  public abstract getRoomData(): Record<string, any>
}
