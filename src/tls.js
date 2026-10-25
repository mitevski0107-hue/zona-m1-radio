"use strict";

const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
const tls = require("node:tls");

// No-IP renewed zonam1.ddns.net on 2026-10-25 and the server sends only the
// leaf. This public intermediate is signed by DigiCert Global Root G2, which
// Node already trusts. Adding it completes the chain. Name and expiry checks
// stay on, and unrelated certificates are still rejected.
const extraCa = fs.readFileSync(path.join(__dirname, "certs", "noip-tls-ica.pem"), "utf8");

const secureAgent = new https.Agent({
  ca: [...tls.rootCertificates, extraCa],
  keepAlive: true,
});

module.exports = { secureAgent };
