# soton-launchpad

TON Launchpad(for test only)

## TODO

- each test file can succeed when run separately, but it will fail when run in one command
  - comment all content of [ido.spec.ts](./test/ido.spec.ts) and [testnet.spec.ts](./test/testnet.spec.ts)
  - run `npm run test`, all case in [ton-ido.spec.ts] will success

## Deployed At Testnet

### Jetton

- kQBajc2rmhof5AR-99pfLmoUlV3Nzcle6P_Mc_KnacsViccN(SOURCE)
- EQAjJTzAyKOHuyTpqcLLgNdTdJcbRfmxm9kNCJvvESADqwHK(SOLD)

## Implementation

- Use TON or specified source Jetton to buy sold Jetton
- Sold jetton would send to Time Lock contract after you paid
- After release time, deploy your Time Lock contract, then claim your token at Time Lock contract, you would receive
  purchased token.
