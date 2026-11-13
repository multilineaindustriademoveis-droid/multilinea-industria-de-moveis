/**
 * Verification suite for the Dirty Dozen security payloads against firestore.rules.
 */
export interface DirtyPayloadTest {
  id: number;
  name: string;
  collection: string;
  docId: string;
  operation: 'create' | 'update' | 'delete' | 'get';
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyPayloadTest[] = [
  {
    id: 1,
    name: 'Unauthenticated Write',
    collection: 'production_logs',
    docId: 'log_01',
    operation: 'create',
    payload: { machineId: 'sec_01', quantityGood: 10 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Identity Spoofing on Create',
    collection: 'machines',
    docId: 'sec_01',
    operation: 'create',
    payload: { ownerId: 'spoofed_uid_999' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Create',
    collection: 'machines',
    docId: 'sec_01',
    operation: 'create',
    payload: { isSuperAdmin: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow Field Injection on Update',
    collection: 'machines',
    docId: 'sec_01',
    operation: 'update',
    payload: { hacked: 'yes' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Sector Enum Bypass',
    collection: 'machines',
    docId: 'sec_01',
    operation: 'create',
    payload: { sector: 'INVALID_SECTOR' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Denial of Wallet String Overflow',
    collection: 'production_logs',
    docId: 'log_02',
    operation: 'create',
    payload: { notes: 'A'.repeat(1000) },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'ID Poisoning Attack',
    collection: 'machines',
    docId: 'bad$id!name',
    operation: 'create',
    payload: {},
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Orphaned Production Log',
    collection: 'production_logs',
    docId: 'log_03',
    operation: 'create',
    payload: { machineId: 'non_existent_machine_id' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Timestamp Forgery on Create',
    collection: 'production_logs',
    docId: 'log_04',
    operation: 'create',
    payload: { createdAt: '1999-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immutable Field Tampering on Update',
    collection: 'machines',
    docId: 'sec_01',
    operation: 'update',
    payload: { ownerId: 'other_user', createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Negative Production Quantities',
    collection: 'production_logs',
    docId: 'log_05',
    operation: 'create',
    payload: { quantityGood: -10, quantityScrap: -5 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Email Spoofing Attack (unverified email)',
    collection: 'machines',
    docId: 'sec_01',
    operation: 'delete',
    expectedResult: 'PERMISSION_DENIED',
  },
];
