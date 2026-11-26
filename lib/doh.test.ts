import { describe, expect, it } from "vitest";
import {
  DOH_TYPE_NUMBERS,
  doHurl,
  isValidDomain,
  joinTxtStrings,
  normalizeDomainInput,
  parseDohJson,
} from "./doh";

describe("normalizeDomainInput", () => {
  it("strips URL parts down to the hostname", () => {
    expect(normalizeDomainInput("https://Example.com/a?b=1#c")).toBe("example.com");
    expect(normalizeDomainInput("http://user:pw@example.com:8080/")).toBe("example.com");
    expect(normalizeDomainInput("  example.com.  ")).toBe("example.com");
    expect(normalizeDomainInput("example.com/")).toBe("example.com");
    expect(normalizeDomainInput("mail.example.co.uk")).toBe("mail.example.co.uk");
  });
});

describe("isValidDomain", () => {
  it("accepts hostnames and rejects junk", () => {
    expect(isValidDomain("example.com")).toBe(true);
    expect(isValidDomain("a-b.example.com")).toBe(true);
    expect(isValidDomain("example")).toBe(false);
    expect(isValidDomain("-a.com")).toBe(false);
    expect(isValidDomain("a..com")).toBe(false);
  });
});

describe("doHurl", () => {
  it("builds Cloudflare DNS JSON URLs with the numeric type", () => {
    expect(doHurl("cloudflare", "example.com", "A")).toBe(
      "https://cloudflare-dns.com/dns-query?name=example.com&type=1",
    );
    expect(doHurl("cloudflare", "_dmarc.example.com", "TXT")).toBe(
      "https://cloudflare-dns.com/dns-query?name=_dmarc.example.com&type=16",
    );
  });

  it("builds Google DNS JSON URLs", () => {
    expect(doHurl("google", "example.com", "AAAA")).toBe(
      "https://dns.google/resolve?name=example.com&type=28",
    );
    expect(doHurl("google", "example.com", "CAA")).toBe(
      "https://dns.google/resolve?name=example.com&type=257",
    );
  });
});

describe("DOH_TYPE_NUMBERS", () => {
  it("matches the DNS JSON type registry", () => {
    expect(DOH_TYPE_NUMBERS).toEqual({
      A: 1,
      NS: 2,
      CNAME: 5,
      SOA: 6,
      MX: 15,
      TXT: 16,
      AAAA: 28,
      SRV: 33,
      CAA: 257,
    });
  });
});

describe("joinTxtStrings", () => {
  it("strips the quotes around a single character-string", () => {
    expect(joinTxtStrings('"v=spf1 -all"')).toBe("v=spf1 -all");
    expect(joinTxtStrings('"v=DMARC1;p=reject;rua=mailto:a@example.com"')).toBe(
      "v=DMARC1;p=reject;rua=mailto:a@example.com",
    );
  });

  it("concatenates multiple character-strings with no separator", () => {
    expect(joinTxtStrings('"v=DKIM1; k=rsa; " "p=MIIB"')).toBe("v=DKIM1; k=rsa; p=MIIB");
    expect(joinTxtStrings('"v=spf1 include:a" " include:b -all"')).toBe("v=spf1 include:a include:b -all");
  });

  it("decodes backslash escapes", () => {
    expect(joinTxtStrings('"say \\"hi\\""')).toBe('say "hi"');
    expect(joinTxtStrings('"a\\\\b"')).toBe("a\\b");
    expect(joinTxtStrings('"caf\\195\\169"')).toBe("cafÃ©");
  });

  it("returns unquoted or malformed data unchanged", () => {
    expect(joinTxtStrings("v=spf1 -all")).toBe("v=spf1 -all");
    expect(joinTxtStrings('"unterminated')).toBe('"unterminated');
    expect(joinTxtStrings('nope"')).toBe('nope"');
    expect(joinTxtStrings('"a" junk "b"')).toBe('"a" junk "b"');
    expect(joinTxtStrings("")).toBe("");
  });
});

describe("parseDohJson", () => {
  it("parses a NOERROR A response", () => {
    const r = parseDohJson({
      Status: 0,
      TC: false,
      RD: true,
      RA: true,
      Answer: [{ name: "example.com.", type: 1, TTL: 300, data: "93.184.216.34" }],
    });
    expect(r.status).toBe("NOERROR");
    expect(r.error).toBeUndefined();
    expect(r.answers).toEqual([{ name: "example.com", type: "A", data: "93.184.216.34", ttl: 300 }]);
  });

  it("keeps CNAME chain members, not just the requested type", () => {
    const r = parseDohJson({
      Status: 0,
      Answer: [
        { name: "www.example.com.", type: 5, TTL: 60, data: "example.com." },
        { name: "example.com.", type: 1, TTL: 300, data: "93.184.216.34" },
      ],
    });
    expect(r.answers.map((a) => a.type)).toEqual(["CNAME", "A"]);
  });

  it("maps NXDOMAIN and SERVFAIL statuses", () => {
    expect(parseDohJson({ Status: 3 }).status).toBe("NXDOMAIN");
    expect(parseDohJson({ Status: 2 }).status).toBe("SERVFAIL");
    expect(parseDohJson({ Status: 5 }).status).toBe("REFUSED");
  });

  it("treats unknown status codes and missing fields as UNKNOWN", () => {
    expect(parseDohJson({}).status).toBe("UNKNOWN");
    expect(parseDohJson({ Status: 99 }).status).toBe("UNKNOWN");
  });

  it("tolerates a missing Answer array", () => {
    const r = parseDohJson({ Status: 0, Answer: undefined });
    expect(r.status).toBe("NOERROR");
    expect(r.answers).toEqual([]);
  });

  it("labels unqueried type numbers as OTHER and keeps their data", () => {
    const r = parseDohJson({
      Status: 0,
      Answer: [{ name: "example.com.", type: 999, TTL: 10, data: "opaque" }],
    });
    expect(r.answers[0].type).toBe("OTHER");
    expect(r.answers[0].data).toBe("opaque");
  });

  it("stringifies non-string data instead of dropping the record", () => {
    const r = parseDohJson({
      Status: 0,
      Answer: [{ name: "example.com.", type: 1, TTL: 10, data: { odd: true } }],
    });
    expect(r.answers[0].data).toBe('{"odd":true}');
  });

  it("strips the trailing dot from owner names", () => {
    const r = parseDohJson({
      Status: 0,
      Answer: [{ name: "mail.example.com.", type: 15, TTL: 3600, data: "10 mail.example.com." }],
    });
    expect(r.answers[0].name).toBe("mail.example.com");
    expect(r.answers[0].data).toBe("10 mail.example.com.");
  });

  it("skips malformed answer entries", () => {
    const r = parseDohJson({
      Status: 0,
      Answer: [null, "nope", 42, { name: "example.com.", type: 1, TTL: 5, data: "1.2.3.4" }],
    });
    expect(r.answers).toHaveLength(1);
  });

  it("rejects non-object payloads", () => {
    for (const bad of [null, 42, "nope"]) {
      const r = parseDohJson(bad);
      expect(r.status).toBe("UNKNOWN");
      expect(r.error).toBeTruthy();
    }
  });
});
