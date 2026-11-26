import { describe, expect, it } from "vitest";
import { detect } from "./detectors";
import { base32Encode } from "./codec";
import { base64Encode } from "./utils";

/** Encode a string as an unpadded, URL-safe base64 segment (JWT part). */
function seg(s: string): string {
  return base64Encode(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const VALID_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
  ".eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiZXhwIjoxNTE2MjM5MDIyfQ" +
  ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

describe("detect: jwt", () => {
  it("detects a valid token and extracts claims (regression)", () => {
    const d = detect(VALID_JWT);
    expect(d?.kind).toBe("jwt");
    if (d?.kind === "jwt") {
      expect(d.sub).toBe("1234567890");
      expect(d.exp).toBe(1516239022);
      expect(d.expired).toBe(true);
      expect(d.headerError).toBeNull();
      expect(d.payloadError).toBeNull();
    }
  });

  it("coerces a numeric `sub` claim to a string", () => {
    const token = `${seg('{"alg":"HS256","typ":"JWT"}')}.${seg('{"sub":42,"iat":1700000000}')}.x`;
    const d = detect(token);
    expect(d?.kind).toBe("jwt");
    if (d?.kind === "jwt") {
      expect(d.sub).toBe("42");
      expect(d.expired).toBeNull(); // no exp claim
    }
  });

  it("reports a broken payload segment as an error, not a non-detection", () => {
    const token = `${seg('{"alg":"HS256","typ":"JWT"}')}.${seg("this is not json at all")}.sig`;
    const d = detect(token);
    expect(d?.kind).toBe("jwt");
    if (d?.kind === "jwt") {
      expect(d.payload).toBeNull();
      expect(d.payloadError).not.toBeNull();
    }
  });

  it("reports a broken header segment as an error", () => {
    const token = `${seg("also not json here")}.${seg('{"sub":"a"}')}.sig`;
    const d = detect(token);
    expect(d?.kind).toBe("jwt");
    if (d?.kind === "jwt") {
      expect(d.header).toBeNull();
      expect(d.headerError).not.toBeNull();
    }
  });

  it("accepts an empty signature (trailing dot, alg=none style)", () => {
    const token = `${seg('{"alg":"none","typ":"JWT"}')}.${seg('{"sub":"a"}')}.`;
    const d = detect(token);
    expect(d?.kind).toBe("jwt");
    if (d?.kind === "jwt") expect(d.signature).toBe("");
  });

  it("treats a token with both segments undecodable as domain-shaped, not a JWT", () => {
    const token = `${seg("not json a")}.${seg("not json b")}.sig`;
    // Undecodable as a JWT, and its three dot-separated labels have the shape
    // of a hostname; the domain detector claims it (a real, decodable
    // JWT never reaches that point).
    expect(detect(token)?.kind).toBe("domain");
  });
});

describe("detect: epoch", () => {
  it("treats 10 digits as Unix seconds (regression)", () => {
    const d = detect("1700000000");
    expect(d?.kind).toBe("epoch");
    if (d?.kind === "epoch") {
      expect(d.unit).toBe("seconds");
      expect(d.value).toBe(1_700_000_000_000);
      expect(d.date.toISOString()).toBe("2023-11-14T22:13:20.000Z");
    }
  });

  it("treats 13 digits as Unix milliseconds (regression)", () => {
    const d = detect("1700000000123");
    expect(d?.kind).toBe("epoch");
    if (d?.kind === "epoch") {
      expect(d.unit).toBe("milliseconds");
      expect(d.value).toBe(1_700_000_000_123);
      expect(d.date.toISOString()).toBe("2023-11-14T22:13:20.123Z");
    }
  });

  it("leaves 11-digit numbers as plain text", () => {
    expect(detect("17000000000")?.kind).toBe("text");
  });
});

describe("detect: json", () => {
  it("detects objects and arrays", () => {
    const obj = detect('{"a":1,"b":[2,3]}');
    expect(obj?.kind).toBe("json");
    if (obj?.kind === "json") expect(obj.formatted).toContain('"a": 1');

    const arr = detect("[1, 2, 3]");
    expect(arr?.kind).toBe("json");
  });

  it("rejects invalid JSON and bare scalars", () => {
    expect(detect("{nope}")?.kind).toBe("text");
    expect(detect("123")?.kind).toBe("text");
  });
});

describe("detect: cron", () => {
  it("detects 5- and 6-field expressions", () => {
    const d5 = detect("*/15 * * * *");
    expect(d5?.kind).toBe("cron");
    if (d5?.kind === "cron") expect(d5.expression).toBe("*/15 * * * *");

    expect(detect("0 0 * * * *")?.kind).toBe("cron");
  });

  it("does not detect a run of plain words (regression: 5-word phrase)", () => {
    expect(detect("the quick brown fox jumps")?.kind).toBe("text");
  });

  it("does not detect prose containing a number (regression)", () => {
    expect(detect("I have 5 apples today man")?.kind).toBe("text");
  });

  it("detects expressions with named day/month ranges and lists", () => {
    const d = detect("0 9 * * MON-FRI");
    expect(d?.kind).toBe("cron");
    if (d?.kind === "cron") expect(d.expression).toBe("0 9 * * MON-FRI");
    expect(detect("0 0 1 JAN,JUL *")?.kind).toBe("cron");
  });

  it("does not detect an all-wildcard schedule", () => {
    expect(detect("* * * * *")?.kind).toBe("text");
  });

  it("does not detect 4 or 7 tokens", () => {
    expect(detect("1 2 3 4")?.kind).toBe("text");
    expect(detect("1 2 3 4 5 6 7")?.kind).toBe("text");
  });
});

describe("detect: url", () => {
  it("detects http/https URLs, tolerating surrounding whitespace", () => {
    const d = detect("  https://example.com/a?b=1  ");
    expect(d?.kind).toBe("url");
    if (d?.kind === "url") {
      expect(d.raw).toBe("https://example.com/a?b=1");
      expect(d.parsed.host).toBe("example.com");
    }
  });

  it("does not claim bare domains (the domain detector does)", () => {
    expect(detect("example.com")?.kind).toBe("domain");
  });
});

describe("dotted numeric input (no IP detector)", () => {
  it("leaves out-of-range octets as text", () => {
    expect(detect("256.1.1.1")?.kind).toBe("text");
  });

  it("leaves wrong group counts as text", () => {
    expect(detect("1.2.3")?.kind).toBe("text");
    expect(detect("1.2.3.4.5")?.kind).toBe("text");
  });

  it("leaves a dotted quad with an invalid prefix as text", () => {
    expect(detect("1.2.3.4/33")?.kind).toBe("text");
  });

  it("prefers URL when the URL contains an address", () => {
    expect(detect("http://192.168.1.1/admin")?.kind).toBe("url");
  });
});

describe("detect: base64", () => {
  it("detects base64 of printable text", () => {
    const d = detect("SGVsbG8gd29ybGQh");
    expect(d?.kind).toBe("base64");
    if (d?.kind === "base64") expect(d.decoded).toBe("Hello world!");
  });

  it("does not misread a hex string as base64 text", () => {
    // 16 hex chars are valid base64 alphabet, but decode to non-textual bytes,
    // so Base64 rejects it, and the hex detector, which runs after Base64, claims it.
    const d = detect("deadbeefdeadbeef");
    expect(d?.kind).toBe("hex");
    if (d?.kind === "hex") {
      expect(d.decoded).toBeNull();
      expect(d.byteLength).toBe(8);
    }
  });

  it("requires length a multiple of four", () => {
    expect(detect("SGVsbG8gd29ybGQ")?.kind).toBe("text"); // 15 chars
  });
});

describe("detect: headers (email)", () => {
  const EMAIL_HEADERS = [
    "Received: from mail.example.com (mail.example.com [203.0.113.10])",
    "\tby mx.example.com with ESMTPS id ABC for <dev@example.com>;",
    "\tThu, 18 Oct 2026 09:12:31 -0700 (PDT)",
    "Authentication-Results: mx.example.com;",
    "\tspf=pass smtp.mailfrom=example.com",
    "DKIM-Signature: v=1; d=example.com; s=s1; h=from:to",
    "From: Sender <sender@example.com>",
    "To: Recipient <recipient@example.com>",
    "Subject: A test message",
  ].join("\n");

  it("detects an email header block and folds continuations", () => {
    const d = detect(EMAIL_HEADERS);
    expect(d?.kind).toBe("headers");
    if (d?.kind === "headers") {
      expect(d.pairs).toHaveLength(6);
      expect(d.pairs[0].name).toBe("Received");
      // The two \t-continuation lines are folded onto the Received value.
      expect(d.pairs[0].value).toBe(
        "from mail.example.com (mail.example.com [203.0.113.10]) by mx.example.com with ESMTPS id ABC for <dev@example.com>; Thu, 18 Oct 2026 09:12:31 -0700 (PDT)",
      );
    }
  });

  it("leaves an HTTP response header block as text", () => {
    const d = detect(
      "HTTP/1.1 200 OK\nDate: Thu, 18 Oct 2026 09:12:31 GMT\nContent-Type: text/html; charset=UTF-8\nStrict-Transport-Security: max-age=63072000\nServer: nginx",
    );
    expect(d?.kind).toBe("text");
  });

  it("leaves a plain name/value block without email markers as text", () => {
    expect(detect("Name: tst.dev\nVersion: 2.0\nAuthor: example")?.kind).toBe("text");
  });

  it("requires at least two newlines and three matching lines", () => {
    expect(detect("From: a@b.com")?.kind).toBe("text");
    expect(detect("From: a@b.com\nSubject: hi")?.kind).toBe("text");
    // 3 lines (2 newlines) with 3 matching lines is the minimum that passes.
    expect(detect("From: a@b.com\nSubject: hi\nDate: x")?.kind).toBe("headers");
  });

  it("requires ≥60% of non-empty lines to be header lines", () => {
    // 3 of 4 lines match → 75%, detected.
    expect(detect("From: a@b.com\nSubject: hi\nnot a header line\nDate: x")?.kind).toBe("headers");
    // 2 of 4 lines match → 50%, text.
    expect(detect("From: a@b.com\njust words here\nSubject: hi\nmore words")?.kind).toBe("text");
  });

  it("never claims a JSONL stream (lines start with {) as headers (shadowing)", () => {
    const d = detect('{"id":1,"name":"a"}\n{"id":2,"name":"b"}\n{"id":3}');
    expect(d?.kind).toBe("jsonl");
  });

  it("never claims pretty-printed JSON (caught earlier by json)", () => {
    const d = detect('{\n  "from": "a@b.com",\n  "subject": "hi"\n}');
    expect(d?.kind).toBe("json");
  });
});

describe("detect: jsonl", () => {
  it("detects a multi-line stream of objects", () => {
    const d = detect('{"id":1,"name":"a"}\n{"id":2}');
    expect(d?.kind).toBe("jsonl");
    if (d?.kind === "jsonl") {
      expect(d.lineCount).toBe(2);
      expect(d.okCount).toBe(2);
      expect(d.keyUnion).toEqual(["id", "name"]);
      expect(d.firstLine).toBe('{"id":1,"name":"a"}');
    }
  });

  it("accepts scalar lines as long as at least one line is an object", () => {
    const d = detect('{"a":1}\n[1,2]\n42');
    expect(d?.kind).toBe("jsonl");
    if (d?.kind === "jsonl") expect(d.keyUnion).toEqual(["a"]);
  });

  it("leaves a single JSON line to the json detector", () => {
    expect(detect('{"a":1}\n')?.kind).toBe("json");
  });

  it("rejects a stream with any invalid line", () => {
    expect(detect('{"a":1}\nnot json\n{"b":2}')?.kind).toBe("text");
  });

  it("rejects a stream with no objects", () => {
    expect(detect("1\n2\n3")?.kind).toBe("text");
  });

  it("keeps pretty-printed JSON as a single json document", () => {
    expect(detect('{\n  "a": 1\n}')?.kind).toBe("json");
  });

  it("accepts CRLF line endings", () => {
    expect(detect('{"a":1}\r\n{"b":2}')?.kind).toBe("jsonl");
  });
});

describe("detect: hex", () => {
  it("detects a hex string of binary bytes", () => {
    const d = detect("deadbeefdeadbeef");
    expect(d?.kind).toBe("hex");
    if (d?.kind === "hex") {
      expect(d.decoded).toBeNull();
      expect(d.byteLength).toBe(8);
    }
  });

  it("detects hex of printable text and decodes it", () => {
    // hexEncode("Hello world!"): 22 chars, not a multiple of 4, so Base64 can't match.
    const d = detect("48656c6c6f20776f726c6421");
    expect(d?.kind).toBe("hex");
    if (d?.kind === "hex") {
      expect(d.decoded).toBe("Hello world!");
      expect(d.byteLength).toBe(12);
    }
  });

  it("accepts an optional 0x prefix", () => {
    const d = detect("0xdeadbeefdeadbeef");
    expect(d?.kind).toBe("hex");
    if (d?.kind === "hex") expect(d.byteLength).toBe(8);
  });

  it("leaves odd-length hex as text", () => {
    // 21 chars, one digit short of a whole byte.
    expect(detect("48656c6c6f20776f726c6")?.kind).toBe("text");
  });

  it("leaves short hex runs as text", () => {
    expect(detect("abcd12")?.kind).toBe("text");
  });

  it("prefers epoch for a 10-digit number (also valid hex)", () => {
    expect(detect("1700000000")?.kind).toBe("epoch");
  });

  it("detects 12-digit hex that is not an epoch length", () => {
    expect(detect("1234567890ab")?.kind).toBe("hex");
  });
});

describe("detect: base32", () => {
  it("detects padded base32 of text", () => {
    const encoded = base32Encode("Hello, tst.dev!");
    const d = detect(encoded);
    expect(d?.kind).toBe("base32");
    if (d?.kind === "base32") {
      expect(d.decoded).toBe("Hello, tst.dev!");
      expect(d.byteLength).toBe(15);
    }
  });

  it("accepts lowercase input", () => {
    const encoded = base32Encode("Hello, tst.dev!").toLowerCase();
    const d = detect(encoded);
    expect(d?.kind).toBe("base32");
    if (d?.kind === "base32") expect(d.decoded).toBe("Hello, tst.dev!");
  });

  it("detects base32 of binary bytes with no text decode", () => {
    // 12 control bytes → 20 base32 chars (≥16), decodes to nothing printable.
    const d = detect(base32Encode("\u0001\u0002\u0003\u0004\u0005\u0006\u0007\u0008\u0009\u000a\u000b\u000c"));
    expect(d?.kind).toBe("base32");
    if (d?.kind === "base32") {
      expect(d.decoded).toBeNull();
      expect(d.byteLength).toBe(12);
    }
  });

  it("rejects a length that cannot represent whole bytes", () => {
    // 17 alphabet chars: 17 % 8 === 1 is impossible for base32.
    expect(detect("MZXW6YTBOIMZXW6YT")?.kind).toBe("text");
  });

  it("leaves short base32-looking strings as text", () => {
    expect(detect("MZXW6YTB")?.kind).toBe("text");
  });

  it("prefers base64 when the same string is valid base64 of text", () => {
    // "TEhpcyBpcyB0ZXN0" is base64("This is test") and uses only base32-alphabet
    // chars; Base64 runs first and wins, which is the right call.
    expect(detect("TEhpcyBpcyB0ZXN0")?.kind).toBe("base64");
  });
});

describe("detect: domain", () => {
  it("detects a bare hostname", () => {
    const d = detect("example.com");
    expect(d?.kind).toBe("domain");
    if (d?.kind === "domain") expect(d.host).toBe("example.com");
  });

  it("detects multi-level hostnames", () => {
    const d = detect("sub.example.co.uk");
    expect(d?.kind).toBe("domain");
    if (d?.kind === "domain") expect(d.host).toBe("sub.example.co.uk");
  });

  it("accepts a legal double-hyphen label and a single-letter TLD", () => {
    const d = detect("a--b.c");
    expect(d?.kind).toBe("domain");
    if (d?.kind === "domain") expect(d.host).toBe("a--b.c");
  });

  it("lowercases the host", () => {
    const d = detect("WWW.Example.COM");
    expect(d?.kind).toBe("domain");
    if (d?.kind === "domain") expect(d.host).toBe("www.example.com");
  });

  it("accepts an all-numeric label when the TLD is alphabetic", () => {
    expect(detect("1234.com")?.kind).toBe("domain");
  });

  it("leaves an IP-shaped dotted quad as text (all-numeric labels aren't a domain)", () => {
    expect(detect("1.2.3.4")?.kind).toBe("text");
  });

  it("rejects all-numeric labels (IP-shaped, not a real domain)", () => {
    expect(detect("123.456")?.kind).toBe("text");
  });

  it("rejects a single label with no dot", () => {
    expect(detect("example")?.kind).toBe("text");
  });

  it("rejects a space (prose, not a hostname)", () => {
    expect(detect("ex ample.com")?.kind).toBe("text");
  });

  it("rejects leading and trailing hyphens in a label", () => {
    expect(detect("-example.com")?.kind).toBe("text");
    expect(detect("example-.com")?.kind).toBe("text");
  });

  it("rejects an empty label (double dot)", () => {
    expect(detect("example..com")?.kind).toBe("text");
  });

  it("rejects underscores and port numbers", () => {
    expect(detect("ex_ample.com")?.kind).toBe("text");
    expect(detect("example.com:8080")?.kind).toBe("text");
  });

  it("rejects a label over 63 characters", () => {
    expect(detect(`${"a".repeat(64)}.com`)?.kind).toBe("text");
  });

  it("rejects a hostname over 253 characters total", () => {
    const label = "a".repeat(63);
    const long = [label, label, label, label, "com"].join("."); // 258 chars
    expect(long.length).toBeGreaterThan(253);
    expect(detect(long)?.kind).toBe("text");
  });

  it("never claims a real JWT as a domain (shadowing)", () => {
    expect(detect(VALID_JWT)?.kind).toBe("jwt");
  });
});

describe("detect: fallback and empty input", () => {
  it("returns null for empty or whitespace-only input", () => {
    expect(detect("")).toBeNull();
    expect(detect("   \n\t ")).toBeNull();
  });

  it("falls back to text for ordinary prose", () => {
    const d = detect("Hello, world!");
    expect(d?.kind).toBe("text");
    if (d?.kind === "text") expect(d.length).toBe(13);
  });

  it("prefers JWT over the other heuristics (dotted token is not base64 anyway)", () => {
    expect(detect(VALID_JWT)?.kind).toBe("jwt");
  });
});
