import chai, {expect} from "chai";
import chaiBN from "chai-bn";
import BN from "bn.js";
import * as fs from "fs";
import {Address, beginCell, Cell, contractAddress, Slice, toNano} from "ton";
import {internalMessage, randomAddress, setNetworkConfig, sleep} from "./helpers";
import {JettonMinter} from "./jetton-lib/jetton-minter";
import {JETTON_MINTER_CODE, JETTON_WALLET_CODE, jettonMinterInitData} from "../build/jetton-minter.deploy";
import {JettonWallet} from "./jetton-lib/jetton-wallet";
import {WrappedSmartContract} from "./jetton-lib/wrapped-smart-contract";
import {parseJettonWalletDetails} from "./jetton-lib/jetton-utils";
import {actionToMessage} from "./jetton-lib/utils";

chai.use(chaiBN(BN));

const base = 1000000;

const getJWalletContract = async (
  walletOwnerAddress: Address,
  jettonMasterAddress: Address
): Promise<JettonWallet> =>
  await JettonWallet.create(
    JETTON_WALLET_CODE,
    beginCell()
      .storeCoins(0)
      .storeAddress(walletOwnerAddress)
      .storeAddress(jettonMasterAddress)
      .storeRef(JETTON_WALLET_CODE)
      .endCell()
  );

describe('test ido', async () => {
  let timelockCode = Cell.fromBoc(fs.readFileSync("build/timelock.cell"))[0];
  let releaseTime = Math.floor(Date.now() / 1000 + 10);
  let exRate = base * 2; // 1 source = 2 sold
  let sourceJetton: JettonMinter, soldJetton: JettonMinter;
  let cap = base * base;
  let received = 0;
  let owner = randomAddress('owner');
  let account1 = randomAddress('account1');
  let launchpad: WrappedSmartContract;
  let account1SourceJettonWallet: JettonWallet, launchpadSourceJettonWallet: JettonWallet,
    launchpadSoldJettonWallet: JettonWallet;
  let account1TimeLock: WrappedSmartContract, account1TimeLockSoldJettonWallet: JettonWallet;

  before(async () => {
    let dataCell = jettonMinterInitData(owner, {
      name: "Source Jetton",
      symbol: "SOURCE",
      description: "My Long Description".repeat(100)
    });
    sourceJetton = (await JettonMinter.create(JETTON_MINTER_CODE, dataCell)) as JettonMinter;
    account1SourceJettonWallet = await getJWalletContract(account1, sourceJetton.address);
    dataCell = jettonMinterInitData(owner, {
      name: "Sold Jetton",
      symbol: "SOLD",
      description: "My Long Description".repeat(100)
    });
    soldJetton = (await JettonMinter.create(JETTON_MINTER_CODE, dataCell)) as JettonMinter;
    dataCell =
      beginCell()
        .storeUint(releaseTime, 64)
        .storeUint(exRate, 64)
        .storeAddress(sourceJetton.address)
        .storeAddress(soldJetton.address)
        .storeUint(cap, 64)
        .storeUint(received, 64)
        .storeRef(JETTON_WALLET_CODE)
        .storeRef(timelockCode)
        .storeAddress(owner)
        .endCell();
    let codeCell = Cell.fromBoc(fs.readFileSync("build/ido.cell"))[0];
    launchpad = await WrappedSmartContract.create(codeCell, dataCell);
    account1TimeLock = await WrappedSmartContract.create(timelockCode,
      beginCell().storeUint(releaseTime, 64).storeAddress(account1).endCell());
    setNetworkConfig(sourceJetton);
    setNetworkConfig(soldJetton);
    setNetworkConfig(launchpad);
    setNetworkConfig(account1TimeLock);
  });
  it('prepare Jetton', async () => {
    // mint source Jetton
    const {actionList: actionList1} = await sourceJetton.contract.sendInternalMessage(
      internalMessage({
        from: owner,
        body: JettonMinter.mintBody(account1, cap),
      })
    );
    await account1SourceJettonWallet.contract.sendInternalMessage(
      actionToMessage(sourceJetton.address, actionList1[0])
    );
    const {balance: balance1} = await parseJettonWalletDetails(
      await account1SourceJettonWallet.contract.invokeGetMethod("get_wallet_data", [])
    )
    expect(balance1).to.be.eq(BigInt(cap));
    // create launchpad contract
    await launchpad.contract.sendInternalMessage(internalMessage({
      from: owner,
      value: toNano(1)
    }));
    // mint sold Jetton to launchpad
    const {actionList: actionList2} = await soldJetton.contract.sendInternalMessage(
      internalMessage({
        from: owner,
        body: JettonMinter.mintBody(launchpad.address, cap * exRate / base),
      })
    );
    launchpadSoldJettonWallet = await getJWalletContract(launchpad.address, soldJetton.address);
    await launchpadSoldJettonWallet.contract.sendInternalMessage(
      actionToMessage(soldJetton.address, actionList2[0])
    );
    const {balance: balance2} = await parseJettonWalletDetails(
      await launchpadSoldJettonWallet.contract.invokeGetMethod("get_wallet_data", [])
    )
    expect(balance2).to.be.eq(BigInt(cap * exRate / base));
  });
  it('participate', async () => {
    // account1 transfer soma SourceJetton to launchpad
    const res = await account1SourceJettonWallet.contract.sendInternalMessage(
      internalMessage({
        from: account1,
        body: JettonWallet.transferBody(launchpad.address, base),
        value: toNano('0.031'),
      })
    );
    launchpadSourceJettonWallet = await getJWalletContract(launchpad.address, sourceJetton.address);
    await launchpadSourceJettonWallet.contract.sendInternalMessage(
      actionToMessage(account1SourceJettonWallet.address, res.actionList[0])
    );
    const {balance} = parseJettonWalletDetails(
      await launchpadSourceJettonWallet.contract.invokeGetMethod("get_wallet_data", [])
    )
    expect(balance).to.be.eq(base);
    const launchpadData = await launchpad.contract.invokeGetMethod("load_data", []);
    const received = launchpadData.result[5] as bigint;
    expect(received).to.be.eq(base);
    account1TimeLockSoldJettonWallet = await getJWalletContract(account1TimeLock.address, soldJetton.address);
    const {balance: soldJBalance} = parseJettonWalletDetails(
      await launchpadSourceJettonWallet.contract.invokeGetMethod("get_wallet_data", [])
    )
    expect(soldJBalance).to.be.eq(base * exRate / base);
  });
  it('cannot participate after end time', async () => {
    for (; ;) {
      await sleep(1000);
      if (Date.now() / 1000 > releaseTime) {
        break;
      }
    }
    // account1 transfer soma SourceJetton to launchpad
    const res = await account1SourceJettonWallet.contract.sendInternalMessage(
      internalMessage({
        from: account1,
        body: JettonWallet.transferBody(launchpad.address, base),
        value: toNano('0.031'),
      })
    );
    expect(res.type).to.be.eq('failed');
    expect(res.exit_code).to.be.eq(300);
    const {balance} = parseJettonWalletDetails(
      await launchpadSourceJettonWallet.contract.invokeGetMethod("get_wallet_data", [])
    )
    // balance not changed
    expect(balance).to.be.eq(base);
  })
  it('claim sold Jetton', async () => {
    await account1TimeLock.contract.sendInternalMessage(internalMessage({
      from: account1, value: toNano(1),
      body: beginCell().storeAddress(account1TimeLockSoldJettonWallet.address)
        .storeRef(JettonWallet.transferBody(account1, base)).endCell()
    }))
    const acc1SoldJettonWallet = await getJWalletContract(account1, soldJetton.address);
    const {balance} = parseJettonWalletDetails(
      await acc1SoldJettonWallet.contract.invokeGetMethod("get_wallet_data", [])
    )
    expect(balance).to.be.eq(base);
  });
  it('owner claim source Jetton', async () => {
    const {balance: balanceBefore} = parseJettonWalletDetails(
      await launchpadSourceJettonWallet.contract.invokeGetMethod("get_wallet_data", [])
    );
    await launchpad.contract.sendInternalMessage(internalMessage({
      from: account1, value: toNano(1),
      body: beginCell()
        .storeUint(1, 64) // op
        .storeUint(333, 64) // query id
        .endCell()
    }));
    const {balance: balanceAfter} = parseJettonWalletDetails(
      await launchpadSourceJettonWallet.contract.invokeGetMethod("get_wallet_data", [])
    );
    expect(balanceAfter.toNumber() - balanceBefore.toNumber()).to.be.eq(base)
    expect(balanceAfter.toNumber()).to.be.eq(0)
  });
  it('owner claim unsold Jetton', async () => {
    const launchpadSoldJettonWallet = await getJWalletContract(launchpad.address, soldJetton.address);
    const {balance: balanceBefore} = parseJettonWalletDetails(
      await launchpadSoldJettonWallet.contract.invokeGetMethod("get_wallet_data", [])
    );
    await launchpad.contract.sendInternalMessage(internalMessage({
      from: account1, value: toNano(1),
      body: beginCell()
        .storeUint(2, 64) // op
        .storeUint(333, 64) // query id
        .endCell()
    }));
    const {balance: balanceAfter} = parseJettonWalletDetails(
      await launchpadSoldJettonWallet.contract.invokeGetMethod("get_wallet_data", [])
    );
    expect(balanceAfter.toNumber() - balanceBefore.toNumber()).to.be.eq((cap - base) * exRate / base)
    expect(balanceAfter.toNumber()).to.be.eq(0)
  });
});
