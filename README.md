# PolicyDrift Monitor

PolicyDrift Monitor is a GenLayer project app for the deployed `PolicyDriftSentinel` Intelligent Contract.

The app connects a browser wallet to GenLayer Studionet, writes `check_policy(current_excerpt)` to the deployed contract, reads `get_watch()` and `get_latest_check()` through GenLayerJS, and links users to the contract and transaction evidence in Explorer.

## Live Contract

- Contract: `0x37379a1dd17b853f62ecb587a4b94533bd967e4E`
- Explorer: `https://explorer-studio.genlayer.com/address/0x37379a1dd17b853f62ecb587a4b94533bd967e4E`
- Network: GenLayer Studionet `61999`

## Why This Qualifies As a Project

- The frontend directly calls the deployed GenLayer contract.
- Wallet flow switches or adds GenLayer Studionet before writes.
- The primary action submits a real `check_policy(current_excerpt)` transaction.
- Read panels query accepted contract state and render the latest drift report.
- Explorer links are shown for both contract and transactions.

## Local Development

```bash
npm install
npm run dev
```

## Checks

```bash
npm run check
npm test
npm run build
```
