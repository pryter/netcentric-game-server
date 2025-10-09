import {v4} from "uuid";
import type {Player} from "./player/Player";
import {PlayerActionType} from "./player/PlayerActionType";

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
    const r = this.onPlayerJoin(player)
    if (!r) {
      return false
    }

    player.bindPlayerActionListener((type, data) => {
      this.onPlayerAction(player, type, data)
    })

    return true

  }

  public setDestroyListener(l: () => void) {
    this.destroyListener = l
  }

  public destroyRoom() {
    clearInterval(this._tickInterval)
    this.destroyListener()
  }

  public runMatch() {
    this.onGameStart()
  }

  public pauseMatch(reason: MatchPauseReason, player: Player) {
    this.onMatchPause(reason, player)
  }

  protected abstract onPlayerJoin(player: Player): boolean

  // Get triggered when player action is received except item use action which will be handled by the item itself
  protected abstract onRoomCreated(): void
  protected abstract onPlayerAction(player: Player, type: PlayerActionType, data: any): void
  protected abstract onGameStart(): void
  protected abstract onMatchResolve(): void
  protected abstract onServerTick(): void
  protected abstract onMatchPause(reason: MatchPauseReason, player: Player): void
  public abstract getRoomData(): Record<string, any>
}
