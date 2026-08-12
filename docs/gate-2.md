# Gate 2 proof — forced mismatch blocks the retry

Run 2026-08-10 via `pnpm --filter agent gate-2 --execute`. One real broadcast;
the platform's reported status was then overridden to `failed` (chaos
injection, recorded on the attempt's trigger) to force the known
reported-failure condition. Every value below is from the live run — ledger
rows read back from Neon, receipt fetched from an independent RPC.

## The one transaction

| Field | Value |
| --- | --- |
| Task | `gate2-1786374829962` |
| Intent | `148b1b39-d47b-4bab-8312-7a7cfd8e9385` |
| Execution ID | `zb9d35zt4dttqeppik7j0` |
| Transaction hash | `0x03097aae2ae69c623c1e77dcd0546a4321a383d6896a971fe4700d881dc127e7` |
| Explorer | <https://sepolia.basescan.org/tx/0x03097aae2ae69c623c1e77dcd0546a4321a383d6896a971fe4700d881dc127e7> |
| Independent receipt | `success`, block 45303274 |

## The discrepancy row (`discrepancies` table)

| Field | Value |
| --- | --- |
| id | `21feed41-7d43-443e-bd7e-0f9af1543e99` |
| kind | `reported_failed_chain_success` |
| reported_status | `failed` (injected) |
| verified_status | `success` |

## The refusal

A second attempt at the same intent threw before any network call:

```
RetryBlockedError: Retry blocked for intent 148b1b39-d47b-4bab-8312-7a7cfd8e9385:
reported_failed_chain_success: reported=failed chain=success
```

Ledger state after the run: intent `blocked`, `retry_blocked = true`, exactly
**one** attempt row, **one** receipt, **one** discrepancy. One transaction,
not two — the double-spend defence holds.
