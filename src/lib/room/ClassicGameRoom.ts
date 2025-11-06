import {GameRoom, MatchPauseReason} from "@lib/GameRoom";
import {Player} from "@lib/player/Player";
import {PlayerActionType} from "@lib/player/PlayerActionType";
import {FramePayload} from "@lib/Payload";
import {clearTimeout} from "node:timers";
import {ArithmeticHelper} from "@lib/ArithmeticHelper";

type RoomState =
  | "waiting"
  | "lobby-countdown"
  | "running"
  | "next-round-countdown"
  | "resolved";

type PlayerData = {
  isReady: boolean;
  roundStatus: "thinking" | "solved";
  isDisconnected: boolean;
  displayName: string;
  id: string;
  avatarUri?: string | undefined;
  score: number;
};

type Question = {
  // During play: number[] digits. At final scoreboard: string[] lines for naive UIs.
  problem: (number | string)[];
  target: number;
};

export type RoomFrame = {
  gameType: "classic"
  players: Record<string, PlayerData>;
  timer: number;
  breakTimer: number;
  round: number;
  winner: PlayerData | null;
  state: RoomState;
  question: Question | null;

  currentPlayerId: string | null;
  turnBanner: string | null;
  finalRanking: { id: string; displayName: string; score: number }[] | null;
};

export class ClassicGameRoom extends GameRoom {
  private _playerRecord: Record<string, Player> = {};
  private _playerDataRecord: Record<string, PlayerData> = {};
  private _frame: Omit<RoomFrame, "players"> = {
    gameType: "classic",
    timer: 60,
    breakTimer: 0,
    round: 0,
    winner: null,
    state: "waiting",
    question: null,
    currentPlayerId: null,
    turnBanner: null,
    finalRanking: null,
  };

  private readonly _TOTAL_ROUNDS = 3;
  private readonly _ROUND_SECONDS = 60;
  private readonly _BREAK_SECONDS = 6;
  private readonly _LOBBY_COUNTDOWN_SECONDS = 3;
  private readonly _POINTS_WIN = 1;
  private readonly _SCOREBOARD_SECONDS = 60;

  private _digits: number[] = [];
  private _target = 0;
  private _debugSolutionNumbersExpr = "";

  private _roundStartMs = 0;
  private _turnStartMs = 0;
  private _turnEndMs = 0;

  private _turnOrder: string[] = [];
  private _currentTurnIndex = -1;
  private _currentPlayerId: string | null = null;

  private _winnersThisRound: Set<string> = new Set();
  private _solveTimeMsByUid: Record<string, number> = {};

  // winner of previous game (to start next game)
  private _lastGameWinnerId: string | null = null;
  // fixed order for current game’s rounds
  private _matchBaseOrder: string[] | null = null;

  private _lastTickMs = 0;
  private _remainingRoundMs: number | null = null;
  private _pendingStartAction: "resume" | "start-new" | null = null;
  private _roomDestroyTimeout: NodeJS.Timeout | null = null;

  // ---------------- lifecycle ----------------
  protected onRoomCreated(): void {}

  protected onGameStart(): void {
    if (this._frame.state === "resolved") {
      // New game via explicit runMatch()
      this._resetAllScores();
      this._frame.round = 0;
      this._frame.state = "running";
      this._matchBaseOrder = null;
      this._startNextRound();
      return;
    }
    if (this._frame.state === "waiting" && this._remainingRoundMs != null && this._digits.length > 0) {
      this._resumeRound();
      return;
    }
    this._frame.state = "running";
    if (this._digits.length === 0) this._startNextRound();
  }

  protected onMatchPause(reason: MatchPauseReason, player: Player): void {
    if (reason.type === "p-dis") {
      const pdata = this._playerDataRecord[player.getUid()];
      if (pdata) pdata.isDisconnected = true;

      const anyAlive = Object.values(this._playerDataRecord).some((d) => !!d && !d.isDisconnected);
      if (!anyAlive) {
        this._roomDestroyTimeout = setTimeout(() => this.destroyRoom(), 10_000);
      }

      if (this._frame.state === "running" && this._currentPlayerId === player.getUid()) {
        this._endCurrentTurn("forfeit");
      }
    }
  }

  protected onMatchResolve(): void {
    const ranking = Object.values(this._playerDataRecord)
      .filter((d): d is PlayerData => !!d)
      .map((d) => ({ id: d.id, displayName: d.displayName, score: d.score }))
      .sort((a, b) => b.score - a.score);

    this._lastGameWinnerId = ranking.length ? ranking[0]!.id : null;

    // log final winner id
    console.log("[Game] Final winnerId:", this._lastGameWinnerId);

    // Show scoreboard
    this._frame.state = "resolved";
    this._frame.timer = 0;
    this._frame.breakTimer = 0;
    this._frame.finalRanking = ranking;
    this._frame.turnBanner = "Final scores";
    this._frame.currentPlayerId = null;

    const scoreLines = ranking.map((r, i) => `${i + 1}. ${r.displayName} — ${r.score}`);
    this._frame.question = { problem: scoreLines, target: 0 };
  }

  protected onPlayerJoin(player: Player): boolean {
    const uid = player.getUid();
    this._playerRecord[uid] = player;
    if (this._roomDestroyTimeout) clearTimeout(this._roomDestroyTimeout);

    if (uid in this._playerDataRecord) {
      this._playerDataRecord[uid]!.isDisconnected = false;
      return true;
    } else {
      if (this._frame.state !== "waiting") return false;
    }

    if (Object.values(this._playerDataRecord).length >= 2) {
      return false
    }

    this._playerDataRecord[uid] = {
      isReady: false,
      roundStatus: "thinking",
      displayName: player.getNickname() ?? "unknown raccoon",
      id: uid,
      isDisconnected: false,
      avatarUri: player.getAvatar(),
      score: 0,
    };
    return true;
  }

  protected onPlayerLeave(player: Player): void {
    const uid = player.getUid();
    delete this._playerRecord[uid];

    const kickPeriod = this._frame.state === "waiting" ? 10_000 : 60_000;

    setTimeout(() => {
      if (uid in this._playerRecord) return;

      delete this._playerDataRecord[uid];
      if (this._frame.state === "waiting") {
        this.getAllPlayers().forEach((p) => {
          const data = this._playerDataRecord[p.getUid()];
          if (data) data.isReady = false;
        });
      }
    }, kickPeriod);

    this._abortLobbyCountdownIfNeeded();
  }

  protected onPlayerAction(player: Player, type: PlayerActionType, data: any): boolean {
    const pid = player.getUid();

    if (type === PlayerActionType.READY) {
      this._setReady(pid, data);
      this._abortLobbyCountdownIfNeeded();
      if (this._frame.state === "waiting") this._maybeStartIfAllReady();
      return true
    }

    if (type === PlayerActionType.SUBMIT) {
      if (!(this._frame.state === "running" && pid === this._currentPlayerId)) return false

      // normalize special symbols
      const s = (typeof data === "string" ? data : String(data ?? ""))
        .replace(/×/g, "*")
        .replace(/÷/g, "/");
      if (!s) return false

      // parse & eval with parentheses support (and constraints)
      const parsed = ArithmeticHelper.parseAndEvalWithParentheses(s, this._digits.length);
      if (!parsed) return false

      const { val, nums } = parsed;
      if (!ArithmeticHelper.isSameMultiset(nums, this._digits)) return false

      const correct = val === this._target;

      // LOG: every submission
      console.log(
        `[Submit] pid=${pid} name=${this._playerDataRecord[pid]?.displayName} expr="${s}" val=${val} correct=${correct}`
      );

      if (!correct) return true

      const pdata = this._playerDataRecord[pid];
      if (pdata) pdata.roundStatus = "solved";

      if (!this._winnersThisRound.has(pid)) {
        this._winnersThisRound.add(pid);
        const now = Date.now();
        const usedMs = Math.max(0, now - this._turnStartMs);
        if (this._solveTimeMsByUid[pid] == null) this._solveTimeMsByUid[pid] = usedMs;

        // LOG: correct with time
        console.log(`[Correct] pid=${pid} usedMs=${usedMs}ms`);
      }

      this._endCurrentTurn("correct");

      return true
    }

    if (type === PlayerActionType.PLAY_AGAIN) {
      this.onRoomReset(false)
    }
    return false
  }

  protected onServerTick(): void {
    const now = Date.now();
    if (this._lastTickMs === 0) this._lastTickMs = now;
    const elapsedSec = (now - this._lastTickMs) / 1000;
    this._lastTickMs = now;

    if (this._frame.state === "running") {
      if (now >= this._turnEndMs) {
        this._endCurrentTurn("timeout");
      } else {
        const remain = Math.max(0, Math.ceil((this._turnEndMs - now) / 1000));
        this._frame.timer = remain;
      }
    } else if (this._frame.state === "lobby-countdown") {
      this._frame.breakTimer = Math.max(0, this._frame.breakTimer - elapsedSec);
      if (this._frame.breakTimer <= 0) {
        const action = this._pendingStartAction;
        this._pendingStartAction = null;
        if (this._everyoneReady()) {
          if (action === "start-new") {
            this._frame.state = "running";
            this._startNextRound();
          } else {
            this._frame.state = "running";
            this._startNextRound();
          }
        } else {
          this._frame.state = "waiting";
        }
      }
    } else if (this._frame.state === "next-round-countdown") {
      this._frame.breakTimer = Math.max(0, this._frame.breakTimer - elapsedSec);
      if (this._frame.breakTimer <= 0) this._startNextRound();
    } else {
      this._frame.timer = this._frame.state === "resolved" ? 0 : this._frame.timer;
    }

    // Per-player unicast (masking built-in)
    for (const player of this.getAllPlayers()) {
      const uid = player.getUid();
      const frameForUid = this._buildFrameForUid(uid);
      player.sendPayload(new FramePayload(frameForUid));
    }
  }

  protected getAllPlayers(): Player[] {
    return Object.values(this._playerRecord);
  }

  public getRoomData(): Record<string, any> {
    return { ...this._frame, players: this._playerDataRecord };
  }

  protected onRoomReset(deep:boolean = true): void {
    for (const id of Object.keys(this._playerDataRecord)) {
      const d = this._playerDataRecord[id];
      if (!d) continue;
      d.isReady = false;
      if(deep){
        d.score = 0
      }
      d.roundStatus = "thinking";
    }

    this._frame.state = "waiting";
    this._frame.gameType = "classic";
    this._frame.question = { problem: [], target: 0 };
    this._frame.timer = 60;
    this._frame.breakTimer = 0;

    // IMPORTANT: reset round counter so a new game can actually begin
    this._frame.round = 0;
    this._frame.winner = null;

    // Clear per-round/game internals (keep last winner id)
    this._digits = [];
    this._winnersThisRound.clear();
    this._solveTimeMsByUid = {};
    this._remainingRoundMs = null;
    this._pendingStartAction = null;
    this._turnOrder = [];
    this._currentTurnIndex = -1;
    this._currentPlayerId = null;
    this._matchBaseOrder = null;
  }

  // ---------------- ready helpers ----------------
  private _setReady(pid: string, val: boolean): void {
    const d = this._playerDataRecord[pid];
    if (d) d.isReady = val;
  }
  private _everyoneReady(): boolean {
    const arr = Object.values(this._playerDataRecord).filter((x): x is PlayerData => !!x);
    return arr.length > 0 && arr.every((p) => p.isReady);
  }

  private _maybeStartIfAllReady(): void {
    if (this._frame.state !== "waiting") return;
    if (this._everyoneReady()) {
      this._frame.state = "lobby-countdown";
      this._frame.breakTimer = this._LOBBY_COUNTDOWN_SECONDS;
      this._frame.timer = 0;
      this._pendingStartAction = "start-new"; // always new game from waiting
    }
  }
  private _abortLobbyCountdownIfNeeded(): void {
    if (this._frame.state === "lobby-countdown" && !this._everyoneReady()) {
      this._frame.state = "waiting";
      this._frame.breakTimer = 0;
      this._pendingStartAction = null;
    }
  }

  // Build a frame tailored to the recipient (mask digits if not their turn)
  private _buildFrameForUid(uid: string): RoomFrame {
    const basePlayers: Record<string, PlayerData> = {};
    for (const id of Object.keys(this._playerDataRecord)) {
      const v = this._playerDataRecord[id];
      if (v) basePlayers[id] = { ...v };
    }

    const isRunning = this._frame.state === "running";
    const isCurrent = isRunning && this._frame.currentPlayerId === uid;

    let questionToSend: Question | null;

    if (this._frame.state === "resolved") {
      questionToSend = this._frame.question
        ? { problem: [...this._frame.question.problem], target: this._frame.question.target }
        : { problem: [], target: 0 };
    } else if (isRunning) {
      if (isCurrent) {
        questionToSend = this._frame.question
          ? { problem: [...this._frame.question.problem], target: this._frame.question.target }
          : { problem: [], target: 0 };
      } else {
        questionToSend = { problem: [], target: 0 };
      }
    } else if (this._frame.state === "next-round-countdown" || this._frame.state === "lobby-countdown") {
      questionToSend = { problem: [], target: 0 };
    } else {
      questionToSend = { problem: [], target: 0 };
    }

    return {
      gameType: "classic",
      players: basePlayers,
      timer: this._frame.timer,
      breakTimer: this._frame.breakTimer,
      round: this._frame.round,
      winner: this._frame.winner ? { ...this._frame.winner } : null,
      state: this._frame.state,
      question: questionToSend,
      currentPlayerId: this._frame.currentPlayerId,
      turnBanner: this._frame.turnBanner,
      finalRanking: this._frame.finalRanking ? [...this._frame.finalRanking] : null,
    };
  }

  // ---------------- round & turn sequencing ----------------
  private _startNextRound(): void {
    this._frame.round += 1;
    if (this._frame.round > this._TOTAL_ROUNDS) {
      this.onMatchResolve();
      return;
    }

    // New puzzle
    this._digits = ArithmeticHelper.generateDigits(5)
    if (this._digits.length !== 5 || this._digits.some((d) => !Number.isInteger(d) || d < 1 || d > 9)) {
      this._digits = [1, 2, 3, 4, 5];
    }
    const made = ArithmeticHelper.makeReachableTargetUsingAllDigits(this._digits)
    this._target = made.target;
    this._debugSolutionNumbersExpr = made.numbersExpr;

    // LOG: generated puzzle + solution
    console.log(
      `[Game] Round ${this._frame.round} digits=[${this._digits.join(",")}] target=${this._target} solution=${this._debugSolutionNumbersExpr}`
    );

    const now = Date.now();
    this._roundStartMs = now;

    // Reset per-round trackers
    this._winnersThisRound.clear();
    this._solveTimeMsByUid = {};
    this._frame.winner = null;
    this._remainingRoundMs = null;

    // Reset statuses
    Object.values(this._playerDataRecord).forEach((d) => {
      if (d) d.roundStatus = "thinking";
    });

    // Build/keep fixed order (winner-first)
    const readyConnectedIds = Object.values(this._playerDataRecord)
      .filter((p): p is PlayerData => !!p && p.isReady && !p.isDisconnected)
      .map((p) => p.id);


    function shuffle(array: string[]) {
      let currentIndex = array.length;

      // While there remain elements to shuffle...
      while (currentIndex != 0) {

        // Pick a remaining element...
        let randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        //@ts-ignore
        [array[currentIndex], array[randomIndex]] = [
          array[randomIndex], array[currentIndex]];
      }
    }
    if (this._frame.round === 1 || !this._matchBaseOrder) {
      let base = readyConnectedIds.slice();
      if (this._lastGameWinnerId && base.includes(this._lastGameWinnerId)) {
        base = this._rotateToStart(base, this._lastGameWinnerId);
      }else{
        shuffle(base)
      }
      this._matchBaseOrder = base;
    }

    const base = this._matchBaseOrder ?? readyConnectedIds;

    this._turnOrder = base.filter((id) => {
      const p = this._playerDataRecord[id];
      return !!p && p.isReady && !p.isDisconnected;
    });

    // Store question; masking is applied when sending
    this._frame.question = { problem: this._digits, target: this._target };

    if (this._turnOrder.length === 0) {
      this._frame.state = "next-round-countdown";
      this._frame.breakTimer = this._BREAK_SECONDS;
      this._frame.timer = 0;
      this._frame.currentPlayerId = null;
      this._frame.turnBanner = `Round ${this._frame.round} waiting`;
      console.log(`[Game] Round ${this._frame.round} no players ready; solution=${this._debugSolutionNumbersExpr}`);
      return;
    }

    // Start the first player's turn
    this._currentTurnIndex = 0;
    this._startCurrentTurn();
    this._frame.state = "running";
  }

  private _startCurrentTurn(): void {
    const now = Date.now();

    const pidMaybe = this._turnOrder[this._currentTurnIndex];
    if (!pidMaybe) {
      this._finishRound();
      return;
    }
    const pid: string = pidMaybe;

    this._currentPlayerId = pid;
    this._frame.currentPlayerId = pid;

    const name = this._playerDataRecord[pid]?.displayName ?? "Player";
    this._frame.turnBanner = `${name}'s turn`;

    this._turnStartMs = now;
    this._turnEndMs = now + this._ROUND_SECONDS * 1000;
    this._frame.timer = this._ROUND_SECONDS;
    this._frame.breakTimer = 0;
  }

  private _endCurrentTurn(_reason: "timeout" | "correct" | "forfeit"): void {
    if (_reason === "correct") {
      const fives = Date.now() + 5 * 1000;
      if (this._turnEndMs > fives) {
        this._turnEndMs = fives;
      }
      return
    }
    this._advanceToNextTurnOrFinishRound();
  }

  private _advanceToNextTurnOrFinishRound(): void {
    this._currentTurnIndex += 1;
    if (this._currentTurnIndex >= this._turnOrder.length) {
      this._finishRound();
      return;
    }
    this._startCurrentTurn();
  }

  private _finishRound(): void {
    let winnerUid: string | null = null;
    let bestMs = Number.POSITIVE_INFINITY;
    for (const [uid, t] of Object.entries(this._solveTimeMsByUid)) {
      if (t < bestMs) {
        bestMs = t;
        winnerUid = uid;
      }
    }

    this._frame.winner = winnerUid ? (this._playerDataRecord[winnerUid] ?? null) : null;
    if (winnerUid) this._bumpScore(winnerUid, this._POINTS_WIN);

    // LOG: round winner
    console.log(
      `[Round ${this._frame.round}] winner=${winnerUid ?? "none"} bestMs=${Number.isFinite(bestMs) ? bestMs : "-"}`
    );

    // Prepare for the next round
    this._frame.state = "next-round-countdown";
    this._frame.breakTimer = this._BREAK_SECONDS;
    this._frame.timer = 0;

    // Clear current turn markers
    this._currentPlayerId = null;
    this._frame.currentPlayerId = null;
    this._frame.turnBanner = `Round ${this._frame.round} complete`;
  }

  private _resumeRound(): void {
    if (this._remainingRoundMs == null) return;
    this._turnEndMs = Date.now() + this._remainingRoundMs;
    this._remainingRoundMs = null;
    this._frame.state = "running";
  }

  // ---------------- helpers ----------------
  private _rotateToStart(arr: string[], firstId: string): string[] {
    const i = arr.indexOf(firstId);
    if (i <= 0) return arr.slice();
    return arr.slice(i).concat(arr.slice(0, i));
  }

  private _bumpScore(pid: string, add: number): void {
    const d = this._playerDataRecord[pid];
    if (!d) return;
    d.score = (typeof d.score === "number" ? d.score : 0) + add;
  }

  private _resetAllScores(): void {
    for (const key of Object.keys(this._playerDataRecord)) {
      const d = this._playerDataRecord[key];
      if (!d) continue;
      d.score = 0;
      d.isReady = false;
    }
  }
}
