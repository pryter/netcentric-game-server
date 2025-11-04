import test, { describe } from "node:test";
import {equal} from "node:assert";

function parse(expr: string): number | null {
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
  return val
}

describe("point tests", () => {

  const testFn = parse
  test("basic_test_1", () => {
    equal(testFn("(1+2)+3+4+5"), 15);            // digits: 1,2,3,4,5
    equal(testFn("1+(2+3+4+5)"), 15);            // digits: 1,2,3,4,5
    equal(testFn("(1+2)*(3+4)+5"), 26);          // digits: 1,2,3,4,5
  });

  test("basic_test_2", () => {
    equal(testFn("1+2*(3+4+5)"), 25);            // digits: 1,2,3,4,5
    equal(testFn("(9-4)*(3+2)"), 25);            // digits: 9,4,3,2
    equal(testFn("8/(4-2)+6+1"), 11);            // digits: 8,4,2,6,1
  });

  test("basic_test_3", () => {
    equal(testFn("(7+3)/(5-3)+4"), 9);           // digits: 7,3,5,3,4
    equal(testFn("(6*3)-(8/4)+2"), 18);          // digits: 6,3,8,4,2
    equal(testFn("9-(3*(2+1))+4"), 4);           // digits: 9,3,2,1,4
  });

  test("basic_test_4", () => {
    equal(testFn("(5+5+5+5)/5"), 4);             // digits: 5,5,5,5,5
    equal(testFn("4*(3+(2-1))"), 16);            // digits: 4,3,2,1
    equal(testFn("(2+3)*(4+5) + 6"),  (5)*(9)+6); // 51
  });


  test("edge_test_1_nested", () => {
    equal(testFn("1+(2*(3+(4*5)))"), 47);        // 1,2,3,4,5
    equal(testFn("((1*2)+3)*(4+5)"), 45);        // 1,2,3,4,5
    equal(testFn("(9-(4+(2-1)))"), 4);           // 9,4,2,1
  });

  test("edge_test_2_layers", () => {
    equal(testFn("((1+3)*(2+4))+5"), 29);        // 1,3,2,4,5
    equal(testFn("(8+1)*(7-6)+3"), 12);          // 8,1,7,6,3
  });

  test("edge_test_3_zeros", () => {
    equal(testFn("0*(4+5)+6+6"), 12);               // 0,4,5,6
    equal(testFn("0*(4+5)+6*6"), 36);               // 0,4,5,6
  });

})
