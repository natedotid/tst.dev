import { describe, expect, it } from "vitest";
import { explainDmarc, parseDmarc } from "./dmarc";

describe("parseDmarc", () => {
  it("parses a full record", () => {
    const r = parseDmarc(
      "v=DMARC1; p=reject; rua=mailto:dmarc@example.com; pct=100; sp=none; adkim=r; aspf=r",
    );
    expect(r.version).toBe("DMARC1");
    expect(r.policy).toBe("reject");
    expect(r.subdomainPolicy).toBe("none");
    expect(r.pct).toBe(100);
    expect(r.tags.rua).toBe("mailto:dmarc@example.com");
    expect(r.tags.adkim).toBe("r");
    expect(r.unknownTags).toEqual([]);
    expect(r.error).toBeNull();
  });

  it("allows multiple mailto addresses in one rua value", () => {
    const r = parseDmarc("v=DMARC1; p=none; rua=mailto:a@example.com,mailto:b@example.com");
    expect(r.tags.rua).toBe("mailto:a@example.com,mailto:b@example.com");
    expect(r.unknownTags).toEqual([]);
  });

  it("defaults pct to 100 when the tag is absent", () => {
    expect(parseDmarc("v=DMARC1; p=none").pct).toBe(100);
  });

  it("parses sp and a partial pct", () => {
    const r = parseDmarc("v=DMARC1; p=quarantine; sp=reject; pct=50");
    expect(r.policy).toBe("quarantine");
    expect(r.subdomainPolicy).toBe("reject");
    expect(r.pct).toBe(50);
  });

  it("rejects an invalid pct value", () => {
    const r = parseDmarc("v=DMARC1; p=reject; pct=banana");
    expect(r.pct).toBeNull();
    expect(r.error).toBeNull();
  });

  it("rejects a pct above 100", () => {
    expect(parseDmarc("v=DMARC1; p=reject; pct=150").pct).toBeNull();
  });

  it("requires the v=DMARC1 version tag first", () => {
    expect(parseDmarc("p=reject").error).toMatch(/version tag/);
    expect(parseDmarc("v=DMARC2; p=reject").error).toMatch(/version tag/);
    expect(parseDmarc("p=reject; v=DMARC1").error).toMatch(/version tag/);
  });

  it("requires a valid p tag", () => {
    expect(parseDmarc("v=DMARC1").error).toMatch(/p tag/);
    expect(parseDmarc("v=DMARC1; p=maybe").error).toMatch(/Invalid p value/);
  });

  it("flags unrecognized tags instead of failing", () => {
    const r = parseDmarc("v=DMARC1; p=none; foobar=1");
    expect(r.unknownTags).toEqual(["foobar"]);
    expect(r.error).toBeNull();
  });

  it("rejects an empty record", () => {
    expect(parseDmarc("   ").error).toBe("Empty record");
  });

  it("tolerates extra whitespace around semicolons and equals", () => {
    const r = parseDmarc("  v=DMARC1 ;  p = reject ; sp = none  ");
    expect(r.error).toBeNull();
    expect(r.policy).toBe("reject");
    expect(r.subdomainPolicy).toBe("none");
  });

  it("does not truncate tag values spanning pasted line breaks", () => {
    const r = parseDmarc("v=DMARC1; p=reject; rua=mailto:a@example.com\nmailto:b@example.com");
    expect(r.error).toBeNull();
    expect(r.tags.rua).toBe("mailto:a@example.com\nmailto:b@example.com");
  });
});

describe("explainDmarc", () => {
  it("explains a reject policy", () => {
    const lines = explainDmarc("v=DMARC1; p=reject");
    expect(lines.some((l) => l.includes("rejected"))).toBe(true);
  });

  it("describes none as monitor-only", () => {
    const lines = explainDmarc("v=DMARC1; p=none");
    expect(lines.some((l) => l.toLowerCase().includes("monitor"))).toBe(true);
  });

  it("mentions rua destinations and partial pct", () => {
    const lines = explainDmarc("v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com; pct=25");
    expect(lines.some((l) => l.includes("dmarc@example.com"))).toBe(true);
    expect(lines.some((l) => l.includes("25%"))).toBe(true);
  });

  it("describes subdomain policy differences", () => {
    const lines = explainDmarc("v=DMARC1; p=none; sp=reject");
    expect(lines.some((l) => l.includes("different policy"))).toBe(true);
  });

  it("explains alignment tags", () => {
    const lines = explainDmarc("v=DMARC1; p=reject; adkim=r; aspf=s");
    expect(lines.some((l) => l.includes("relaxed alignment"))).toBe(true);
    expect(lines.some((l) => l.includes("strict alignment"))).toBe(true);
  });

  it("returns the parse error for invalid records", () => {
    const lines = explainDmarc("nope");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/version tag/);
  });
});
