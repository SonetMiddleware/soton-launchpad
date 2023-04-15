import { getWallet } from "./get-wallet";
import { getJWalletContract } from "../test/jetton-lib/jetton-utils";
import { Address, beginCell, Cell, internal, toNano } from "ton";
import { deployLaunchPad } from "./deploy-ido";
import { internalMessage, sleep } from "../test/helpers";
import { JettonWallet } from "../test/jetton-lib/jetton-wallet";
import { WrappedSmartContract } from "../test/jetton-lib/wrapped-smart-contract";
import fs from "fs";

const base = 1000000;

async function newAndParticipateIdoByJetton() {
  let { wallet, key } = await getWallet();
  let seqBefore = await wallet.getSeqno();
  let sourceJettonAddr = Address.parse("kQBajc2rmhof5AR-99pfLmoUlV3Nzcle6P_Mc_KnacsViccN");
  let sourceJettonWallet = await getJWalletContract(wallet.address, sourceJettonAddr);
  let soldJettonAddr = Address.parse("EQAjJTzAyKOHuyTpqcLLgNdTdJcbRfmxm9kNCJvvESADqwHK");
  let soldJettonWallet = await getJWalletContract(wallet.address, soldJettonAddr);
  console.log("sourceJettonWallet, %s", sourceJettonWallet.address);
  console.log("soldJettonWallet, %s", soldJettonWallet.address);
  let releaseTime = Math.ceil(Date.now() / 1000 + 5 * 60);
  let cap = toNano("10");
  const owner = wallet.address;
  const exRate = base * 2; // 1 SOURCE = 2 SOLD
  let launchpad = await deployLaunchPad(releaseTime, cap, owner, exRate, soldJettonAddr, sourceJettonAddr);
  let seqCurrent;
  for (; ;) {
    await sleep(2000);
    seqCurrent = await wallet.getSeqno();
    if (seqCurrent > seqBefore) {
      break;
    }
  }
  console.log("deploy launchpad, %s", launchpad.address);
  // send sold Jetton to launchpad
  const soldAmount = cap * BigInt(exRate) / BigInt(base);
  const transfer = await wallet.createTransfer({
    seqno: seqCurrent, messages: [
      internal({
        to: soldJettonWallet.address,
        value: toNano("0.2"),
        body: JettonWallet.transferBody(launchpad.address, soldAmount)
      })
    ], secretKey: key.secretKey
  });
  await wallet.send(transfer);
  console.log("send sold Jetton to launchpad");
  seqBefore = seqCurrent;
  for (; ;) {
    await sleep(2000);
    seqCurrent = await wallet.getSeqno();
    if (seqCurrent > seqBefore) {
      break;
    }
  }

  // participate
  // transfer source Jetton to launchpad: invoke source jetton wallet contract
  const amount = toNano("1"); // buy with 1 source, decimal is 9
  const transfer1 = await wallet.createTransfer({
    seqno: await wallet.getSeqno(), messages: [
      internal({
        to: sourceJettonWallet.address,
        value: toNano("0.25"),
        // pass forward amount > 0 so that launchpad could receive transfer notification
        // forward amount should be less than value
        body: JettonWallet.transferBody(launchpad.address, amount, toNano("0.2"))
      })
    ], secretKey: key.secretKey
  });
  await wallet.send(transfer1);
  console.log("buy with 1 source");
}

async function newAndParticipateIdoByTON() {
  let { wallet, key } = await getWallet();
  let seqBefore = await wallet.getSeqno();
  let soldJettonAddr = Address.parse("EQAjJTzAyKOHuyTpqcLLgNdTdJcbRfmxm9kNCJvvESADqwHK");
  let soldJettonWallet = await getJWalletContract(wallet.address, soldJettonAddr);
  console.log("soldJettonWallet, %s", soldJettonWallet.address);
  let releaseTime = Math.ceil(Date.now() / 1000 + 5 * 60);
  let cap = toNano("10");
  const owner = wallet.address;
  const exRate = base * 2; // 1 SOURCE = 2 SOLD
  // sourceJetton is undefined, so IDO is use TON
  let launchpad = await deployLaunchPad(releaseTime, cap, owner, exRate, soldJettonAddr, undefined);
  console.log("deploy launchpad, %s", launchpad.address);
  let seqCurrent;
  for (; ;) {
    await sleep(2000);
    seqCurrent = await wallet.getSeqno();
    if (seqCurrent > seqBefore) {
      break;
    }
  }
  // send sold Jetton to launchpad
  const soldAmount = cap * BigInt(exRate) / BigInt(base);
  const transfer = await wallet.createTransfer({
    seqno: seqCurrent, messages: [
      internal({
        to: soldJettonWallet.address,
        value: toNano("0.1"),
        body: JettonWallet.transferBody(launchpad.address, soldAmount)
      })
    ], secretKey: key.secretKey
  });
  await wallet.send(transfer);
  seqBefore = seqCurrent;
  for (; ;) {
    await sleep(2000);
    seqCurrent = await wallet.getSeqno();
    if (seqCurrent > seqBefore) {
      break;
    }
  }
  console.log("send sold Jetton to launchpad");

  // participate
  // transfer TON to launchpad straightly without body
  const transfer1 = await wallet.createTransfer({
    seqno: seqCurrent, messages: [
      internal({
        to: launchpad.address,
        value: toNano("1") // buy with 0.1 TON
      })
    ], secretKey: key.secretKey
  });
  await wallet.send(transfer1);
  console.log("buy with 1 TON");
}

newAndParticipateIdoByTON().then(() => process.exit(0)).catch(e => console.log(e));
