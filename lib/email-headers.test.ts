import { describe, expect, it } from "vitest";
import {
  domainsMatch,
  extractAddressDomain,
  getHeaderValues,
  parseAuthenticationResults,
  parseReceivedChain,
  summarizeEmail,
  unfoldHeaders,
  verdictOf,
} from "./email-headers";

/* A realistic Gmail-style header block (folded Received lines, CRLF in one
   test below). Newest hop first. */
const FIXTURE = [
  "Received: by 10.154.152.138 with HTTP; Thu, 18 Oct 2026 09:12:33 -0700 (PDT)",
  "Received: from mail-ed1-f45.google.com (mail-ed1-f45.google.com [209.85.221.45])",
  "\tby mx.example.com with ESMTPS id ABC for <dev@example.com>;",
  "\tThu, 18 Oct 2026 09:12:31 -0700 (PDT)",
  "Received: from mailout.sender.example.com (mailout.sender.example.com [203.0.113.10])",
  "\tby mail-ed1-f45.google.com with ESMTPS id XYZ for <dev@example.com>;",
  "\tThu, 18 Oct 2026 09:12:01 -0700 (PDT)",
  "Authentication-Results: mx.example.com;",
  "\tspf=pass smtp.mailfrom=sender.example.com;",
  "\tdkim=pass header.s=selector1 header.d=sender.example.com;",
  "\tdmarc=pass header.from=sender.example.com",
  "DKIM-Signature: v=1; a=rsa-sha256; c=simple/simple; d=sender.example.com;",
  " s=selector1; h=from:to:subject; bh=abc123;",
  " b=QmFzZTY0U2lnbmF0dXJlRmFrbQ==",
  "From: Sender Name <sender@sender.example.com>",
  "To: Dev <dev@example.com>",
  "Subject: A folded subject line",
  "",
  "This is the body and must never be parsed as a header.",
].join("\n");

describe("unfoldHeaders", () => {
  it("unfolds continuation lines, keeping their leading whitespace", () => {
    const hs = unfoldHeaders(FIXTURE);
    const received = hs.filter((h) => h.name === "Received");
    expect(received).toHaveLength(3);
    expect(received[1].value).toBe(
      "from mail-ed1-f45.google.com (mail-ed1-f45.google.com [209.85.221.45])\tby mx.example.com with ESMTPS id ABC for <dev@example.com>;\tThu, 18 Oct 2026 09:12:31 -0700 (PDT)",
    );
  });

  it("stops at the first blank line and never parses the body", () => {
    const hs = unfoldHeaders(FIXTURE);
    expect(hs.some((h) => h.value.includes("body"))).toBe(false);
    expect(hs.map((h) => h.name)).toContain("Subject");
  });

  it("handles CRLF input identically to LF", () => {
    const crlf = FIXTURE.replace(/\n/g, "\r\n");
    expect(unfoldHeaders(crlf)).toEqual(unfoldHeaders(FIXTURE));
  });

  it("preserves repeated names in order and ignores names case-sensitively", () => {
    const hs = unfoldHeaders("X-A: 1\r\nX-a: 2\nX-A: 3\n");
    expect(hs.map((h) => h.value)).toEqual(["1", "2", "3"]);
  });

  it("stops at a non-continuation line without a colon", () => {
    const hs = unfoldHeaders("A: 1\ngarbage line without colon\nB: 2\n");
    expect(hs.map((h) => h.name)).toEqual(["A"]);
  });

  it("ignores an orphan continuation before any header", () => {
    const hs = unfoldHeaders("  orphan\nA: 1\n");
    expect(hs).toEqual([{ name: "A", value: "1" }]);
  });
});

describe("getHeaderValues / extractAddressDomain", () => {
  const hs = unfoldHeaders(FIXTURE);
  it("matches names case-insensitively and preserves order", () => {
    expect(getHeaderValues(hs, "received")).toHaveLength(3);
    expect(getHeaderValues(hs, "X-None")).toEqual([]);
  });

  it("extracts domains from From/To shapes", () => {
    expect(extractAddressDomain("Sender Name <sender@sender.example.com>")).toBe("sender.example.com");
    expect(extractAddressDomain("dev@example.com")).toBe("example.com");
    expect(extractAddressDomain("Sender Name (no address)")).toBeUndefined();
    expect(extractAddressDomain(undefined)).toBeUndefined();
  });
});

describe("parseReceivedChain", () => {
  it("computes per-hop delays (newest-first) and the total", () => {
    const { hops, totalMs } = parseReceivedChain(getHeaderValues(unfoldHeaders(FIXTURE), "Received"));
    expect(hops).toHaveLength(3);
    // 09:12:33 → 09:12:31 → 09:12:01
    expect(hops[0].delayMs).toBe(2000);
    expect(hops[1].delayMs).toBe(30000);
    expect(hops[2].delayMs).toBeNull();
    expect(totalMs).toBe(32000);
  });

  it("parses from/ip/to/via and tolerates a missing from part", () => {
    const { hops } = parseReceivedChain(getHeaderValues(unfoldHeaders(FIXTURE), "Received"));
    expect(hops[0]).toMatchObject({ from: "(unparseable)", to: "10.154.152.138", via: "HTTP" });
    expect(hops[1]).toMatchObject({
      from: "mail-ed1-f45.google.com",
      ip: "209.85.221.45",
      to: "mx.example.com",
      via: "ESMTPS",
    });
  });

  it("keeps a hop with an unparseable date and nulls its delay", () => {
    const { hops, totalMs } = parseReceivedChain([
      "from a (a [1.1.1.1]) by b with ESMTP; not a date at all",
      "from c (c [2.2.2.2]) by d with ESMTP; Thu, 18 Oct 2026 09:00:00 -0700",
    ]);
    expect(hops[0].delayMs).toBeNull();
    expect(hops[0].date).toBeUndefined();
    expect(hops[1].delayMs).toBeNull();
    expect(totalMs).toBeNull();
  });

  it("handles an empty chain", () => {
    expect(parseReceivedChain([])).toEqual({ hops: [], totalMs: null });
  });
});

describe("parseAuthenticationResults", () => {
  it("parses the pass fixture (spf/dkim/dmarc + evaluating server)", () => {
    const auth = parseAuthenticationResults(unfoldHeaders(FIXTURE));
    expect(auth.evaluatingServers).toEqual(["mx.example.com"]);
    expect(auth.spf).toEqual({
      result: "pass",
      domain: "sender.example.com",
      hostname: undefined,
      reason: undefined,
    });
    expect(auth.dkim).toEqual([{ result: "pass", selector: "selector1", domain: "sender.example.com" }]);
    expect(auth.dmarc).toEqual({ result: "pass", domain: "sender.example.com" });
    expect(auth.dkimSignaturePresent).toBe(true);
    expect(auth.raw).toHaveLength(1);
  });

  it("collects multiple dkim results", () => {
    const hs = unfoldHeaders(
      "Authentication-Results: x; spf=pass smtp.mailfrom=a.com; dkim=pass header.s=s1 header.d=a.com; dkim=fail header.s=s2 header.d=b.com",
    );
    const auth = parseAuthenticationResults(hs);
    expect(auth.dkim).toHaveLength(2);
    expect(auth.dkim[1]).toEqual({ result: "fail", selector: "s2", domain: "b.com" });
  });

  it("reports nothing when there are no AR headers", () => {
    const auth = parseAuthenticationResults(unfoldHeaders("Subject: hi\n"));
    expect(auth.spf).toBeUndefined();
    expect(auth.dkim).toEqual([]);
    expect(auth.dkimSignaturePresent).toBe(false);
    expect(auth.evaluatingServers).toEqual([]);
  });

  it("flags a DKIM-Signature header without any AR verdict", () => {
    const auth = parseAuthenticationResults(unfoldHeaders("DKIM-Signature: v=1; d=a.com\n"));
    expect(auth.dkim).toEqual([]);
    expect(auth.dkimSignaturePresent).toBe(true);
  });
});

describe("verdictOf", () => {
  it("maps known outcomes and falls back sensibly", () => {
    expect(verdictOf("pass")).toBe("pass");
    expect(verdictOf("SOFTFAIL")).toBe("softfail");
    expect(verdictOf("weird")).toBe("unknown");
    expect(verdictOf(undefined)).toBe("absent");
  });
});

describe("summarizeEmail", () => {
  it("flags nothing for a fully authenticated message", () => {
    const s = summarizeEmail(unfoldHeaders(FIXTURE));
    expect(s.auth).toMatchObject({ spf: "pass", dmarc: "pass" });
    expect(s.auth.dkim).toEqual([{ verdict: "pass", selector: "selector1", domain: "sender.example.com" }]);
    expect(s.auth.dkimSignatureOnly).toBe(false);
    expect(s.fromDomain).toBe("sender.example.com");
    expect(s.totalMs).toBe(32000);
    expect(s.flags).toEqual([]);
  });

  it("flags SPF softfail and a non-passing DKIM", () => {
    const s = summarizeEmail(
      unfoldHeaders(
        "From: x <x@evil.example.net>\n" +
          "Authentication-Results: mx; spf=softfail smtp.mailfrom=evil.example.net; dkim=none header.d=none\n",
      ),
    );
    expect(s.auth.spf).toBe("softfail");
    expect(s.flags.join(" ")).toMatch(/SPF softfail/);
    expect(s.flags.join(" ")).toMatch(/DKIM none/);
    expect(s.flags.join(" ")).toMatch(/No DMARC result/);
  });

  it("flags unrecognized SPF and DMARC outcomes", () => {
    const s = summarizeEmail(
      unfoldHeaders(
        "From: x <x@example.com>\n" +
          "Authentication-Results: mx; spf=passs smtp.mailfrom=example.com; dmarc=passs header.from=example.com\n",
      ),
    );
    expect(s.auth.spf).toBe("unknown");
    expect(s.auth.dmarc).toBe("unknown");
    expect(s.flags.join(" ")).toMatch(/Unrecognized SPF result "passs"/);
    expect(s.flags.join(" ")).toMatch(/Unrecognized DMARC result "passs"/);
  });

  it("flags a From/DMARC domain mismatch", () => {
    const s = summarizeEmail(
      unfoldHeaders(
        "From: Attacker <user@attacker.example.net>\n" +
          "Authentication-Results: mx; spf=pass smtp.mailfrom=example.com; dmarc=pass header.from=example.com\n",
      ),
    );
    expect(s.flags.join(" ")).toMatch(/does not match the DMARC-checked domain/);
  });

  it("flags a large hop delay (>60s)", () => {
    const s = summarizeEmail(
      unfoldHeaders(
        "Received: from a (a [1.1.1.1]) by b with ESMTP; Thu, 18 Oct 2026 09:05:00 -0700\n" +
          "Received: from c (c [2.2.2.2]) by d with ESMTP; Thu, 18 Oct 2026 09:04:00 -0700\n",
      ),
    );
    expect(s.hops[0].delayMs).toBe(60000);
    expect(s.hops[1].delayMs).toBeNull();
    // exactly 60s is not "large": the threshold is strictly greater
    expect(s.flags.some((f) => f.includes("Large hop delay"))).toBe(false);
  });

  it("flags a strictly-larger hop delay", () => {
    const s = summarizeEmail(
      unfoldHeaders(
        "Received: from a (a [1.1.1.1]) by b with ESMTP; Thu, 18 Oct 2026 09:05:01 -0700\n" +
          "Received: from c (c [2.2.2.2]) by d with ESMTP; Thu, 18 Oct 2026 09:04:00 -0700\n",
      ),
    );
    expect(s.flags.join(" ")).toMatch(/Large hop delay: hop 1 of 2 took 61s/);
  });
});

describe("domainsMatch", () => {
  it("matches equal and relaxed-aligned domains", () => {
    expect(domainsMatch("example.com", "example.com")).toBe(true);
    expect(domainsMatch("mail.example.com", "example.com")).toBe(true);
    expect(domainsMatch("EXAMPLE.COM", "example.com")).toBe(true);
    expect(domainsMatch("attacker.example.net", "example.com")).toBe(false);
  });
});
