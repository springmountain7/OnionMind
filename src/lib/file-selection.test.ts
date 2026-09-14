import { describe, expect, it } from "vitest";
import { availableImageSlots, mergeSelectedFiles } from "./file-selection";

function image(name: string, lastModified: number) {
  return new File([name], name, { type: "image/jpeg", lastModified });
}

describe("mobile image selection", () => {
  it("accumulates one image selected at a time up to the note limit", () => {
    const first = mergeSelectedFiles([], [image("one.jpg", 1)], 3);
    const second = mergeSelectedFiles(first, [image("two.jpg", 2)], 3);
    const third = mergeSelectedFiles(second, [image("three.jpg", 3)], 3);
    const overflow = mergeSelectedFiles(third, [image("four.jpg", 4)], 3);

    expect(third.map((file) => file.name)).toEqual(["one.jpg", "two.jpg", "three.jpg"]);
    expect(overflow.map((file) => file.name)).toEqual(["one.jpg", "two.jpg", "three.jpg"]);
  });

  it("does not add the same mobile selection twice", () => {
    const selected = image("one.jpg", 1);
    expect(mergeSelectedFiles([selected], [selected], 3)).toEqual([selected]);
  });

  it("releases an existing image slot as soon as it is marked for removal", () => {
    const existing = ["one", "two", "three"];
    expect(availableImageSlots(existing, [])).toBe(0);
    expect(availableImageSlots(existing, ["two"])).toBe(1);
  });
});
