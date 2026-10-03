import { createHash, randomUUID } from "crypto";

export type TomaCredentials = {
  masterToken: string;
  clientToken: string;
  version: string;
  registeredAt: string;
};

let current: TomaCredentials | null = null;

export const registerTomaCredentials = (masterToken: string, clientToken: string): Omit<TomaCredentials, "masterToken" | "clientToken"> => {
  const next = { masterToken, clientToken, version: randomUUID(), registeredAt: new Date().toISOString() };
  current = next;
  return { version: next.version, registeredAt: next.registeredAt };
};

export const getTomaCredentials = (): TomaCredentials | null => current;

export const tomaClientTokenHash = (token: string): string => createHash("sha256").update(token).digest("base64url");
