import chai, { expect } from "chai";
import chaiBN from "chai-bn";
import BN from "bn.js";
import * as fs from "fs";
import { Address, beginCell, Cell, contractAddress, Slice, toNano } from "ton";
import { internalMessage, randomAddress, setNetworkConfig, sleep } from "./helpers";
import { JettonMinter } from "./jetton-lib/jetton-minter";
import { JETTON_MINTER_CODE, JETTON_WALLET_CODE, jettonMinterInitData } from "../build/jetton-minter.deploy";
import { JettonWallet } from "./jetton-lib/jetton-wallet";
import { WrappedSmartContract } from "./jetton-lib/wrapped-smart-contract";
import { getJWalletContract, parseJettonWalletDetails } from "./jetton-lib/jetton-utils";
import { actionToMessage } from "./jetton-lib/utils";

chai.use(chaiBN(BN));

const base = 1000000;
const op_transfer_notification = 0x7362d09c;
const op_internal_transfer = 0x178d4519;

describe("test ido", async () => {
  let timelockCode = Cell.fromBoc(fs.readFileSync("build/timelock.cell"))[0];
  let startTime = Math.floor(Date.now() / 1000);
  let duration = 2;
  let releaseTime = startTime + duration;
  let exRate = base * 2; // 1 source = 2 sold
  let sourceJetton: JettonMinter, soldJetton: JettonMinter;
  let cap = base * base;
  let received = 0;
  let owner = randomAddress("owner");
  let account1 = randomAddress("account1");
  let launchpad: WrappedSmartContract;
  let account1SourceJettonWallet: JettonWallet, launchpadSourceJettonWallet: JettonWallet, launchpadSoldJettonWallet: JettonWallet;
  let account1TimeLock: WrappedSmartContract, account1TimeLockSoldJettonWallet: JettonWallet;

  before(async () => {
    let dataCell = jettonMinterInitData(owner, {
      name: "Source Jetton",
      symbol: "SOURCE",
      description: "My Long Description".repeat(100),
    });
    sourceJetton = (await JettonMinter.create(JETTON_MINTER_CODE, dataCell)) as JettonMinter;
    account1SourceJettonWallet = await getJWalletContract(account1, sourceJetton.address);
    dataCell = jettonMinterInitData(owner, {
      name: "Sold Jetton",
      symbol: "SOLD",
      description: "My Long Description".repeat(100),
    });
    soldJetton = (await JettonMinter.create(JETTON_MINTER_CODE, dataCell)) as JettonMinter;
    dataCell = beginCell()
      .storeRef(beginCell().storeUint(startTime, 64).storeUint(duration, 64).storeUint(exRate, 64).storeUint(cap, 64).storeUint(received, 64).endCell())
      .storeAddress(sourceJetton.address)
      .storeAddress(soldJetton.address)
      .storeRef(JETTON_WALLET_CODE)
      .storeRef(timelockCode)
      .storeAddress(owner)
      .endCell();
    let codeCell = Cell.fromBoc(fs.readFileSync("build/ido.cell"))[0];
    launchpad = await WrappedSmartContract.create(codeCell, dataCell);
    account1TimeLock = await WrappedSmartContract.create(timelockCode, beginCell().storeUint(releaseTime, 64).storeAddress(account1).endCell());
    const launchpadData = await launchpad.contract.invokeGetMethod("get_info", []);
    expect(launchpadData.result[0] as bigint).to.be.eq(BigInt(startTime));
    expect(launchpadData.result[1] as bigint).to.be.eq(BigInt(duration));
    expect(launchpadData.result[2] as bigint).to.be.eq(BigInt(exRate));
    expect((launchpadData.result[3] as Slice).loadAddress().toString()).to.be.eq(sourceJetton.address.toString());
    expect((launchpadData.result[4] as Slice).loadAddress().toString()).to.be.eq(soldJetton.address.toString());
    expect(launchpadData.result[5] as bigint).to.be.eq(BigInt(cap));
    expect(launchpadData.result[6] as bigint).to.be.eq(BigInt(received));
    expect((launchpadData.result[7] as Cell).toBoc().toString("hex")).to.be.eq(JETTON_WALLET_CODE.toBoc().toString("hex"));
    expect((launchpadData.result[8] as Cell).toBoc().toString("hex")).to.be.eq(timelockCode.toBoc().toString("hex"));
    expect((launchpadData.result[9] as Slice).loadAddress().toString()).to.be.eq(owner.toString());
  });
  it("prepare Jetton", async () => {
    // mint source Jetton
    const { actionList: actionList1 } = await sourceJetton.contract.sendInternalMessage(
      internalMessage({
        from: owner,
        body: JettonMinter.mintBody(account1, cap * 2),
      })
    );
    await account1SourceJettonWallet.contract.sendInternalMessage(actionToMessage(sourceJetton.address, actionList1[0]));
    const { balance: balance1 } = await parseJettonWalletDetails(await account1SourceJettonWallet.contract.invokeGetMethod("get_wallet_data", []));
    expect(balance1).to.be.eq(BigInt(cap * 2));
    // mint sold Jetton to launchpad
    const { actionList: actionList2 } = await soldJetton.contract.sendInternalMessage(
      internalMessage({
        from: owner,
        body: JettonMinter.mintBody(launchpad.address, (cap * exRate) / base),
      })
    );
    launchpadSoldJettonWallet = await getJWalletContract(launchpad.address, soldJetton.address);
    await launchpadSoldJettonWallet.contract.sendInternalMessage(actionToMessage(soldJetton.address, actionList2[0]));
    const { balance: balance2 } = await parseJettonWalletDetails(await launchpadSoldJettonWallet.contract.invokeGetMethod("get_wallet_data", []));
    expect(balance2).to.be.eq(BigInt((cap * exRate) / base));
  });
  it("participate", async () => {
    // account1 transfer soma SourceJetton to launchpad
    const res = await account1SourceJettonWallet.contract.sendInternalMessage(
      internalMessage({
        from: account1,
        body: JettonWallet.transferBody(launchpad.address, base, toNano("0.5")),
        value: toNano("1"),
      })
    );
    // launchpad wallet receive source jetton
    launchpadSourceJettonWallet = await getJWalletContract(launchpad.address, sourceJetton.address);
    const res1 = await launchpadSourceJettonWallet.contract.sendInternalMessage(actionToMessage(account1SourceJettonWallet.address, res.actionList[0]));
    const { balance, owner: _launchpad } = parseJettonWalletDetails(await launchpadSourceJettonWallet.contract.invokeGetMethod("get_wallet_data", []));
    expect(balance).to.be.eq(BigInt(base));
    expect(_launchpad.toString()).to.be.eq(launchpad.address.toString());

    const launchpadWalletInfo = await launchpad.contract.invokeGetMethod("get_jetton_wallet_addr", []);
    expect((launchpadWalletInfo.result[0] as Slice).loadAddress().toString()).to.be.eq(launchpadSourceJettonWallet.address.toString());
    // launchpad source jetton wallet notice launchpad received
    const res2 = await launchpad.contract.sendInternalMessage(actionToMessage(launchpadSourceJettonWallet.address, res1.actionList[0]));
    // launchpad notice launchpad sold jetton wallet transfer token
    const res3 = await launchpadSoldJettonWallet.contract.sendInternalMessage(actionToMessage(launchpad.address, res2.actionList[0]));
    // account1 timelock sold jetton wallet received sold token
    account1TimeLockSoldJettonWallet = await getJWalletContract(account1TimeLock.address, soldJetton.address);
    await account1TimeLockSoldJettonWallet.contract.sendInternalMessage(actionToMessage(launchpadSoldJettonWallet.address, res3.actionList[0]));

    const { balance: soldJBalance } = await parseJettonWalletDetails(await launchpadSoldJettonWallet.contract.invokeGetMethod("get_wallet_data", []));
    expect(soldJBalance).to.be.eq(BigInt(((cap - base) * exRate) / base));

    const { balance: accountBalance } = await parseJettonWalletDetails(await account1TimeLockSoldJettonWallet.contract.invokeGetMethod("get_wallet_data", []));
    expect(accountBalance).to.be.eq(BigInt((base * exRate) / base));
    const launchpadData = await launchpad.contract.invokeGetMethod("get_info", []);
    const received = launchpadData.result[6] as bigint;
    expect(received).to.be.eq(BigInt(base));
  });
  it("refund when participated amount exceeds cap", async () => {
    // account1 transfer soma SourceJetton to launchpad
    const res = await account1SourceJettonWallet.contract.sendInternalMessage(
      internalMessage({
        from: account1,
        body: JettonWallet.transferBody(launchpad.address, cap, toNano("0.1")),
        value: toNano("1"),
      })
    );
    const res1 = await launchpadSourceJettonWallet.contract.sendInternalMessage(actionToMessage(account1SourceJettonWallet.address, res.actionList[0]));
    const res2 = await launchpad.contract.sendInternalMessage(actionToMessage(launchpadSourceJettonWallet.address, res1.actionList[0]));
    // launchpadSourceJettonWallet execute refund
    const res3 = await launchpadSourceJettonWallet.contract.sendInternalMessage(actionToMessage(launchpad.address, res2.actionList[0]));
    // refund to account1SourceJettonWallet
    await account1SourceJettonWallet.contract.sendInternalMessage(actionToMessage(launchpadSourceJettonWallet.address, res3.actionList[0]));
    const { balance } = parseJettonWalletDetails(await launchpadSourceJettonWallet.contract.invokeGetMethod("get_wallet_data", []));
    // balance not changed
    expect(balance).to.be.eq(BigInt(base));
  });
  it("refund when participating after end time", async () => {
    for (;;) {
      await sleep(1000);
      if (Date.now() / 1000 > releaseTime) {
        await sleep(1000);
        break;
      }
    }
    // account1 transfer soma SourceJetton to launchpad
    const res = await account1SourceJettonWallet.contract.sendInternalMessage(
      internalMessage({
        from: account1,
        body: JettonWallet.transferBody(launchpad.address, base, toNano("0.1")),
        value: toNano("1"),
      })
    );
    const res1 = await launchpadSourceJettonWallet.contract.sendInternalMessage(actionToMessage(account1SourceJettonWallet.address, res.actionList[0]));
    const res2 = await launchpad.contract.sendInternalMessage(actionToMessage(launchpadSourceJettonWallet.address, res1.actionList[0]));
    // launchpadSourceJettonWallet execute refund
    const res3 = await launchpadSourceJettonWallet.contract.sendInternalMessage(actionToMessage(launchpad.address, res2.actionList[0]));
    // refund to account1SourceJettonWallet
    await account1SourceJettonWallet.contract.sendInternalMessage(actionToMessage(launchpadSourceJettonWallet.address, res3.actionList[0]));
    const { balance } = parseJettonWalletDetails(await launchpadSourceJettonWallet.contract.invokeGetMethod("get_wallet_data", []));
    // balance not changed
    expect(balance).to.be.eq(BigInt(base));
  });
  it("claim sold Jetton", async () => {
    const acc1SoldJettonWallet = await getJWalletContract(account1, soldJetton.address);
    const { balance: balanceBefore } = parseJettonWalletDetails(await acc1SoldJettonWallet.contract.invokeGetMethod("get_wallet_data", []));
    expect(balanceBefore).to.be.eq(BigInt(0));
    const res = await account1TimeLock.contract.sendInternalMessage(
      internalMessage({
        from: account1,
        value: toNano(1),
        body: beginCell().storeAddress(account1TimeLockSoldJettonWallet.address).storeRef(JettonWallet.transferBody(account1, base)).endCell(),
      })
    );
    const res1 = await account1TimeLockSoldJettonWallet.contract.sendInternalMessage(actionToMessage(account1TimeLock.address, res.actionList[0]));
    await acc1SoldJettonWallet.contract.sendInternalMessage(actionToMessage(account1TimeLockSoldJettonWallet.address, res1.actionList[0]));
    const { balance } = parseJettonWalletDetails(await acc1SoldJettonWallet.contract.invokeGetMethod("get_wallet_data", []));
    expect(balance).to.be.eq(BigInt(base));
  });
  it("owner claim source Jetton", async () => {
    const { balance: balanceBefore } = parseJettonWalletDetails(await launchpadSourceJettonWallet.contract.invokeGetMethod("get_wallet_data", []));
    const res = await launchpad.contract.sendInternalMessage(
      internalMessage({
        from: owner,
        value: toNano("1"),
        body: beginCell()
          .storeUint(1, 32) // op
          .storeUint(0, 64) // query id
          .endCell(),
      })
    );
    await launchpadSourceJettonWallet.contract.sendInternalMessage(actionToMessage(launchpad.address, res.actionList[0]));
    const { balance: balanceAfter } = parseJettonWalletDetails(await launchpadSourceJettonWallet.contract.invokeGetMethod("get_wallet_data", []));
    expect(balanceBefore - balanceAfter).to.be.eq(BigInt(base));
    expect(balanceAfter).to.be.eq(BigInt(0));
  });
  it("owner claim unsold Jetton", async () => {
    const { balance: balanceBefore } = parseJettonWalletDetails(await launchpadSoldJettonWallet.contract.invokeGetMethod("get_wallet_data", []));
    expect(balanceBefore).to.be.eq(BigInt(((cap - base) * exRate) / base));
    const res = await launchpad.contract.sendInternalMessage(
      internalMessage({
        from: owner,
        value: toNano("1"),
        body: beginCell()
          .storeUint(2, 32) // op
          .storeUint(0, 64) // query id
          .storeUint(balanceBefore, 64)
          .endCell(),
      })
    );
    await launchpadSoldJettonWallet.contract.sendInternalMessage(actionToMessage(launchpad.address, res.actionList[0]));
    const { balance: balanceAfter } = parseJettonWalletDetails(await launchpadSoldJettonWallet.contract.invokeGetMethod("get_wallet_data", []));
    expect(balanceAfter).to.be.eq(BigInt(0));
  });
});
