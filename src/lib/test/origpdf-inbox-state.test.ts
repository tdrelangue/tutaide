import { describe, expect, it } from "vitest";
import { filedInboxEntries } from "../origpdf-inbox-state";

const pdf = (name: string) => new File(["%PDF-1.7"], name, { type: "application/pdf" });

describe("filedInboxEntries", () => {
  it("removes only inbox files that were filed", () => {
    const a = pdf("a.pdf");
    const b = pdf("b.pdf");
    const dropped = pdf("dropped.pdf");
    const inFlight = new Map([[a, "1-a"], [b, "2-b"]]);

    const result = filedInboxEntries(inFlight, [a, b, dropped], [b]);

    expect(result.ids).toEqual(["1-a"]);
    expect([...result.inFlight.values()]).toEqual(["2-b"]);
    expect(inFlight.size).toBe(2);
  });

  it("removes an ASH file filed by hand after the automatic pass missed it", () => {
    const missed = pdf("courrier.pdf");
    const afterAuto = filedInboxEntries(new Map([[missed, "1-a"]]), [missed], [missed]);
    expect(afterAuto.ids).toEqual([]);

    const afterManual = filedInboxEntries(afterAuto.inFlight, [missed], []);
    expect(afterManual.ids).toEqual(["1-a"]);
    expect(afterManual.inFlight.size).toBe(0);
  });

  it("removes an entry once even when it was read twice", () => {
    const first = pdf("a.pdf");
    const again = pdf("a.pdf");
    const result = filedInboxEntries(new Map([[first, "1-a"], [again, "1-a"]]), [first, again], []);
    expect(result.ids).toEqual(["1-a"]);
  });
});
