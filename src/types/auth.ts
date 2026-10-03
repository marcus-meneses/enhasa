export type EntityId = string;
export type Clearance = string;
export type ClearanceLevel = string;

export interface AuthUser {
  id: EntityId;
  customerId: EntityId;
  login: string;
  email: string | null;
  clearance: Clearance;
  clearanceLevel: ClearanceLevel;
  actor?: ImpersonationActor;
}

export interface ImpersonationActor {
  id: EntityId;
  customerId: EntityId;
  login: string;
  email: string | null;
  clearance: Clearance;
  clearanceLevel: ClearanceLevel;
}

export interface JwtPayload {
  sub: EntityId;
  customerId: EntityId;
  login: string;
  email: string | null;
  clearance: Clearance;
  clearanceLevel: ClearanceLevel;
  actor?: ImpersonationActor;
}

