export class ArithmeticHelper {
  public static parseAndEvalWithParentheses(expr: string, expectedCount: number): { val: number; nums: number[] } | null {
    const s = expr.replace(/\s+/g, "").replace(/^=/, "");
    if (s.length === 0) return null;
    if (/[^0-9+\-*/()]/.test(s)) return null;     // only allowed chars
    if (/\d{2,}/.test(s)) return null;            // disallow multi-digit numbers

    let i = 0;
    const numsUsed: number[] = [];

    const parseExpr = (): number | null => {
      let v = parseTerm();
      if (v == null) return null;
      while (i < s.length && (s[i] === "+" || s[i] === "-")) {
        const op = s[i++]!;
        const r = parseTerm();
        if (r == null) return null;
        if (op === "+") v = v + r;
        else {
          if (v - r < 0) return null;
          v = v - r;
        }
        if (!Number.isInteger(v) || v < 0) return null;
      }
      return v;
    };

    const parseTerm = (): number | null => {
      let v = parseFactor();
      if (v == null) return null;
      while (i < s.length && (s[i] === "*" || s[i] === "/")) {
        const op = s[i++]!;
        const r = parseFactor();
        if (r == null) return null;
        if (op === "*") {
          v = v * r;
        } else {
          if (r === 0) return null;
          if (v % r !== 0) return null; // exact division only
          v = Math.trunc(v / r);
        }
        if (!Number.isInteger(v) || v < 0) return null;
      }
      return v;
    };

    const parseFactor = (): number | null => {
      if (i >= s.length) return null;
      const ch = s[i]!;
      if (ch === "(") {
        i++;
        const v = parseExpr();
        if (v == null) return null;
        if (i >= s.length || s[i] !== ")") return null;
        i++;
        return v;
      } else if (/[0-9]/.test(ch)) {
        const val = Number(ch);
        if (val < 1 || val > 9) return null;
        numsUsed.push(val);
        i++;
        return val;
      } else {
        return null;
      }
    };

    const val = parseExpr();
    if (val == null) return null;
    if (i !== s.length) return null; // leftover tokens
    if (numsUsed.length !== expectedCount) return null;

    return { val, nums: numsUsed };
  }


  public static generateDigits(n: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(1 + Math.floor(Math.random() * 9));
    return out;
  }

  public static isSameMultiset(a: number[], b: number[]): boolean {
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

  private static _randChoice<T>(arr: readonly T[]): T {
    const idx = Math.floor(Math.random() * arr.length);
    const v = arr[idx];
    if (v === undefined) {
      if (arr.length === 0) throw new Error("_randChoice: empty array");
      return arr[0] as T;
    }
    return v as T;
  }

  private static _shuffleInPlace(a: any[]): void {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const ai = a[i]!;
      const aj = a[j]!;
      a[i] = aj;
      a[j] = ai;
    }
  }

  public static makeReachableTargetUsingAllDigits(digits: number[]): { target: number; numbersExpr: string } {
    const n = digits.length;
    const opsPool = ["+", "-", "*", "/"] as const;

    for (let attempt = 0; attempt < 1500; attempt++) {
      const shuffled = [...digits]
      this._shuffleInPlace(shuffled);

      const ops: string[] = [];
      for (let i = 0; i < n - 1; i++) {
        ops.push(this._randChoice(opsPool) as string);
      }

      const answerStr = shuffled.map((s, i) => {
        const op=ops[i]
        return s + (op ?? "");
      }).join("")

      const r = this.parseAndEvalWithParentheses(answerStr,5)
      const val = r?.val
      if (val && val <= 99) {
        return { target: val, numbersExpr: answerStr };
      }
    }

    const target = digits.reduce((a, b) => a + b, 0);
    const expr = digits.join("+");
    return { target, numbersExpr: expr };
  }

  // // kept for generator; not used for submissions anymore
  // private static _evalNumbersWithConstraints(nums: number[], ops: string[]): number | null {
  //   if (nums.length === 0) return null;
  //   let acc = nums[0]!;
  //   if (!Number.isInteger(acc) || acc < 0) return null;
  //
  //   for (let i = 0; i < ops.length; i++) {
  //     const op = ops[i]!;
  //     const rhs = nums[i + 1]!;
  //     if (!Number.isInteger(rhs) || rhs < 0) return null;
  //     switch (op) {
  //       case "+": acc = acc + rhs; break;
  //       case "-": if (acc - rhs < 0) return null; acc = acc - rhs; break;
  //       case "*": acc = acc * rhs; break;
  //       case "/": if (rhs === 0) return null; if (acc % rhs !== 0) return null; acc = Math.trunc(acc / rhs); break;
  //       default: return null;
  //     }
  //     if (!Number.isInteger(acc) || acc < 0) return null;
  //   }
  //   return acc;
  // }
}