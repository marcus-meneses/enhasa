import { generateKeyPairSync } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const keyDirectory = resolve(
  process.env.ENHASA_DEVELOPMENT_KEY_DIRECTORY ??
    resolve(projectDirectory, "src", "keys", "DEVELOPMENT"),
);
const privateKeyPath = resolve(keyDirectory, "private.pem");
const publicKeyPath = resolve(keyDirectory, "public.pem");
const mode = process.argv[2] ?? "ensure";

if (!new Set(["ensure", "regenerate", "regenerate-stdout"]).has(mode)) {
  throw new Error(
    `Unsupported mode: ${mode}. Use ensure, regenerate or regenerate-stdout.`,
  );
}

const privateKeyExists = existsSync(privateKeyPath);
const publicKeyExists = existsSync(publicKeyPath);

if (mode === "ensure" && privateKeyExists !== publicKeyExists) {
  throw new Error(
    `Incomplete DEVELOPMENT key pair in ${keyDirectory}. ` +
      "Restore the missing file or run npm run keys:development:regenerate.",
  );
}

if (mode === "ensure" && privateKeyExists && publicKeyExists) {
  chmodSync(keyDirectory, 0o700);
  chmodSync(privateKeyPath, 0o600);
  chmodSync(publicKeyPath, 0o644);
  console.log(`Using existing DEVELOPMENT key pair in ${keyDirectory}`);
  process.exit(0);
}

mkdirSync(keyDirectory, { recursive: true, mode: 0o700 });
chmodSync(keyDirectory, 0o700);

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 3072,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const suffix = `${process.pid}-${Date.now()}`;
const temporaryPrivateKeyPath = `${privateKeyPath}.${suffix}.tmp`;
const temporaryPublicKeyPath = `${publicKeyPath}.${suffix}.tmp`;

try {
  writeFileSync(temporaryPrivateKeyPath, privateKey, { mode: 0o600, flag: "wx" });
  writeFileSync(temporaryPublicKeyPath, publicKey, { mode: 0o644, flag: "wx" });
  renameSync(temporaryPrivateKeyPath, privateKeyPath);
  renameSync(temporaryPublicKeyPath, publicKeyPath);
  chmodSync(privateKeyPath, 0o600);
  chmodSync(publicKeyPath, 0o644);
} finally {
  rmSync(temporaryPrivateKeyPath, { force: true });
  rmSync(temporaryPublicKeyPath, { force: true });
}

if (mode === "regenerate-stdout") {
  console.error(`Regenerated DEVELOPMENT key pair in ${keyDirectory}`);
  process.stdout.write(`${JSON.stringify({ privateKey, publicKey })}\n`);
} else {
  console.log(
    `${mode === "regenerate" ? "Regenerated" : "Generated"} DEVELOPMENT key pair in ${keyDirectory}`,
  );
}
