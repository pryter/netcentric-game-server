import {GameRoom, MatchPauseReason} from "@lib/GameRoom";
import {Player} from "@lib/player/Player";
import {PlayerActionType} from "@lib/player/PlayerActionType";
import {FramePayload} from "@lib/Payload";

/**
RoomState is the state of the room and will be used to determine what to show the user
- waiting: the screen displays the waiting rooms showing other players profile
- running: the screen displays the game
- next-round-countdown: the screen displays the next round countdown
- resolved: the screen displays the score (the game is over)


 Flow Example
  waiting -> running (first round) -> next-round-countdown -> running (second round)
  -> next-round-countdown -> running (third round) -> resolved
*/

type RoomState = "waiting" | "running" | "next-round-countdown" | "resolved"
type PlayerData = {
  isReady: boolean,
  displayName?: string | undefined,
  id: string,
  avatarUri?: string | undefined,
  score: number,
}

/** RoomFrame is the frame that will be sent to the client
 * @property timer is the global timer of the room (in this case 1 minute and counting down).
 * the timer should count down from 60 and reset everytime user completes each question.
 * @property breakTimer is the timer for the break (before first round, next round...).
 * @property players is the record of players in the room by using their **id** as the key
 * @property round is the current round number
 * @property winner is the player who won the round
 * */
export type RoomFrame = {
  players: Record<string, PlayerData>
  timer: number,
  breakTimer: number,
  round: number,
  winner: PlayerData | null,
  state: RoomState,
  question: string
}

export class OriginalGameRoom extends GameRoom{

  private _frame: Partial<RoomFrame> = {
    timer: 60,
    breakTimer: 3,
    round: 1,
    winner: null,
    state: "waiting",
    question: ""
  }

  private _playerRecord: Record<string, Player> = {}
  private _playerDataRecord: Record<string, PlayerData> = {}

  // this will be called when the room is created
  protected onRoomCreated(): void {
  }

  // this will be called when the game starts
  // or manually call this.runMatch() to trigger this event
  protected onGameStart(): void {

  }

  protected onMatchPause(reason: MatchPauseReason): void {

  }

  protected onMatchResolve(): void {

  }

  protected onPlayerAction(player: Player, type: PlayerActionType, data: any): void {
    console.log("\x1b[36m%s\x1b[0m", "player action",player, type, data)
  }

  protected onPlayerJoin(player: Player): void {


    // add player to the record for further communication
    this._playerRecord[player.getUid()] = player

    // init player data for the room
    this._playerDataRecord[player.getUid()] = {
      isReady: false,
      displayName: player.getNickname(),
      id: player.getUid(),
      avatarUri: player.getAvatar(),
      score: 0,
    }
  }

  protected onServerTick(): void {



    // broadcast frame to all players
    for (const [_,v] of Object.entries(this._playerRecord)) {
      // fill the frame is playerdata
      const filled: RoomFrame = {...this._frame, players: this._playerDataRecord} as RoomFrame
      v.sendPayload(new FramePayload(filled))
    }
  }


}