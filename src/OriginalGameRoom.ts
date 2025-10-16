import { GameRoom, MatchPauseReason } from "@lib/GameRoom";
import { Player } from "@lib/player/Player";
import { PlayerActionType } from "@lib/player/PlayerActionType";
import {FramePayload, MsgPayload} from "@lib/Payload";
import {clearTimeout} from "node:timers";

type RoomState =
  | "waiting"
  | "lobby-countdown"   // NEW: pre-start countdown after everyone ready
  | "running"
  | "next-round-countdown"
  | "resolved";

type PlayerData = {
  isReady: boolean;
  roundStatus: "thinking" | "solved"
  isDisconnected: boolean;
  displayName: string;
  id: string;
  avatarUri?: string | undefined;
  score: number;
};

type Question = {
  problem: number[],
  target: number,
}

export type RoomFrame = {
  players: Record<string, PlayerData>;
  timer: number;
  breakTimer: number;
  round: number;
  winner: PlayerData | null;
  state: RoomState;
  question: Question | null;
};

export class OriginalGameRoom extends GameRoom {

  private _playerRecord: Record<string, Player> = {};
  private _playerDataRecord: Record<string, PlayerData> = {};
  private _frame: Omit<RoomFrame, "players"> = {
    timer: 60,
    breakTimer: 0,
    round: 0,
    winner: null,
    state: "waiting",
    question: null,
  };

  private readonly _TOTAL_ROUNDS = 3;
  private readonly _ROUND_SECONDS = 60;
  private readonly _BREAK_SECONDS = 6;
  private readonly _LOBBY_COUNTDOWN_SECONDS = 3; // NEW: lobby countdown length
  private readonly _POINTS_WIN = 1; // fastest correct only

  private _digits: number[] = [];
  private _target = 0;
  private _debugSolutionNumbersExpr = ""; // e.g., "4-4+8-2+6"
  private _roundEndMs = 0;
  private _roundStartMs = 0;
  private _winnersThisRound: Set<string> = new Set();
  private _solveTimeMsByUid: Record<string, number> = {};

  private _lastTickMs = 0;
  private _remainingRoundMs: number | null = null;

  // action to perform after lobby countdown finishes
  private _pendingStartAction: "resume" | "start-new" | null = null;

  private _roomDestroyTimeout: NodeJS.Timeout | null = null;

  // ---------------- lifecycle ----------------
  protected onRoomCreated(): void {}

  protected onGameStart(): void {
    if (this._frame.state === "resolved") {
      this._resetAllScores();
      this._frame.round = 0;
      this._frame.state = "running";
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
    // if (this._frame.state === "running") {
    //   const now = Date.now();
    //   this._remainingRoundMs = Math.max(0, this._roundEndMs - now);
    // }

    // Game should not pause tho

    if (reason.type === "p-dis") {
      // @ts-ignore
      this._playerDataRecord[player.getUid()].isDisconnected = true;

      const alive = Object.values(this._playerDataRecord).find((d) => !d.isDisconnected)
      if (!alive) {
        this._roomDestroyTimeout = setTimeout(() => {
          console.log("cleared")
          this.destroyRoom()
        }, 10*1000)
      }
    }
    // this._frame.state = "waiting";
  }

  protected onMatchResolve(): void {
    this._frame.state = "resolved";
    this._frame.question = null
    this._frame.timer = 0;
    this._frame.breakTimer = 0;
    this._digits = [];
    this._winnersThisRound.clear();
    this._solveTimeMsByUid = {};
    this._remainingRoundMs = null;
    this._pendingStartAction = null;
    this.destroyRoom()
  }

  // ---------------- players ----------------
  protected onPlayerJoin(player: Player): boolean {

    const uid = player.getUid();
    this._playerRecord[uid] = player;
    if (this._roomDestroyTimeout) {
      clearTimeout(this._roomDestroyTimeout)
    }

    if (uid in this._playerDataRecord) {
      // if already exist just use the same info
      // @ts-ignore
      this._playerDataRecord[uid].isDisconnected = false
      return true;
    }else{
      // prevent any mid-game join
      if (this._frame.state !== "waiting") {
        return false;
      }
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

    setTimeout(() => {
      if (uid in this._playerRecord) {
        return
      }

      // actually delete the player
      delete this._playerDataRecord[uid];
      this.getAllPlayers().forEach(player => {
        const data = this._playerDataRecord[player.getUid()]
        if (!data) {
          return
        }

        data.isReady = false;
      })
    }, 10 * 1000)

    this._abortLobbyCountdownIfNeeded();
  }

  // ---------------- ready helpers ----------------
  private _setReady(pid: string, val: boolean): void {
    const d = this._playerDataRecord[pid];
    if (d) d.isReady = val;
  }
  private _everyoneReady(): boolean {
    const arr = Object.values(this._playerDataRecord);
    return arr.length > 0 && arr.every((p) => p.isReady);
  }
  private _maybeStartIfAllReady(): void {
    if (this._frame.state !== "waiting") return;
    if (this._everyoneReady()) {
      // start a 3s lobby countdown; choose resume vs new-start after it finishes
      this._frame.state = "lobby-countdown";
      this._frame.breakTimer = this._LOBBY_COUNTDOWN_SECONDS;
      this._frame.timer = 0;
      this._pendingStartAction =
        this._remainingRoundMs != null && this._digits.length > 0 ? "resume" : "start-new";
    }
  }
  private _abortLobbyCountdownIfNeeded(): void {
    if (this._frame.state === "lobby-countdown" && !this._everyoneReady()) {
      this._frame.state = "waiting";
      this._frame.breakTimer = 0;
      this._pendingStartAction = null;
    }
  }

  // ---------------- actions ----------------
  protected onPlayerAction(player: Player, type: PlayerActionType, data: any): void {
    const pid = player.getUid();

    if (type === PlayerActionType.READY) {
      this._setReady(pid, data);

      // If someone cancelled during lobby countdown, abort it.
      this._abortLobbyCountdownIfNeeded();
      // If everyone is ready (and not already counting down/running), start lobby countdown.
      if (this._frame.state === "waiting") this._maybeStartIfAllReady();
      return;
    }

    if (type === PlayerActionType.SUBMIT) {
      if (this._frame.state !== "running") return;

      const replaced = data.replace(/×/g, "*").replace(/÷/g, "/")
      const s = this._extractNumbersExpression(replaced);
      console.log(s)
      if (!s) return; // only accept numbers-expr


      const parsed = this._parseExprStringNumbersStrict(s, this._digits.length);
      if (!parsed) return;
      console.log(parsed)
      const { nums, ops } = parsed;

      if (!this._sameMultiset(nums, this._digits)) return; // must use exactly the digits

      const val = this._evalNumbersWithConstraints(nums, ops);
      if (val == null) return;
      const correct = val === this._target;
      if (!correct) return;

      //correct
      // @ts-ignore
      this._playerDataRecord[pid].roundStatus = "solved"

      if (!this._winnersThisRound.has(pid)) {
        this._winnersThisRound.add(pid);
        const now = Date.now();
        const usedMs = Math.max(0, now - this._roundStartMs);
        if (this._solveTimeMsByUid[pid] == null) this._solveTimeMsByUid[pid] = usedMs;
      }

      if (this._allActiveSolved()) this._finishRound();
      return;
    }
  }

  private _extractNumbersExpression(data: any): string | null {
    // ONLY accept numbers expression
    const tryStrings = [data, data?.expr, data?.expression, data?.answer, data?.text];
    for (const s of tryStrings) {
      if (typeof s === "string") return s.trim();
    }
    return null;
  }

  // ---------------- tick ----------------
  protected onServerTick(): void {
    const now = Date.now();
    if (this._lastTickMs === 0) this._lastTickMs = now;
    const elapsedSec = (now - this._lastTickMs) / 1000;
    this._lastTickMs = now;

    if (this._frame.state === "running") {
      if (now >= this._roundEndMs) {
        this._finishRound();
      } else {
        const remain = Math.max(0, Math.ceil((this._roundEndMs - now) / 1000));
        this._frame.timer = remain;
      }
    } else if (this._frame.state === "lobby-countdown") {
      // NEW: pre-start countdown
      this._frame.breakTimer = Math.max(0, this._frame.breakTimer - elapsedSec);
      if (this._frame.breakTimer <= 0) {
        const action = this._pendingStartAction;
        this._pendingStartAction = null;
        if (this._everyoneReady()) {
          if (action === "resume") {
            this._resumeRound();
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
      // waiting/resolved
      this._frame.timer = this._frame.state === "resolved" ? 0 : this._frame.timer;
    }

    const playersCopy: Record<string, PlayerData> = {};
    for (const uid of Object.keys(this._playerDataRecord)) {
      const v = this._playerDataRecord[uid];
      if (!v) continue;
      playersCopy[uid] = { ...v };
    }
    const filled: RoomFrame = { ...this._frame, players: playersCopy };
    this.broadcastPayload(new FramePayload(filled))
  }

  protected getAllPlayers(): Player[] {
    return Object.values(this._playerRecord)
  }

  public getRoomData(): Record<string, any> {
    return {
      ...this._frame,
      players: this._playerDataRecord,
    }
  }

  // ---------------- rounds ----------------
  private _startNextRound(): void {
    this._frame.round += 1;
    if (this._frame.round > this._TOTAL_ROUNDS) {
      this.onMatchResolve();
      return;
    }

    this._digits = this._generateDigits(5);
    if (this._digits.length !== 5 || this._digits.some((d) => !Number.isInteger(d) || d < 1 || d > 9)) {
      this._digits = [1, 2, 3, 4, 5];
    }

    const made = this._makeReachableTargetUsingAllDigits(this._digits);
    this._target = made.target;
    this._debugSolutionNumbersExpr = made.numbersExpr; // show numbers-based solution

    const now = Date.now();
    this._roundStartMs = now;
    this._roundEndMs = now + this._ROUND_SECONDS * 1000;
    this._frame.timer = this._ROUND_SECONDS;
    this._frame.breakTimer = 0;

    this._winnersThisRound.clear();

    // reset
    Object.values(this._playerDataRecord).forEach((d) => {
      d.roundStatus = "thinking"
    })

    this._solveTimeMsByUid = {};
    this._frame.winner = null;
    this._remainingRoundMs = null;

    this._frame.question = {problem: this._digits, target: this._target}
    console.log(`Generated possible answer = ${made.numbersExpr}`)
    this._frame.state = "running";
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

    this._frame.state = "next-round-countdown";
    this._frame.breakTimer = this._BREAK_SECONDS;
    this._frame.timer = 0;

    this._roundEndMs = Date.now();
    this._remainingRoundMs = null;
  }

  private _allActiveSolved(): boolean {
    const activeIds = Object.values(this._playerDataRecord)
      .filter((p) => p && p.isReady)
      .map((p) => p.id);
    if (activeIds.length === 0) return false;
    return activeIds.every((pid) => this._winnersThisRound.has(pid));
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

  private _resumeRound(): void {
    if (this._remainingRoundMs == null) return;
    this._roundEndMs = Date.now() + this._remainingRoundMs;
    this._remainingRoundMs = null;
    this._frame.state = "running";
  }

  // ---------------- parsing & eval (numbers-only) ----------------
  private _parseExprStringNumbersStrict(expr: string, n: number): { nums: number[]; ops: string[] } | null {
    const s = expr.replace(/\s+/g, "").replace(/^=/, "");
    if (s.length === 0) return null;
    if (/[^0-9+\-*/]/.test(s)) return null;

    const tokens: string[] = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i]!;
      if (/[+\-*/]/.test(ch)) {
        tokens.push(ch);
        i++;
      } else {
        let j = i;
        while (j < s.length && /[0-9]/.test(s[j]!)) j++;
        tokens.push(s.slice(i, j));
        i = j;
      }
    }
    if (tokens.length !== 2 * n - 1) return null;

    const nums: number[] = [];
    const ops: string[] = [];
    for (let k = 0; k < tokens.length; k++) {
      const tk = tokens[k]!;
      if (k % 2 === 0) {
        if (!/^\d+$/.test(tk)) return null;
        const val = Number(tk);
        if (!Number.isInteger(val) || val < 1 || val > 9) return null;
        nums.push(val);
      } else {
        if (!/^[+\-*/]$/.test(tk)) return null;
        ops.push(tk);
      }
    }
    return { nums, ops };
  }

  private _sameMultiset(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    const count = new Map<number, number>();
    for (const x of b) count.set(x, (count.get(x) ?? 0) + 1);
    for (const x of a) {
      const c = count.get(x) ?? 0;
      if (c <= 0) return false;
      count.set(x, c - 1);
    }
    for (const v of count.values()) if (v !== 0) return false;
    return true;
  }

  private _evalNumbersWithConstraints(nums: number[], ops: string[]): number | null {
    if (nums.length === 0) return null;
    let acc = nums[0]!;
    if (!Number.isInteger(acc) || acc < 0) return null;

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i]!;
      const rhs = nums[i + 1]!;
      if (!Number.isInteger(rhs) || rhs < 0) return null;
      switch (op) {
        case "+":
          acc = acc + rhs;
          break;
        case "-":
          if (acc - rhs < 0) return null;
          acc = acc - rhs;
          break;
        case "*":
          acc = acc * rhs;
          break;
        case "/":
          if (rhs === 0) return null;
          if (acc % rhs !== 0) return null;
          acc = Math.trunc(acc / rhs);
          break;
        default:
          return null;
      }
      if (!Number.isInteger(acc) || acc < 0) return null;
    }
    return acc;
  }

  // ---------------- utils & generators ----------------
  private _generateDigits(n: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(1 + Math.floor(Math.random() * 9));
    return out;
  }

  private _randChoice<T>(arr: readonly T[]): T {
    const idx = Math.floor(Math.random() * arr.length);
    const v = arr[idx];
    if (v === undefined) {
      if (arr.length === 0) throw new Error("_randChoice: empty array");
      return arr[0] as T;
    }
    return v as T;
  }

  private _shuffleInPlace(a: number[]): void {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const ai = a[i]!;
      const aj = a[j]!;
      a[i] = aj;
      a[j] = ai;
    }
  }

  private _makeReachableTargetUsingAllDigits(digits: number[]): { target: number; numbersExpr: string } {
    const n = digits.length;
    const opsPool = ["+", "-", "*", "/"] as const;

    for (let attempt = 0; attempt < 1500; attempt++) {
      const order = [...Array(n).keys()];
      this._shuffleInPlace(order);

      const ops: string[] = [];
      for (let i = 0; i < n - 1; i++) ops.push(this._randChoice(opsPool) as string);

      const nums: number[] = order.map((idx) => digits[idx]!);
      const val = this._evalNumbersWithConstraints(nums, ops);
      if (val != null && val <= 99) {
        let expr = String(nums[0]);
        for (let i = 0; i < ops.length; i++) expr += ops[i]! + String(nums[i + 1]!);
        return { target: val, numbersExpr: expr };
      }
    }

    const target = digits.reduce((a, b) => a + b, 0);
    const expr = digits.join("+");
    return { target, numbersExpr: expr };
  }
}
