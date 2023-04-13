import BN from "bn.js";
import {Address, toNano} from "ton";
import {internal, OutAction} from "ton-contract-executor";

export function actionToMessage(
  from: Address,
  action: OutAction | undefined,
  messageValue = new BN(1000000000),
  bounce = true
) {
  //@ts-ignore
  const sendMessageAction = action as SendMsgOutAction;

  return internal({
    dest: sendMessageAction.message?.info.dest,
    src: from,
    value: toNano(1000000000),
    bounce,
    body: sendMessageAction.message?.body,
  });
}
