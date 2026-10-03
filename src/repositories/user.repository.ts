import { database } from "../database";
import type { AuthUser } from "../types/auth";

export interface AuthUserRecord extends AuthUser {
  passwordSHA256: string | null;
}

interface EmployeeTypeClearance {
  acronym: string;
  level: string;
}

interface UserRow {
  id: string;
  customerId: string;
  login: string | null;
  email: string | null;
  passwordSHA256: string | null;
  userStatus: string | null;
  userDeletedAt: Date | null;
  customerStatus: string | null;
  customerDeletedAt: Date | null;
  employeeType: string | null;
  employeeStatus: string | null;
  canLogin: boolean | null;
}

const employeeTypeClearances: Record<string, EmployeeTypeClearance> = {
  SUP: { acronym: "SUP", level: "0" },
  GES: { acronym: "GES", level: "A" },
  GFI: { acronym: "GFI", level: "AA" },
  REC: { acronym: "REC", level: "AAA" },
  VET: { acronym: "VET", level: "AB" },
  AVE: { acronym: "AVE", level: "ABA" },
  GBT: { acronym: "GBT", level: "AC" },
  OTB: { acronym: "OTB", level: "ACA" },
  GHO: { acronym: "GHO", level: "AD" },
  OPH: { acronym: "OPH", level: "ADA" },
  OPM: { acronym: "OPM", level: "ACB" },
  OUT: { acronym: "OUT", level: "Z" }
};

const baseUserSelect = `
  SELECT
    u."id",
    u."customerId" AS "customerId",
    u."login",
    u."email",
    u."passwordSHA256",
    u."status" AS "userStatus",
    u."deletedAt" AS "userDeletedAt",
    c."status" AS "customerStatus",
    c."deletedAt" AS "customerDeletedAt",
    e."type" AS "employeeType",
    e."status" AS "employeeStatus",
    e."canLogin" AS "canLogin"
  FROM "generalData"."users" AS u
  INNER JOIN "tenantData"."employees" AS e
    ON e."id" = u."employeeId"
   AND e."deletedAt" IS NULL
  INNER JOIN "generalData"."customers" AS c
    ON c."id" = u."customerId"
   AND c."deletedAt" IS NULL
`;

const toAuthUserRecord = (row: UserRow): AuthUserRecord | null => {
  if (
    row.userDeletedAt ||
    row.customerDeletedAt ||
    row.userStatus !== "active" ||
    row.customerStatus !== "active" ||
    !row.canLogin ||
    row.employeeStatus !== "active" ||
    !row.employeeType
  ) {
    return null;
  }

  const employeeType = employeeTypeClearances[row.employeeType];

  if (!employeeType) {
    return null;
  }

  return {
    id: row.id,
    customerId: row.customerId,
    login: row.login ?? "",
    email: row.email,
    clearance: employeeType.acronym,
    clearanceLevel: employeeType.level,
    passwordSHA256: row.passwordSHA256
  };
};

export const findUserByLoginOrEmail = async (identity: { login?: string; email?: string }): Promise<AuthUserRecord | null> => {
  const user = await database.queryOne<UserRow>(
    `${baseUserSelect}
     WHERE ($1::text IS NOT NULL AND u."login" = $1) OR ($2::text IS NOT NULL AND u."email" = $2)
     LIMIT 1`,
    [identity.login ?? null, identity.email ?? null]
  );

  return user ? toAuthUserRecord(user) : null;
};

export const findUserById = async (id: string): Promise<AuthUserRecord | null> => {
  const user = await database.queryOne<UserRow>(
    `${baseUserSelect}
     WHERE u."id" = $1
     LIMIT 1`,
    [id]
  );

  return user ? toAuthUserRecord(user) : null;
};
