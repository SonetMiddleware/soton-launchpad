import { Address, beginCell, internal, toNano } from "ton";
import {
  getAccountJettonBalance,
  getAccountTimeLockAddr,
  getAccountTimeLockSoldJettonWallet,
  getLaunchpadInfo
} from "./read-state";
import { getWallet } from "./get-wallet";
import { JettonWallet } from "../test/jetton-lib/jetton-wallet";

async function claimSoldJetton(launchpadAddr: Address) {
  let { wallet, key } = await getWallet();
  const account = wallet.address;
  const launchpadState = await getLaunchpadInfo(launchpadAddr);
  const accountTimeLock = await getAccountTimeLockAddr(account, launchpadState.releaseTime);
  const accountTimeLockSoldJetton = await getAccountTimeLockSoldJettonWallet(account, launchpadState.releaseTime, launchpadState.soldJetton);
  // SOLD jetton stored at timeLock contract before release time
  const purchasedAmount = await getAccountJettonBalance(accountTimeLock, launchpadState.soldJetton);
  console.log("purchased amount is", purchasedAmount);
  const transfer = await wallet.createTransfer({
    seqno: await wallet.getSeqno(), messages: [
      internal({
        to: accountTimeLock, // invoke time lock to release
        value: toNano("0.01"),
        body: beginCell().storeAddress(accountTimeLockSoldJetton.address) // let time lock to invoke account time lock sold jetton wallet to release jetton
          .storeRef(JettonWallet.transferBody(account, purchasedAmount)).endCell()
      })
    ], secretKey: key.secretKey
  });
  await wallet.send(transfer);
}


async function ownerClaimSourceJettonOrTon(launchpadAddr: Address) {
  let { wallet, key } = await getWallet();
  const launchpadState = await getLaunchpadInfo(launchpadAddr);
  console.log("receive source is", launchpadState.received);
  const transfer = await wallet.createTransfer({
    seqno: await wallet.getSeqno(), messages: [
      internal({
        to: launchpadAddr,
        value: toNano("0.1"),
        body: beginCell()
          .storeUint(1, 32) // op
          .storeUint(0, 64) // query id
          .endCell()
      })
    ], secretKey: key.secretKey
  });
  await wallet.send(transfer);
}

async function ownerClaimUnsoldJetton(launchpadAddr: Address) {
  let { wallet, key } = await getWallet();
  const launchpadState = await getLaunchpadInfo(launchpadAddr);
  const launchpadSoldJettonWalletBalance = await getAccountJettonBalance(launchpadAddr, launchpadState.soldJetton);
  console.log("unsold jetton is", launchpadSoldJettonWalletBalance);
  const transfer = await wallet.createTransfer({
    seqno: await wallet.getSeqno(), messages: [
      internal({
        to: launchpadAddr,
        value: toNano("0.1"),
        body: beginCell()
          .storeUint(2, 32) // op
          .storeUint(0, 64) // query id
          .storeUint(launchpadSoldJettonWalletBalance, 64)
          .endCell()
      })
    ], secretKey: key.secretKey
  });
  await wallet.send(transfer);
}

ownerClaimUnsoldJetton(Address.parse("EQBazzDVtlUAyrsy-ReCC_7zMbpO8H0TRqxwgXnfO9cUZbDn")).then(() => process.exit(0)).catch(e => {
  console.log(e);
  process.exit(1);
});
