import { describe, expect, it } from "vitest";
import { crtShUrl, newestCerts, parseCrtSh } from "./ct";

const FIXTURE = [
  {
    issuer_name: "GTS CA 1P5",
    common_name: "*.example.com",
    name_value: "*.example.com",
    not_before: "2026-01-01 00:00:00",
    not_after: "2026-04-01 00:00:00",
  },
  {
    issuer_name: "Let's Encrypt Authority X3",
    common_name: "mail.example.com",
    name_value: "mail.example.com\nsmtp.example.com",
    not_before: "2025-11-15 00:00:00",
    not_after: "2026-02-13 00:00:00",
  },
];

describe("crtShUrl", () => {
  it("uses the %25. (subdomain) query form", () => {
    expect(crtShUrl("example.com")).toBe("https://crt.sh/?q=%25.example.com&output=json");
  });

  it("lowercases the domain", () => {
    expect(crtShUrl("Example.Com")).toBe("https://crt.sh/?q=%25.example.com&output=json");
  });
});

describe("parseCrtSh", () => {
  it("parses certificates from a crt.sh array", () => {
    const r = parseCrtSh(FIXTURE, "example.com");
    expect(r.certs).toHaveLength(2);
    expect(r.certs[0].commonName).toBe("*.example.com");
    expect(r.certs[0].issuer).toBe("GTS CA 1P5");
    expect(r.certs[1].nameValue).toBe("mail.example.com\nsmtp.example.com");
    expect(r.certs[1].notBefore).toBe("2025-11-15 00:00:00");
    expect(r.error).toBeUndefined();
  });

  it("collects subdomain parts, with wildcards normalized to *", () => {
    const r = parseCrtSh(FIXTURE, "example.com");
    expect(r.subdomains).toEqual(["*", "mail", "smtp"]);
  });

  it("keeps multi-level subdomain parts intact", () => {
    const r = parseCrtSh(
      [
        {
          common_name: "www.mail.example.com",
          name_value: "www.mail.example.com",
          issuer_name: "I",
          not_before: "2026-01-01 00:00:00",
          not_after: "2026-07-01 00:00:00",
        },
      ],
      "example.com",
    );
    expect(r.subdomains).toEqual(["www.mail"]);
  });

  it("omits the apex and dedupes repeated names", () => {
    const r = parseCrtSh(
      [
        {
          common_name: "example.com",
          name_value: "example.com\nwww.example.com\nwww.example.com",
          issuer_name: "I",
          not_before: "2026-01-01 00:00:00",
          not_after: "2026-07-01 00:00:00",
        },
      ],
      "example.com",
    );
    expect(r.subdomains).toEqual(["www"]);
  });

  it("ignores names from other domains", () => {
    const r = parseCrtSh(
      [
        {
          common_name: "other.net",
          name_value: "other.net\nmail.example.com",
          issuer_name: "I",
          not_before: "2026-01-01 00:00:00",
          not_after: "2026-07-01 00:00:00",
        },
      ],
      "example.com",
    );
    expect(r.certs).toHaveLength(1);
    expect(r.subdomains).toEqual(["mail"]);
  });

  it("is case-insensitive", () => {
    const r = parseCrtSh(
      [
        {
          common_name: "WWW.Example.COM",
          name_value: "WWW.Example.COM",
          issuer_name: "I",
          not_before: "2026-01-01 00:00:00",
          not_after: "2026-07-01 00:00:00",
        },
      ],
      "Example.com",
    );
    expect(r.subdomains).toEqual(["www"]);
  });

  it("skips malformed entries", () => {
    const r = parseCrtSh(
      [null, 42, "nope", { common_name: 7 }, FIXTURE[0]],
      "example.com",
    );
    expect(r.certs).toHaveLength(1);
    expect(r.certs[0].commonName).toBe("*.example.com");
  });

  it("rejects non-array payloads", () => {
    for (const bad of [null, 42, "nope", {}]) {
      const r = parseCrtSh(bad, "example.com");
      expect(r.certs).toEqual([]);
      expect(r.error).toBeTruthy();
    }
  });
});

describe("newestCerts", () => {
  it("sorts newest first and caps the list", () => {
    const mk = (notBefore: string) => ({ commonName: "a", nameValue: "a", issuer: "", notBefore, notAfter: "" });
    const out = newestCerts([mk("2024-01-01 00:00:00"), mk("2026-01-01 00:00:00"), mk("2025-01-01 00:00:00")], 2);
    expect(out.map((c) => c.notBefore)).toEqual(["2026-01-01 00:00:00", "2025-01-01 00:00:00"]);
  });
});
