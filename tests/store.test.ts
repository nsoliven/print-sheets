import { describe, expect, it } from "vitest";
import { createDocStore, EMPTY_DOC } from "../src/lib/store";

describe("undo history", () => {
  it("undoes and redoes", () => {
    const s = createDocStore(EMPTY_DOC);
    s.commit("frame", (d) => ({ ...d, frame: "black" }));
    s.commit("cut", (d) => ({ ...d, cutLines: false }));
    s.undo();
    expect(s.get().doc.cutLines).toBe(true);
    s.undo();
    expect(s.get().doc.frame).toBe("white");
    s.redo();
    expect(s.get().doc.frame).toBe("black");
  });

  it("records a whole drag as one step", () => {
    const s = createDocStore(EMPTY_DOC);
    s.begin();
    s.live((d) => ({ ...d, frame: "cream" }));
    s.live((d) => ({ ...d, frame: "black" }));
    s.end("drag");
    expect(s.get().past.length).toBe(1);
    s.undo();
    expect(s.get().doc.frame).toBe("white");
  });

  it("merges quick typing into one step", () => {
    const s = createDocStore(EMPTY_DOC);
    s.commit("type", (d) => ({ ...d, format: "wallet" }), "k");
    s.commit("type", (d) => ({ ...d, format: "polaroid" }), "k");
    expect(s.get().past.length).toBe(1);
  });

  it("an empty gesture adds nothing", () => {
    const s = createDocStore(EMPTY_DOC);
    s.begin();
    s.end("nothing");
    expect(s.get().past.length).toBe(0);
  });
});
