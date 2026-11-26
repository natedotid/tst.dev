import { describe, expect, it } from "vitest";
import { countSpfLookups, explainSpf, parseSpf } from "./spf";

describe("parseSpf", () => {
  it("parses a typical delegated record", () => {
    const r = parseSpf("v=spf1 include:_spf.google.com -all");
    expect(r.version).toBe("spf1");
    expect(r.error).toBeNull();
    expect(r.mechanisms).toEqual([
      { type: "include", qualifier: "+", value: "_spf.google.com" },
      { type: "all", qualifier: "-", value: "" },
    ]);
    expect(r.all).toBe("-");
    expect(r.unknownTokens).toEqual([]);
  });

  it("defaults the qualifier to +", () => {
    const r = parseSpf("v=spf1 mx all");
    expect(r.mechanisms.map((m) => m.qualifier)).toEqual(["+", "+"]);
  });

  it("recognizes all four qualifiers", () => {
    const r = parseSpf("v=spf1 +a -mx ~ip4:1.2.3.0/24 ?ptr");
    expect(r.mechanisms.map((m) => m.qualifier)).toEqual(["+", "-", "~", "?"]);
    expect(r.mechanisms.map((m) => m.type)).toEqual(["a", "mx", "ip4", "ptr"]);
  });

  it("captures ip4/ip6 CIDR arguments", () => {
    const r = parseSpf("v=spf1 ip4:203.0.113.0/24 ip6:2001:db8::/32 -all");
    expect(r.mechanisms[0].value).toBe("203.0.113.0/24");
    expect(r.mechanisms[1].value).toBe("2001:db8::/32");
  });

  it("accepts the optional domain argument on a/mx/ptr", () => {
    const r = parseSpf("v=spf1 a:mail.example.com mx:example.net ptr -all");
    expect(r.mechanisms.map((m) => m.type)).toEqual(["a", "mx", "ptr", "all"]);
    expect(r.mechanisms[0].value).toBe("mail.example.com");
    expect(r.unknownTokens).toEqual([]);
  });

  it("accepts the pre-RFC exist alias", () => {
    const r = parseSpf("v=spf1 exist:%{i}.example.com -all");
    expect(r.mechanisms[0].type).toBe("exist");
    expect(r.unknownTokens).toEqual([]);
  });

  it("collects modifiers (exp, redirect, reroot)", () => {
    const r = parseSpf("v=spf1 mx -all exp=exp.example.com reroot=example.net");
    expect(r.modifiers).toEqual({ exp: "exp.example.com", reroot: "example.net" });
    const r2 = parseSpf("v=spf1 redirect=other.example");
    expect(r2.modifiers).toEqual({ redirect: "other.example" });
    expect(r2.mechanisms).toEqual([]);
  });

  it("flags unrecognized tokens instead of failing", () => {
    const r = parseSpf("v=spf1 foobar ip4 -all");
    expect(r.unknownTokens).toEqual(["foobar", "ip4"]); // ip4 without its CIDR
    expect(r.all).toBe("-");
  });

  it("requires the v=spf1 version tag first", () => {
    expect(parseSpf("include:foo.com -all").error).toMatch(/version tag/);
    expect(parseSpf("v=spf2 -all").error).toMatch(/version tag/);
    expect(parseSpf("V=SPF1 -all").error).toMatch(/version tag/);
  });

  it("rejects an empty record", () => {
    expect(parseSpf("   ").error).toBe("Empty record");
  });

  it("tolerates extra whitespace and CRLF remnants", () => {
    const r = parseSpf("  v=spf1\tip4:192.0.2.1\r\n -all  ");
    expect(r.error).toBeNull();
    expect(r.mechanisms).toHaveLength(2);
  });
});

describe("countSpfLookups", () => {
  it("counts a/mx/include/exists mechanisms", () => {
    const record = "v=spf1 include:_spf.google.com include:_spf.salesforce.com a mx exists:relay.example.com -all";
    expect(countSpfLookups(record).staticLookups).toBe(5);
  });

  it("does not count ip4/ip6/all", () => {
    const record = "v=spf1 ip4:192.0.2.1 ip6:2001:db8::/32 -all";
    expect(countSpfLookups(record).staticLookups).toBe(0);
  });

  it("flags records above the 10-lookup limit", () => {
    const over = "v=spf1 " + "a mx ".repeat(6) + "-all"; // 12 lookups
    expect(countSpfLookups(over).staticLookups).toBe(12);
    expect(countSpfLookups(over).wouldExceed).toBe(true);

    const under = "v=spf1 " + "a mx ".repeat(4) + "-all"; // 8 lookups
    expect(countSpfLookups(under).wouldExceed).toBe(false);
  });
});

describe("explainSpf", () => {
  it("explains a -all ending as recommended", () => {
    const lines = explainSpf("v=spf1 include:_spf.google.com -all");
    expect(lines.some((l) => l.includes("explicitly rejected"))).toBe(true);
    expect(lines.some((l) => l.includes("_spf.google.com"))).toBe(true);
  });

  it("warns about +all as an open relay", () => {
    const lines = explainSpf("v=spf1 +all");
    expect(lines.some((l) => l.toLowerCase().includes("open relay"))).toBe(true);
  });

  it("notes a missing all mechanism as implicitly open", () => {
    const lines = explainSpf("v=spf1 ip4:192.0.2.1");
    expect(lines.some((l) => l.includes("implicitly neutral"))).toBe(true);
  });

  it("explains exp and redirect modifiers", () => {
    const lines = explainSpf("v=spf1 -all exp=exp.example.com");
    expect(lines.some((l) => l.includes("exp.example.com"))).toBe(true);
  });

  it("returns the parse error for invalid records", () => {
    const lines = explainSpf("nope");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/version tag/);
  });
});
