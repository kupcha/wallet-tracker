import crypto from "crypto";
// const crypto = require('crypto');
import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "us-east-2" });
const docClient = DynamoDBDocumentClient.from(client);

// Helper function to format list items for DynamoDB
function formatListForDynamoDB(list) {
  return list.map((item) => ({ N: item.toString() }));
}

// function to store tx data in dynamoDB table
// first check if tx already exists, if so then edit current tx
// if not then create new tx entry
async function updateOrCreateItemNFT(transactionHash, newItem) {
  const getParams = {
    TableName: "Wallet-Tracker",
    Key: {
      transactionHash: { S: transactionHash },
    },
  };

  try {
    // First, try to get the existing item
    const { Item } = await docClient.send(new GetItemCommand(getParams));
    if (Item) {
      // If item exists, update it
      const updateParams = {
        TableName: "Wallet-Tracker",
        Key: {
          transactionHash: { S: transactionHash },
        },
        UpdateExpression:
          "set #all = :all, #ca = :ca, #cAddr = :cAddr, #am = :am, #tid = :tid, #bs = :bs, #nft = :nft",
        ExpressionAttributeNames: {
          "#all": "all",
          "#ca": "createdAt",
          "#cAddr": "contractAddress",
          "#am": "amount",
          "#tid": "tokenID",
          "#bs": "buySell",
          "#nft": "NFTtx",
        },
        ExpressionAttributeValues: {
          ":all": "1",
          ":ca": newItem.createdAt,
          ":cAddr": newItem.contractAddress,
          ":am": newItem.amount.toString(),
          ":tid": formatListForDynamoDB(newItem.tokenIDs),
          ":bs": newItem.transactionType,
          ":nft": true,
        },
      };
      await docClient.send(new UpdateItemCommand(updateParams));
      console.log("Item updated successfully");
    } else {
      // If item does not exist, insert it
      const putParams = {
        TableName: "Wallet-Tracker",
        Item: {
          transactionHash: { S: transactionHash },
          all: { S: "1" },
          createdAt: { S: newItem.createdAt },
          contractAddress: { S: newItem.contractAddress },
          amount: { N: newItem.amount.toString() },
          tokenID: { L: formatListForDynamoDB(newItem.tokenIDs) },
          buySell: { S: newItem.transactionType },
          NFTtx: { BOOL: true },
        },
      };
      await docClient.send(new PutItemCommand(putParams));
      console.log("New item inserted successfully");
    }
  } catch (err) {
    console.error("Error", err);
  }
}

async function updateOrCreateItemETH(
  transactionHash,
  createdAt,
  ethVal,
  asset
) {
  const params = {
    TableName: "Wallet-Tracker",
    Key: {
      transactionHash: { S: transactionHash },
    },
    UpdateExpression: "set #ca = :ca, #ev = :ev, #as = :as",
    ExpressionAttributeNames: {
      "#ca": "createdAt",
      "#ev": "ETHValue",
      "#as": "asset",
    },
    ExpressionAttributeValues: {
      ":ca": createdAt,
      ":ev": ethVal.toString(),
      ":as": asset,
    },
  };

  try {
    await docClient.send(new UpdateItemCommand(params));
    console.log("Transaction updated successfully.");
  } catch (err) {
    console.error("Error updating transaction:", err);
  }
}

export const handler = async (event) => {
  const requestSignature = event.headers["X-Alchemy-Signature"];
  const hmac = crypto.createHmac("sha256", process.env.alchemy_signing_key);
  hmac.update(event.body, "utf8");
  const digest = hmac.digest("hex");

  if (!(requestSignature === digest)) {
    return {
      statusCode: 403,
      body: JSON.stringify({ message: "Forbidden - Invalid signature." }),
    };
  }

  const ADAM_HOTWALLET_ADDRESS = "0x8acfe17a5fe62966a27e579e28c10e936de614f2";
  const transaction = JSON.parse(event.body);
  const transactionActivity = transaction["event"]["activity"];
  const timestamp = transaction["createdAt"];
  let transfersOccurring = transactionActivity.length;
  let buySell = 0;
  let tokenIDs = [];
  let amount = 0;
  let transactionHash = transactionActivity[0]["hash"];
  let current = transactionActivity[0];
  let contractAddress;

  if (
    current["category"] == "token" &&
    (current["erc1155Metadata"] ||
      current["erc721TokenId"] ||
      "erc1155" ||
      "erc721")
  ) {
    for (let i = 0; i < transfersOccurring; i++) {
      current = transactionActivity[i];
      if (current["fromAddress"] == ADAM_HOTWALLET_ADDRESS) buySell--;
      if (current["toAddress"] == ADAM_HOTWALLET_ADDRESS) buySell++;
      contractAddress = current["rawContract"]["address"];
      if (current["erc721TokenId"]) {
        tokenIDs.push(current["erc721TokenId"]);
      }
      if (current["erc1155Metadata"]) {
        amount += current["erc1155Metadata"]["value"];
      }
    }

    let transactionType = "N/A";
    if (buySell < 0) transactionType = "Sell/Transfer Out";
    else if (buySell > 0) transactionType = "Buy/Transfer In";

    const txItem = {
      createdAt: timestamp,
      contractAddress: contractAddress,
      amount: amount,
      tokenIDs: tokenIDs,
      transactionType: transactionType,
    };

    await updateOrCreateItemNFT(transactionHash, txItem);
  } else if (
    current["category"] == "external" ||
    current["category"] == "internal"
  ) {
    const ethVal = current["value"] || 0;
    const asset = current["asset"] || "N/A";
    await updateOrCreateItemETH(transactionHash, timestamp, ethVal, asset);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "SUCCESS" }),
  };
};
