# wallet-tracker

Follow activity of a designated Ethereum address

## Tools & Requirements

- Alchemy Address Activity Webhook, docs viewable @ https://docs.alchemy.com/reference/address-activity-webhook
- AWS Lambda, API Gateway, DynamoDB, docs viewable @ https://docs.aws.amazon.com/
- AWS & Alchemy accounts

## Project Design

- Alchemy Address Activity Webhook triggers a response when the designated address transfers any ETH, ERC20, ERC721, or ERC1155.
- Webhook endpoint is AWS API Gateway, which triggers the AWS Lambda function (see handleTransaction.js)
- Lambda function handles the webhook response, and writes the address activity to an AWS DynamoDB table
- AWS DynamoDB table data is fetched and rendered as seen fit, in my case viewable on a webpage
- Future extensions could create potential Ethereum transactions in response to certain activity
