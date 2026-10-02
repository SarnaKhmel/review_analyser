import { describe, expect, it } from "vitest";
import { extractAppId } from "../src/sources/extractAppId";

describe("extractAppId", () => {
  it("reads the id parameter from a Google Play link", () => {
    expect(extractAppId("https://play.google.com/store/apps/details?id=com.spotify.music&hl=uk")).toBe(
      "com.spotify.music",
    );
  });

  it("accepts a link without a scheme", () => {
    expect(extractAppId("play.google.com/store/apps/details?id=org.telegram.messenger")).toBe(
      "org.telegram.messenger",
    );
  });

  it("returns a bare appId as is", () => {
    expect(extractAppId("  com.example.app_one  ")).toBe("com.example.app_one");
  });

  it("rejects other hosts, missing ids and garbage", () => {
    expect(() => extractAppId("https://apps.apple.com/app/id123")).toThrow();
    expect(() => extractAppId("https://play.google.com/store/apps")).toThrow();
    expect(() => extractAppId("spotify")).toThrow();
  });
});
