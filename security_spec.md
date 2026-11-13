# Security Specification — Multilinea MES

## 1. Data Invariants
1. **Global Deny by Default**: Any path not explicitly matched in `/machines/{machineId}`, `/catalog_parts/{partId}`, or `/production_logs/{logId}` is unconditionally denied.
2. **Authentication & Verification**: All operations require an authenticated session (`request.auth != null`). Admin operations verify either the bootstrapped factory email (`multilineaindustriademoveis@gmail.com` with `email_verified == true`) or ownership (`ownerId == request.auth.uid`).
3. **Path Variable Hardening**: Every single-document target operation (`get`, `create`, `update`, `delete`) enforces `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).
4. **Strict Schema & Key Allowlisting**:
   - `machines`: Only allowed keys `['name', 'sector', 'username', 'accessPin', 'status', 'currentProduct', 'currentPart', 'currentPartCode', 'currentBatch', 'ownerId', 'createdAt', 'updatedAt']`.
   - `catalog_parts`: Only allowed keys `['productName', 'partName', 'partCode', 'defaultBatch', 'targetQuantity', 'dimensions', 'ownerId', 'createdAt']`.
   - `production_logs`: Only allowed keys `['machineId', 'machineName', 'machineUsername', 'sector', 'productName', 'partName', 'partCode', 'batchNumber', 'quantityGood', 'quantityScrap', 'operatorName', 'shift', 'notes', 'ownerId', 'createdAt']`.
5. **Relational Consistency**: Creating a `ProductionLog` requires `exists(/databases/$(database)/documents/machines/$(incoming().machineId))` to guarantee no orphaned production logs can be injected for non-existent machines.
6. **Temporal & Identity Immutability**: `createdAt == request.time` on creation; `updatedAt == request.time` on updates; `ownerId` and `createdAt` are strictly immutable during updates.

## 2. The "Dirty Dozen" Payloads

1. **Unauthenticated Write**: Creating a `production_logs` document with `request.auth == null`.
2. **Identity Spoofing on Create**: Creating a `machines` document where `ownerId != request.auth.uid`.
3. **Shadow Field Injection on Create**: Creating a `machines` document with an extra ghost key `"isSuperAdmin": true`.
4. **Shadow Field Injection on Update**: Updating a `machines` document with an extra key `"hacked": "yes"`.
5. **Sector Enum Bypass**: Creating a `machines` document with `sector: "EMBALAGEM_INVALIDA"`.
6. **Denial of Wallet String Overflow**: Creating a `production_logs` document with a 50,000-character `notes` string (exceeding `maxLength: 250`).
7. **ID Poisoning Attack**: Creating a document at `/machines/invalid$id!with*spaces` that violates `^[a-zA-Z0-9_\-]+$`.
8. **Orphaned Production Log**: Creating a `production_logs` entry referencing a `machineId` that does not exist in `/machines/{machineId}`.
9. **Timestamp Forgery on Create**: Creating a `production_logs` entry with a past or future client-supplied `createdAt` instead of `request.time`.
10. **Immutable Field Tampering on Update**: Updating a `machines` document and mutating `ownerId` or `createdAt`.
11. **Negative Production Quantities**: Creating a `production_logs` entry with `quantityGood: -50` or `quantityScrap: -10`.
12. **Email Spoofing Attack**: Attempting admin action with `email == 'multilineaindustriademoveis@gmail.com'` but `email_verified == false`.
