import { beforeEach, describe, expect, it } from "vitest";
import { checkAttempt, clientIp, createRateLimiter, ipRateKey, resetAuthRateLimits, trustedProxyHops } from "./rateLimit";

describe("createRateLimiter", () => {
  it("bloque au-delà de la limite puis se rouvre à la fenêtre suivante", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => now });
    expect([limiter.take("a"), limiter.take("a"), limiter.take("a")]).toEqual([true, true, false]);
    expect(limiter.take("b")).toBe(true);
    now = 1000;
    expect(limiter.take("a")).toBe(true);
  });

  it("borne la mémoire utilisée", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 3, now: () => now });
    for (const key of ["a", "b", "c", "d"]) expect(limiter.take(key)).toBe(true);
    // « a », la plus ancienne, a été oubliée ; « d » est toujours comptée.
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("d")).toBe(false);
    now = 5000;
    expect(limiter.take("d")).toBe(true);
  });
});

describe("clientIp", () => {
  it("prend l'élément ajouté par le proxy de confiance (le dernier), sinon x-real-ip", () => {
    // L'élément de gauche vient du client : il peut être falsifié.
    expect(clientIp(new Headers({ "x-forwarded-for": " 1.2.3.4 , 203.0.113.7 " }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers({ "x-forwarded-for": " , ", "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("inconnue");
  });

  it("deux proxys en chaîne : l'avant-dernier élément", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.7, 10.0.0.1" });
    expect(clientIp(headers, 2)).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7" }), 3)).toBe("203.0.113.7");
  });
});

describe("ipRateKey", () => {
  it("réduit une adresse IPv6 à son préfixe /64, quelle que soit son écriture", () => {
    const key = "2001:db8:85a3:12::/64";
    expect(ipRateKey("2001:db8:85a3:12::1")).toBe(key);
    expect(ipRateKey("2001:0DB8:85a3:0012:ffff:aaaa:1:2")).toBe(key);
    expect(ipRateKey("[2001:db8:85a3:12:dead:beef::]:443")).toBe(key);
    expect(ipRateKey("2001:db8:85a3:13::1")).not.toBe(key);
    expect(ipRateKey("::1")).toBe("0:0:0:0::/64");
    expect(ipRateKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it("une IPv4 mappée en IPv6 redevient l'IPv4 ; IPv4 et valeurs inconnues inchangées (port retiré)", () => {
    expect(ipRateKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(ipRateKey("::FFFF:cb00:7107")).toBe("203.0.113.7");
    expect(ipRateKey("203.0.113.7")).toBe("203.0.113.7");
    expect(ipRateKey("203.0.113.7:51234")).toBe("203.0.113.7");
    expect(ipRateKey("1:2:3")).toBe("1:2:3");
    expect(ipRateKey("n'importe quoi")).toBe("n'importe quoi");
  });

  it("clientIp renvoie la clé normalisée", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "2001:db8::5" }))).toBe("2001:db8:0:0::/64");
  });

  it("changer d'adresse dans un même /64 ne donne pas de nouveau quota", () => {
    resetAuthRateLimits();
    const verdicts = Array.from({ length: 11 }, (_, i) =>
      checkAttempt("signUp", clientIp(new Headers({ "x-forwarded-for": `2001:db8:1:2::${(i + 1).toString(16)}` }))),
    );
    expect(verdicts.slice(0, 10).every((v) => v === "allowed")).toBe(true);
    expect(verdicts[10]).toBe("limited");
    resetAuthRateLimits();
  });
});

describe("trustedProxyHops", () => {
  it("1 par défaut ou si la valeur est invalide", () => {
    expect(trustedProxyHops(undefined)).toBe(1);
    expect(trustedProxyHops("2")).toBe(2);
    for (const value of ["", "0", "-1", "1.5", "abc", "11"]) expect(trustedProxyHops(value)).toBe(1);
  });
});

describe("checkAttempt", () => {
  beforeEach(() => resetAuthRateLimits());

  it("un tiers qui s'acharne sur une adresse ne bloque pas les autres IP", () => {
    for (let i = 0; i < 10; i++) expect(checkAttempt("signIn", "1.1.1.1", "vous@exemple.fr")).toBe("allowed");
    expect(checkAttempt("signIn", "1.1.1.1", " VOUS@exemple.fr ")).toBe("limited");
    expect(checkAttempt("signIn", "2.2.2.2", "vous@exemple.fr")).toBe("allowed");
  });

  it("réinitialisation : au-delà du plafond de l'adresse, réponse silencieuse", () => {
    for (let i = 0; i < 10; i++) expect(checkAttempt("reset", `10.0.0.${i}`, "vous@exemple.fr")).toBe("allowed");
    expect(checkAttempt("reset", "10.0.1.1", "vous@exemple.fr")).toBe("silenced");
    expect(checkAttempt("reset", "10.0.1.1", "autre@exemple.fr")).toBe("allowed");
  });

  it("inscription et nouveau mot de passe : limite par IP seulement", () => {
    for (let i = 0; i < 10; i++) expect(checkAttempt("signUp", "1.1.1.1")).toBe("allowed");
    expect(checkAttempt("signUp", "1.1.1.1")).toBe("limited");
    expect(checkAttempt("signUp", "2.2.2.2")).toBe("allowed");
  });
});
