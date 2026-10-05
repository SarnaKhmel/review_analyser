import { describe, expect, it } from "vitest";
import { extractLocale } from "../src/sources/extractLocale";

describe("extractLocale", () => {
  it("reads hl and gl from a link", () => {
    expect(extractLocale("https://play.google.com/store/apps/details?id=com.a.b&hl=uk&gl=UA")).toEqual({
      lang: "uk",
      country: "ua",
    });
  });

  it("keeps only the language part of a regional hl", () => {
    expect(extractLocale("play.google.com/store/apps/details?id=com.a.b&hl=en_US").lang).toBe("en");
    expect(extractLocale("play.google.com/store/apps/details?id=com.a.b&hl=pt-BR").lang).toBe("pt");
  });

  it("returns nothing for a bare appId, missing or malformed parameters", () => {
    expect(extractLocale("com.spotify.music")).toEqual({ lang: undefined, country: undefined });
    expect(extractLocale("https://play.google.com/store/apps/details?id=com.a.b&hl=zzz&gl=1")).toEqual({
      lang: undefined,
      country: undefined,
    });
  });
});
