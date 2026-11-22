---- MODULE SyncProtocol ----
EXTENDS Naturals, FiniteSets

CONSTANTS
  Devices,      \* e.g. {"d1", "d2"}
  Dates,        \* e.g. {"day1", "day2"}
  Flows,        \* e.g. {"None", "Bleeding"} (subset of null | Spotting | Bleeding)
  MaxEdits,     \* Total local edits allowed across all devices
  MaxRetries    \* 409 conflict retries per syncVault call (1 in current code)

FlowRank(f) ==
  CASE f = "None"     -> 0
    [] f = "Spotting" -> 1
    [] f = "Bleeding" -> 2

\* Mirrors pickEntry in packages/sync/src/snapshot.ts
PickEntry(a, b) ==
  IF a.ts # b.ts
    THEN IF a.ts > b.ts THEN a ELSE b
    ELSE IF FlowRank(a.flow) >= FlowRank(b.flow) THEN a ELSE b

\* Mirrors mergeSnapshots in packages/sync/src/snapshot.ts
Merge(s1, s2) ==
  [day \in Dates |-> PickEntry(s1[day], s2[day])]

EmptySnap ==
  [day \in Dates |-> [flow |-> "None", ts |-> 0]]

MaxTs(snap) ==
  LET s == {snap[day].ts : day \in Dates}
  IN CHOOSE m \in s : \A x \in s : m >= x

VARIABLES
  serverVer,      \* vaults.version in D1 (0 = 404 not created yet)
  serverSnap,     \* decrypted vaults.ciphertext in D1
  localSnap,      \* [Devices -> Snap] model.vault on each device
  pc,             \* [Devices -> {"idle", "fetched", "retry_wait", "error"}]
  inflightSnap,   \* [Devices -> Snap] snapshot being PUT by syncVault
  expectedVer,    \* [Devices -> Nat] expectedVersion for next PUT
  retries,        \* [Devices -> 0..MaxRetries] 409 retries used in current sync
  pending,        \* [Devices -> BOOLEAN] pendingRef in apps/web/src/app.tsx
  editsLeft,      \* Remaining local edit budget
  clock,          \* Monotonic wall clock proxy
  allEdits,       \* Ghost variable: LWW merge of every LocalEdit ever saved
  committedEdits  \* Ghost variable: LWW merge of every snapshot accepted by the server

vars == <<serverVer, serverSnap, localSnap, pc, inflightSnap, expectedVer, retries, pending, editsLeft, clock, allEdits, committedEdits>>

Init ==
  /\ serverVer = 0
  /\ serverSnap = EmptySnap
  /\ localSnap = [d \in Devices |-> EmptySnap]
  /\ pc = [d \in Devices |-> "idle"]
  /\ inflightSnap = [d \in Devices |-> EmptySnap]
  /\ expectedVer = [d \in Devices |-> 0]
  /\ retries = [d \in Devices |-> 0]
  /\ pending = [d \in Devices |-> FALSE]
  /\ editsLeft = MaxEdits
  /\ clock = 0
  /\ allEdits = EmptySnap
  /\ committedEdits = EmptySnap

\* Device d saves a local edit (SavedEditing -> applyLogsDiff in apps/web/src/state.ts, packages/sync/src/snapshot.ts)
LocalEdit(d, day, flow) ==
  /\ editsLeft > 0
  /\ flow # localSnap[d][day].flow
  /\ LET nextTs == IF clock + 1 > MaxTs(localSnap[d]) + 1
                     THEN clock + 1
                     ELSE MaxTs(localSnap[d]) + 1
         newEntry == [flow |-> flow, ts |-> nextTs]
         newLocal == [localSnap[d] EXCEPT ![day] = newEntry]
     IN /\ localSnap' = [localSnap EXCEPT ![d] = newLocal]
        /\ allEdits' = Merge(allEdits, [EmptySnap EXCEPT ![day] = newEntry])
        /\ clock' = nextTs
        /\ editsLeft' = editsLeft - 1
        /\ pending' = IF pc[d] = "fetched"
                        THEN [pending EXCEPT ![d] = TRUE]
                        ELSE pending
        /\ UNCHANGED <<serverVer, serverSnap, pc, inflightSnap, expectedVer, retries, committedEdits>>

\* Device d starts syncVault and finishes GET /api/sync (packages/sync/src/client.ts:193-250)
StartSyncGet(d) ==
  /\ pc[d] \in {"idle", "retry_wait"}
  /\ (localSnap[d] # serverSnap \/ pending[d] \/ pc[d] = "retry_wait")
  /\ LET merged == IF serverVer = 0
                     THEN localSnap[d]
                     ELSE Merge(localSnap[d], serverSnap)
     IN IF serverVer > 0 /\ merged = serverSnap
          THEN \* Remote already has everything; no PUT needed (pushed: false)
               /\ localSnap' = [localSnap EXCEPT ![d] = Merge(localSnap[d], merged)]
               /\ pc' = [pc EXCEPT ![d] = "idle"]
               /\ pending' = [pending EXCEPT ![d] = FALSE]
               /\ UNCHANGED <<serverVer, serverSnap, inflightSnap, expectedVer, retries, editsLeft, clock, allEdits, committedEdits>>
          ELSE \* Need to PUT merged snapshot with expectedVersion = serverVer
               /\ pc' = [pc EXCEPT ![d] = "fetched"]
               /\ inflightSnap' = [inflightSnap EXCEPT ![d] = merged]
               /\ expectedVer' = [expectedVer EXCEPT ![d] = serverVer]
               /\ retries' = [retries EXCEPT ![d] = 0]
               /\ pending' = [pending EXCEPT ![d] = FALSE]
               /\ UNCHANGED <<serverVer, serverSnap, localSnap, editsLeft, clock, allEdits, committedEdits>>

\* Device d's PUT /api/sync succeeds (apps/api/src/worker.ts:241-280, packages/sync/src/client.ts:242-244)
SyncPutSuccess(d) ==
  /\ pc[d] = "fetched"
  /\ expectedVer[d] = serverVer
  /\ serverVer' = serverVer + 1
  /\ serverSnap' = inflightSnap[d]
  /\ committedEdits' = Merge(committedEdits, inflightSnap[d])
  /\ localSnap' = [localSnap EXCEPT ![d] = Merge(localSnap[d], inflightSnap[d])]
  /\ pc' = [pc EXCEPT ![d] = "idle"]
  /\ inflightSnap' = [inflightSnap EXCEPT ![d] = EmptySnap]
  /\ expectedVer' = [expectedVer EXCEPT ![d] = 0]
  /\ retries' = [retries EXCEPT ![d] = 0]
  /\ UNCHANGED <<pending, editsLeft, clock, allEdits>>

\* Device d's PUT /api/sync hits 409 Conflict (apps/api/src/worker.ts:262-265 / 288-291, packages/sync/src/client.ts:246-275)
SyncPutConflict(d) ==
  /\ pc[d] = "fetched"
  /\ expectedVer[d] # serverVer
  /\ IF retries[d] < MaxRetries
       THEN LET remerged == Merge(inflightSnap[d], serverSnap)
            IN IF remerged = serverSnap
                 THEN \* Latest remote already includes our changes (client.ts:252-258)
                      /\ localSnap' = [localSnap EXCEPT ![d] = Merge(localSnap[d], remerged)]
                      /\ pc' = [pc EXCEPT ![d] = "idle"]
                      /\ inflightSnap' = [inflightSnap EXCEPT ![d] = EmptySnap]
                      /\ expectedVer' = [expectedVer EXCEPT ![d] = 0]
                      /\ retries' = [retries EXCEPT ![d] = 0]
                      /\ UNCHANGED <<serverVer, serverSnap, pending, editsLeft, clock, allEdits, committedEdits>>
                 ELSE \* Re-encrypt and retry PUT against latest serverVer
                      /\ inflightSnap' = [inflightSnap EXCEPT ![d] = remerged]
                      /\ expectedVer' = [expectedVer EXCEPT ![d] = serverVer]
                      /\ retries' = [retries EXCEPT ![d] = retries[d] + 1]
                      /\ UNCHANGED <<serverVer, serverSnap, localSnap, pc, pending, editsLeft, clock, allEdits, committedEdits>>
       ELSE \* Exhausted inner MaxRetries -> silent background retry (app.tsx retryTimerRef)
            /\ pc' = [pc EXCEPT ![d] = "retry_wait"]
            /\ inflightSnap' = [inflightSnap EXCEPT ![d] = EmptySnap]
            /\ expectedVer' = [expectedVer EXCEPT ![d] = 0]
            /\ retries' = [retries EXCEPT ![d] = 0]
            /\ UNCHANGED <<serverVer, serverSnap, localSnap, pending, editsLeft, clock, allEdits, committedEdits>>

\* Valid terminal state: no edits left and every device is synced or errored
Done ==
  /\ editsLeft = 0
  /\ \A d \in Devices :
       \/ (pc[d] = "idle" /\ localSnap[d] = serverSnap /\ ~pending[d])
       \/ pc[d] = "error"
  /\ UNCHANGED vars

Next ==
  \/ \E d \in Devices, day \in Dates, flow \in Flows : LocalEdit(d, day, flow)
  \/ \E d \in Devices : StartSyncGet(d)
  \/ \E d \in Devices : SyncPutSuccess(d)
  \/ \E d \in Devices : SyncPutConflict(d)
  \/ Done

\* --- Invariants ---

\* 1. Conflicts must resolve automatically without surfacing SyncConflictError.
NoConflictError ==
  \A d \in Devices : pc[d] # "error"

\* 2. Once the server accepts an edit, no later PUT ever overwrites or loses it.
ServerNeverRegresses ==
  serverSnap = committedEdits

\* 3. Once all edits are done and every device has finished syncing,
\*    every device and the server converge to the exact LWW merge of all edits.
NoLostEditsOnConvergence ==
  (editsLeft = 0 /\ \A d \in Devices : pc[d] = "idle" /\ ~pending[d] /\ localSnap[d] = serverSnap)
    => (serverSnap = allEdits /\ \A d \in Devices : localSnap[d] = allEdits)

\* 4. The server never stores an entry newer than what was actually edited.
ServerSound ==
  Merge(serverSnap, allEdits) = allEdits

====
